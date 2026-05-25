import { Platform } from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { logger } from "@/utils/logger";

let _googleSignInConfigured = false;

function getGoogleClientIds(): { webClientId: string; iosClientId: string } {
  return {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
  };
}

/**
 * Configure the native Google Sign-In SDK. Must run once before signIn().
 * Called from appBootstrapService at cold start.
 */
export function configureGoogleSignIn(): void {
  if (_googleSignInConfigured) return;

  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    logger.warn("GoogleAuth", "Google Sign-In is only available on iOS and Android.");
    return;
  }

  const { webClientId, iosClientId } = getGoogleClientIds();
  if (!webClientId) {
    logger.warn("GoogleAuth", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing; Google Sign-In disabled.");
    return;
  }

  try {
    GoogleSignin.configure({
      webClientId,
      iosClientId: iosClientId || undefined,
    });
    _googleSignInConfigured = true;
    logger.info("GoogleAuth", "Google Sign-In configured");
  } catch (err) {
    logger.warn("GoogleAuth", "Failed to configure Google Sign-In", err);
  }
}

export function isGoogleSignInConfigured(): boolean {
  return _googleSignInConfigured;
}

function ensureGoogleSignInReady(): void {
  if (!_googleSignInConfigured) {
    const { webClientId } = getGoogleClientIds();
    if (!webClientId) {
      throw new Error(
        "Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.",
      );
    }
    throw new Error(
      "Google Sign-In was not initialized. Restart the app or contact support if this persists.",
    );
  }
}

export const googleAuthService = {
  async signIn(): Promise<string> {
    ensureGoogleSignInReady();

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) {
        throw new Error("No ID token returned from Google");
      }
      return idToken;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google Sign-In failed or was cancelled.";
      logger.error("GoogleAuth", "Sign in failed", err);

      // Native SDK error when configure() was never called
      if (message.includes("apiClient is null") || message.includes("configure()")) {
        throw new Error(
          "Google Sign-In is not ready. Close and reopen the app, then try again.",
        );
      }

      throw new Error(message);
    }
  },

  async signOut(): Promise<void> {
    if (!_googleSignInConfigured) return;
    try {
      await GoogleSignin.signOut();
    } catch (error) {
      logger.warn("GoogleAuth", "Sign out error", error);
    }
  },
};
