# Progress Tracker (Mobile)

A mobile-first progress tracker built with **Expo (React Native)**. It includes task + team management screens, a calendar view, and optional API/server-side pieces in the same monorepo.

## Monorepo layout

- `artifacts/mobile` — Expo React Native mobile app (navigation via React Navigation; configured with expo-router)
- `artifacts/api-server` — Express API server (mounted under `/api`)
- `artifacts/mockup-sandbox` — Vite-based UI sandbox
- `lib/*` — shared libraries (OpenAPI spec + generated clients, Zod types, DB package)

## Prerequisites

- Node.js (recent LTS recommended)
- `pnpm` (this repo enforces pnpm during install)
- For running the mobile app:
  - Expo Go on your phone **or** Android Studio / Xcode simulator
- For running the API with a database (optional): PostgreSQL

## Install

From the repo root:

```bash
pnpm install
```

## Quick start (recommended)

### 1) Run the mobile app

```bash
pnpm --filter @workspace/mobile run dev
```

Expo will print a QR code + URLs.

- Press `a` (Android) / `i` (iOS) in the Expo CLI, or scan the QR code in Expo Go.

**Default login** (from the seeded in-app data):
- Email: `admin@taskcommand.io`
- Password: `admin123`

Note: the mobile app persists data locally using `AsyncStorage`, so it can be used without the API server.

### 2) (Optional) Run the API server

```bash
pnpm --filter @workspace/api-server run dev
```

By default the dev script sets `PORT=3000`.

Health checks:
- http://localhost:3000/api/health
- http://localhost:3000/api/healthz

## Build an Android APK

This repo uses **Expo (React Native)** in `artifacts/mobile`. There are two supported ways to generate an APK:

### Option A) EAS Build (recommended)

This builds in the cloud and outputs a download link for an `.apk`.

From the repo root:

```bash
cd artifacts/mobile
pnpm dlx eas-cli login
pnpm dlx eas-cli init
pnpm dlx eas-cli build -p android --profile preview
```

Notes:
- The `preview` profile is configured to build an **APK** (see `artifacts/mobile/eas.json`).
- `eas init` will add an Expo project id into the Expo config when you run it.

### Option B) Local build (Android Studio / Gradle)

This generates the native Android project locally and builds the APK via Gradle.

Prerequisites:
- Android Studio installed (SDK + platform tools)
- JDK 17 (recommended for current React Native)

If Gradle fails with **“SDK location not found”**, either:
- Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to your Android SDK path, or
- Create `artifacts/mobile/android/local.properties` with:

```properties
sdk.dir=C:/Users/<YOUR_USER>/AppData/Local/Android/Sdk
```

From the repo root:

```bash
pnpm --filter @workspace/mobile exec expo prebuild --platform android
```

That command generates:
- `artifacts/mobile/android/app/src/main/AndroidManifest.xml`
- `artifacts/mobile/android/build.gradle` and related Gradle files

Then build the APK:

```bash
cd artifacts/mobile/android
gradlew.bat assembleRelease
```

Run on an emulator/device using the React Native CLI (builds + installs a **debug** APK):

```bash
cd artifacts/mobile
npx react-native run-android
```

If you want to build/install the **release** variant on a device/emulator:

```bash
cd artifacts/mobile
npx react-native run-android --mode release
```

Debug APK output path (after a successful build):
- `artifacts/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

APK output path:
- `artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk`

If you only need a debug APK:

```bash
gradlew.bat assembleDebug
```

## Running other packages

### Mockup sandbox (Vite)

```bash
pnpm --filter @workspace/mockup-sandbox run dev
```

Defaults:
- URL: http://localhost:5173/
- If you need a different port/base path, set `PORT` and/or `BASE_PATH`.

## Environment variables

### API server (`artifacts/api-server/.env`)

The API server will load a local `.env` file from its working directory (when present).

Common variables:

```bash
# artifacts/api-server/.env
PORT=3000
# DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/progress_tracker
```

If you don’t need database-backed routes, you can start the API server just for basic routes like health checks.

## Useful repo commands

From the repo root:

- Typecheck everything:
  ```bash
  pnpm run typecheck
  ```
- Build everything:
  ```bash
  pnpm run build
  ```

## Troubleshooting

- **Install fails with “Use pnpm instead”**: run `pnpm install` (not `npm install`).
- **Windows native build errors (Rollup/Tailwind/LightningCSS)**: this repo pins the Windows-native packages needed by the mockup sandbox. If you still hit missing-native-module errors (often after switching Node versions), try a clean reinstall.

  PowerShell (from repo root):
  ```powershell
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  Get-ChildItem -Recurse -Directory -Filter node_modules | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  pnpm install
  ```

  Or a lighter-weight option:
  ```bash
  pnpm install --force
  ```
- **PostgreSQL prompts for a password / DB connection fails**: set a working `DATABASE_URL` (or configure local Postgres auth). The mobile app does not require Postgres.
