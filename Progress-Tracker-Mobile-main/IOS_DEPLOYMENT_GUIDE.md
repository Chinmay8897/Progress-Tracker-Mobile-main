# iOS Production Deployment & Compatibility Guide

This document outlines the iOS-specific hardening applied to the TaskCommand mobile app to ensure it works identically to Android without crashing, missing permissions, or suffering from network failures.

## 1. Modified Files List & iOS-Specific Changes
The following files were audited and updated to achieve seamless cross-platform compliance:

* **`app.json`** 
  * Added `ITSAppUsesNonExemptEncryption: false` to allow the app to pass Apple's export compliance during App Store submission without needing manual declaration.
  * Added `NSSpeechRecognitionUsageDescription` and enhanced `NSMicrophoneUsageDescription` to prevent instant native crashes when requesting audio permissions.
  * Added `LSApplicationQueriesSchemes: ["whatsapp"]` to whitelist the WhatsApp intent. Without this, iOS strictly blocks `Linking.canOpenURL` queries for security reasons.

* **`eas.json`**
  * Added an `ios` profile matrix for `preview` (Simulator), `production` (M1 Cloud Workers), and `submit` (Apple Developer identifiers) so you can push directly to TestFlight via CLI.

* **`utils/config.ts`**
  * Fully stripped the Android emulator-only `10.0.2.2` hack in favor of directly returning the production Render HTTPS backend if `EXPO_PUBLIC_API_BASE_URL` is omitted. iOS simulators can reach `localhost` directly anyway, but production enforces `HTTPS`.

* **`services/whatsappService.ts` & `utils/whatsapp.ts`**
  * Implemented an advanced `canOpenURL` fallback strategy. Instead of assuming the intent will succeed, the iOS layer explicitly tries to ping the `whatsapp://` scheme first, and gracefully falls back to `https://wa.me/` via Safari if the native app is uninstalled.

## 2. Required Apple Developer Steps

Before you can build for TestFlight or the App Store, you must complete the following in your [Apple Developer Account](https://developer.apple.com/):

1. **Register the App ID**: Go to *Certificates, Identifiers & Profiles* -> *Identifiers* and create a new App ID matching `com.taskcommand.mobile`.
2. **Enable Push Notifications**: While creating the App ID, ensure the *Push Notifications* capability is checked.
3. **Generate an APNs Key**: Go to *Keys*, create a new key with Apple Push Notification service (APNs) enabled. Download the `.p8` file. You will upload this to the Expo credentials dashboard later.
4. **Accept Agreements**: Log in to [App Store Connect](https://appstoreconnect.apple.com/) and accept any pending Paid Apps or Free Apps agreements.

## 3. EAS Build Instructions

To generate your iOS builds using Expo Application Services:

**For iOS Simulator (Local Testing):**
```bash
eas build --profile preview --platform ios
```
*This produces a `.tar.gz` containing the `.app` file which can be dragged directly onto your macOS Simulator.*

**For Production (App Store / TestFlight):**
```bash
eas build --profile production --platform ios
```
*Expo will prompt you to log into your Apple Developer account. It will automatically handle Certificates, Provisioning Profiles, and App ID creation.*

## 4. TestFlight Deployment Steps

Once you have a successful production build (`.ipa`), you can deploy it to TestFlight:

1. **Submit via EAS**:
   ```bash
   eas submit -p ios --profile production
   ```
2. **App Store Connect**:
   * Go to your app in App Store Connect.
   * Navigate to the **TestFlight** tab.
   * You'll see your build "Processing" (this usually takes 10-15 minutes).
3. **Compliance**:
   * Since we added `ITSAppUsesNonExemptEncryption` to your `app.json`, it should automatically skip the encryption prompt.
4. **Internal Testing**: Add internal users by email to grant them instant access to the app via the TestFlight iOS app.

## 5. App Store Deployment Notes

1. **App Review**: Voice recording requires clear user disclosure. Our `app.json` explicitly states: *"TaskCommand needs microphone access to securely record voice commands for AI transcription."* Apple reviewers are very strict about these strings accurately describing *why* the mic is needed.
2. **Cold Start & Rejections**: Because we implemented the `ColdStartOverlay` previously, Apple Reviewers will not assume your app is "frozen" or "broken" if Render is sleeping. They will see the professional loading screen and wait.
3. **Privacy Policy**: Apple requires a valid Privacy Policy URL on your App Store listing since you request Microphone and Push Notification permissions. Ensure you have a static site hosting this policy.
