/**
 * WhatsAppIntegrationProvider.tsx
 *
 * Global notification listener for the "Forwarder Strategy".
 *
 * This provider MUST be mounted high in the component tree (inside _layout.tsx)
 * so it captures notification taps in ALL app lifecycle states:
 *
 *  ┌─────────────────┬────────────────────────────────────────────────────┐
 *  │ App State       │ Handler                                            │
 *  ├─────────────────┼────────────────────────────────────────────────────┤
 *  │ Foreground      │ addNotificationResponseReceivedListener             │
 *  │ Background      │ addNotificationResponseReceivedListener             │
 *  │ Killed (closed) │ useLastNotificationResponse() — reads on cold boot  │
 *  └─────────────────┴────────────────────────────────────────────────────┘
 *
 * Install dependencies (if not already present):
 *   pnpm add expo-notifications expo-linking  (inside /artifacts/mobile)
 *
 * Then register the notification handler in your app entry point:
 *   Notifications.setNotificationHandler({ ... })   ← see bottom of file.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import {
  Alert,
  Linking,
  Platform,
} from "react-native";
import * as Notifications from "expo-notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of the `data` object embedded in the push notification payload. */
interface WAForwardNotificationData {
  actionType: "OPEN_WHATSAPP_FORWARD";
  /** Recipient phone in E.164 format, e.g. "+919876543210" */
  phone: string;
  /** Pre-formatted WhatsApp message text (with *bold* markers) */
  messageText: string;
  /** Task ID for optional deduplication */
  taskId?: string;
  /** Task title for optional display */
  taskTitle?: string;
  /** Assignee name for optional display */
  assigneeName?: string;
}

interface WhatsAppIntegrationContextValue {
  /** Manually trigger the WA forward flow (useful for testing or retry). */
  openWhatsApp: (phone: string, messageText: string) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WhatsAppIntegrationContext = createContext<WhatsAppIntegrationContextValue | null>(null);

export function useWhatsAppIntegration(): WhatsAppIntegrationContextValue {
  const ctx = useContext(WhatsAppIntegrationContext);
  if (!ctx) {
    throw new Error("useWhatsAppIntegration must be used within WhatsAppIntegrationProvider");
  }
  return ctx;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Runtime type-guard to verify that the notification data contains
 * all fields required for the WA Forward flow.
 *
 * All values arrive as strings from the Expo/FCM layer.
 */
function isWAForwardPayload(data: unknown): data is WAForwardNotificationData {
  if (!data || typeof data !== "object") return false;

  const d = data as Record<string, unknown>;
  return (
    d.actionType === "OPEN_WHATSAPP_FORWARD" &&
    typeof d.phone === "string" &&
    d.phone.length > 0 &&
    typeof d.messageText === "string" &&
    d.messageText.length > 0
  );
}

// ─── Intent Trigger ───────────────────────────────────────────────────────────

/**
 * Constructs and opens the WhatsApp deep-link intent.
 *
 * URL scheme (Android & iOS):
 *   whatsapp://send?phone=<E.164 without +>&text=<URL-encoded message>
 *
 * The leading "+" is stripped because WhatsApp's URL scheme does not
 * accept it — only the raw digits + country code are valid.
 *
 * @param phone        - E.164 phone number, e.g. "+919876543210"
 * @param messageText  - Plain-text (or WA-formatted) message body
 */
async function triggerWhatsAppIntent(phone: string, messageText: string): Promise<void> {
  // Strip the "+" prefix if present — WA deep link requires bare digits
  const normalizedPhone = phone.startsWith("+") ? phone.slice(1) : phone;

  // URL-encode the message so special characters (newlines, spaces, emojis)
  // survive the deep-link transport
  const encodedText = encodeURIComponent(messageText);

  const whatsappUrl = `whatsapp://send?phone=${normalizedPhone}&text=${encodedText}`;

  // ── Safety check: WhatsApp installed? ────────────────────────────────────
  const canOpen = await Linking.canOpenURL(whatsappUrl);

  if (!canOpen) {
    Alert.alert(
      "WhatsApp Not Found",
      "WhatsApp does not appear to be installed on this device. " +
      "Please install WhatsApp and try again, or forward the task details manually.",
      [
        {
          text: "Open Play Store",
          onPress: () => {
            Linking.openURL(
              "https://play.google.com/store/apps/details?id=com.whatsapp"
            ).catch(() => {
              // Silently ignore if Play Store cannot be opened either
            });
          },
        },
        { text: "Dismiss", style: "cancel" },
      ],
    );
    return;
  }

  // ── Open WhatsApp ─────────────────────────────────────────────────────────
  try {
    await Linking.openURL(whatsappUrl);
    console.log(
      `[WhatsAppIntegration] ✅ Opened WhatsApp for phone: ${normalizedPhone}`
    );
  } catch (err) {
    console.error("[WhatsAppIntegration] Failed to open WhatsApp URL:", err);
    Alert.alert(
      "Could Not Open WhatsApp",
      "An unexpected error occurred while trying to open WhatsApp. " +
      "Please try again.",
      [{ text: "OK" }],
    );
  }
}

// ─── Notification Handler (call ONCE at module level / app entry) ─────────────

/**
 * ⚠️  IMPORTANT: Call this ONCE at the app entry point (e.g., top of _layout.tsx
 *    or in a dedicated notifications.ts bootstrap file) — NOT inside a component.
 *
 *    Controls how a notification is displayed when the app is in the FOREGROUND.
 *    For the Forwarder Strategy, we still show the banner so the Admin can
 *    explicitly tap it (rather than auto-opening WhatsApp without consent).
 */
export function registerNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // iOS-only: controls the banner priority when app is active
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
}

// ─── Android Channel Setup ────────────────────────────────────────────────────

/**
 * Creates the Android notification channel required by the backend payload.
 *
 * The `channelId: "task-assignments"` in the server payload maps to this.
 * Must be called before any notifications arrive (ideally in app bootstrap).
 */
export async function setupAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("task-assignments", {
    name: "Task Assignments",
    description: "Notifications for new task assignments requiring WhatsApp forwarding",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#4F46E5", // Indigo accent matching app theme
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
}

// ─── Provider Component ───────────────────────────────────────────────────────

/**
 * WhatsAppIntegrationProvider
 *
 * Mount this inside your root layout, INSIDE the navigation container but
 * OUTSIDE any specific screen so it persists across all routes.
 *
 * Example (_layout.tsx):
 * ```tsx
 * <AppProvider>
 *   <WhatsAppIntegrationProvider>
 *     <GestureHandlerRootView style={{ flex: 1 }}>
 *       <RootStack />
 *     </GestureHandlerRootView>
 *   </WhatsAppIntegrationProvider>
 * </AppProvider>
 * ```
 */
export function WhatsAppIntegrationProvider({ children }: PropsWithChildren) {
  /**
   * Track the last-processed notification ID to prevent double-firing.
   *
   * Why this matters:
   *  - `useLastNotificationResponse` fires on mount (killed state).
   *  - `addNotificationResponseReceivedListener` fires on background tap.
   *  - Both can fire for the SAME notification if the app was backgrounded
   *    then foregrounded — the ref prevents handling it twice.
   */
  const lastHandledNotificationId = useRef<string | null>(null);

  // ── Core handler ───────────────────────────────────────────────────────────

  const handleNotificationResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const notificationId = response.notification.request.identifier;

      // Deduplication guard
      if (lastHandledNotificationId.current === notificationId) {
        console.log(
          `[WhatsAppIntegration] Skipping duplicate notification: ${notificationId}`
        );
        return;
      }

      const rawData = response.notification.request.content.data;

      if (!isWAForwardPayload(rawData)) {
        // Not a WA forward notification — ignore (other notification types may exist)
        return;
      }

      // Mark as handled BEFORE the async operation to prevent re-entry
      lastHandledNotificationId.current = notificationId;

      console.log(
        `[WhatsAppIntegration] 📲 WA Forward action triggered. ` +
        `Task: ${rawData.taskId ?? "unknown"} | Phone: ${rawData.phone}`
      );

      await triggerWhatsAppIntent(rawData.phone, rawData.messageText);
    },
    [],
  );

  // ── KILLED STATE: useLastNotificationResponse ─────────────────────────────
  // When the app is completely closed and the user taps a notification,
  // Expo stores the response. On the next cold boot, this hook returns it.
  // It is `null` if the app was launched normally (not via notification tap).
  //
  // NOTE: On some Android builds with mismatched expo-notifications versions,
  // `useLastNotificationResponse` may throw because the native method
  // `getLastNotificationResponseAsync` is unavailable. We guard against this
  // by catching and falling back to null.
  let lastNotificationResponse: Notifications.NotificationResponse | null | undefined = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    lastNotificationResponse = Notifications.useLastNotificationResponse();
  } catch (err) {
    console.warn(
      "[WhatsAppIntegration] useLastNotificationResponse unavailable on this platform — skipping cold-boot handler.",
      err,
    );
  }

  useEffect(() => {
    if (lastNotificationResponse) {
      console.log(
        "[WhatsAppIntegration] Cold boot — processing last notification response."
      );
      handleNotificationResponse(lastNotificationResponse);
    }
  }, [lastNotificationResponse, handleNotificationResponse]);

  // ── FOREGROUND / BACKGROUND STATE: event listener ─────────────────────────
  // This listener fires when the user taps a notification while the app is
  // running in either the foreground or background.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log(
          "[WhatsAppIntegration] Live notification tap received."
        );
        handleNotificationResponse(response);
      },
    );

    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);

  // ── Android channel setup (idempotent) ────────────────────────────────────
  useEffect(() => {
    setupAndroidNotificationChannel().catch((err) =>
      console.error("[WhatsAppIntegration] Channel setup failed:", err)
    );
  }, []);

  // ── Context value (exposed for manual triggers / testing) ─────────────────
  const contextValue: WhatsAppIntegrationContextValue = {
    openWhatsApp: triggerWhatsAppIntent,
  };

  return (
    <WhatsAppIntegrationContext.Provider value={contextValue}>
      {children}
    </WhatsAppIntegrationContext.Provider>
  );
}
