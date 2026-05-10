# Running Progress Tracker Mobile Locally

This project is a monorepo consisting of a Node.js/Express SQLite backend and an Expo (React Native) mobile application.

## Prerequisites

Before getting started, make sure you have the following installed on your machine:
- **Node.js** (v18 or newer recommended)
- **pnpm** (Package manager used in this workspace, install via `npm i -g pnpm`)
- **Expo CLI** (Install via `npm i -g expo-cli`)

## 1. Install Dependencies

From the root of the project, run the following command to install dependencies across all workspaces:

```bash
pnpm install
```

> **Note for Windows Users**: The backend relies on `bcrypt` and `better-sqlite3`, which contain native C++ modules. If you see errors about missing `.node` files, you can explicitly rebuild them by running:
> ```bash
> cd backend
> npm rebuild bcrypt better-sqlite3
> ```

## 2. Set Up Environment Variables

You need to configure the environment variables for both the backend and the frontend.

### Backend Config
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in the values:
   - `JWT_SECRET`: A secure random string (e.g., generated via `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `OPENAI_API_KEY`: Your OpenAI API key (required for voice transcription features)

### Frontend (Mobile) Config
1. Navigate to the mobile artifacts directory:
   ```bash
   cd artifacts/mobile
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and set your API base URL:
   - If running an **Android emulator**, set: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001`
   - If using a **physical device** (or web/iOS simulator), set it to your computer's local IP address (e.g., `http://192.168.1.100:3001`) or localhost (`http://localhost:3001`).

## 3. Initialize the Database

The backend uses a local SQLite database that needs to be created and populated with some initial users and tasks.

Run the seed script from the backend directory:
```bash
cd backend
pnpm run seed
```

This will create `data/taskcommand.db` and log the demo accounts you can use to log into the app.

## 4. Start the Application Servers

You will need to run the backend and the mobile app concurrently in separate terminal windows.

### Terminal 1: Start the Backend
```bash
cd backend
pnpm run dev
```
The backend will typically start on port `3001`.

### Terminal 2: Start the Mobile App
```bash
cd artifacts/mobile
pnpm run dev
```

This will launch the Expo Metro Bundler. From the Expo terminal interface, you can press:
- `a` to open on an Android emulator
- `i` to open on an iOS simulator
- `w` to open in a web browser
- Or scan the QR code using the Expo Go app on your physical iOS/Android device.

## Troubleshooting

### Android Emulator Fails to Start (ADB / SDK Not Found)
If you see errors like:
- `Failed to resolve the Android SDK path`
- `'adb' is not recognized as an internal or external command`

This means Expo cannot find your Android development tools. To fix this:

1. **Ensure Android Studio is Installed:** Download and install Android Studio. During setup, make sure to install the "Android SDK" and an "Android Virtual Device (AVD)".
2. **Set `ANDROID_HOME` Variable:**
   - Open the Start Search, type "Environment Variables", and select **Edit the system environment variables**.
   - Click **Environment Variables...**.
   - Under "User variables", click **New**.
   - Set Variable name to `ANDROID_HOME` and Variable value to your SDK path (usually `C:\Users\YOUR_USERNAME\AppData\Local\Android\Sdk`).
3. **Add ADB to your PATH:**
   - In the same "Environment Variables" window, find the `Path` variable under "User variables" and click **Edit**.
   - Click **New** and add: `%ANDROID_HOME%\platform-tools`
   - Click **New** and add: `%ANDROID_HOME%\emulator`
   - Click **New** and add: `%ANDROID_HOME%\tools\bin`
   - Click **OK** to save everything.
4. **Restart Terminal:** You **must** completely close and reopen your VS Code / Command Prompt terminal for the new environment variables to take effect before running `pnpm run dev` again.

### Common Runtime Issues
- **Token Expired / 401 Errors**: If you encounter session errors while testing, try logging out and logging back in. The system uses a 15-minute access token combined with a 30-day refresh token.
- **Microphone / Voice Errors on Web**: If testing voice transcription on the web, ensure you are accessing the app over `localhost` or `https://`, otherwise browsers block microphone access.
- **Network Request Failed**: If the mobile app fails to connect to the backend, double-check your `EXPO_PUBLIC_API_BASE_URL` in the mobile `.env` file. A physical phone needs your machine's actual LAN IP address (e.g., `192.168.x.x`), not `localhost`.
