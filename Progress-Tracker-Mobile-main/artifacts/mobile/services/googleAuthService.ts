import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { logger } from "@/utils/logger";

export function configureGoogleSignIn() {
  try {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
    });
  } catch (err) {
    logger.warn("GoogleAuth", "Failed to configure Google Sign-In", err);
  }
}

export const googleAuthService = {
  async signIn(): Promise<string> {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) {
        throw new Error("No ID token returned from Google");
      }
      return idToken;
    } catch (err: any) {
      logger.error("GoogleAuth", "Sign in failed", err);
      throw new Error(err.message || "Google Sign-In failed or was cancelled.");
    }
  },
  
  async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
    } catch (error) {
      logger.warn("GoogleAuth", "Sign out error", error);
    }
  }
};
