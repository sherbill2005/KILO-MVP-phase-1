# Kilo Android: User Prerequisites & External Credentials Checklist

This document tracks all external credentials, hardware requirements, accounts, and manual configuration needed from the developer/owner during the lifecycle of the Kilo Android application.

---

## Prerequisites Tracker

| # | Requirement | Phase Needed | Status | Action Required From User |
|---|---|---|---|---|
| **1** | **Android Studio & JDK 17/21** | Phase 1 (Scaffolding) | ⏳ Pending | Install Android Studio & Android SDK 35 (API 35). |
| **2** | **App Package Name (Application ID)** | Phase 1 (Scaffolding) | ⏳ Pending | Choose unique ID (e.g. `com.kilo.fitness`). |
| **3** | **Default In-App Preferences** | Phase 1 (Scaffolding) | ⏳ Pending | Confirm default unit (`kg` / `lb`) & timer (60s). |
| **4** | **Physical Android Device (or Emulator)** | Phase 3 (Audio Testing) | ⏳ Pending | Connect Android 10+ device with mic for DSP testing. |
| **5** | **Offline Speech Language Pack** | Phase 3 (Audio Testing) | ⏳ Pending | Download offline English speech pack in Android settings. |
| **6** | **Google Cloud OAuth Client IDs** | Phase 5 (Auth Screen) | ⏳ Pending | Create Android & Web OAuth Client IDs in GCP Console. |
| **7** | **Privacy Policy URL** | Phase 6 (Play Store) | ⏳ Pending | Publish static privacy policy for `RECORD_AUDIO` permission. |
| **8** | **App Signing Keystore (`.jks`)** | Phase 6 (Play Store) | ⏳ Pending | Generate release upload keystore with alias & password. |
| **9** | **Google Play Console Account** | Phase 6 (Play Store) | ⏳ Pending | Register $25 developer account on Google Play Console. |
| **10** | **Play Store Branding Assets** | Phase 6 (Play Store) | ⏳ Pending | Prepare 512x512 icon, 1024x500 banner, and screenshots. |

---

## Detailed Action Guides

### 1. Android Studio & JDK 17/21 Setup
- Download and install [Android Studio](https://developer.android.com/studio).
- Open SDK Manager: Ensure **Android 15 (API 35)** and **Android SDK Build-Tools** are installed.

### 2. App Package Name
- Standard format: `com.<brand>.<app>` (e.g. `com.kilo.fitness` or `com.zaid.kilo`).
- *Note: Once published to the Play Store, this package identifier is permanent.*

### 3. Google Cloud OAuth 2.0 Client IDs (For Google Sign-In)
- Navigate to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
- **Web Client ID**: Type = *Web application* (Used as `serverClientId` in Android Credential Manager).
- **Android Client ID**: Type = *Android*, Package Name = your chosen package name, SHA-1 = output of `./gradlew signingReport`.

### 4. Offline Speech Pack Download (On Phone)
- On your Android test device:
  1. Open **Settings** $\rightarrow$ **System** (or **Google**).
  2. Tap **Voice / Speech** $\rightarrow$ **Offline Speech Recognition**.
  3. Under the **All** tab, download **English (US)** or **English (India)**.

### 5. Production Release Keystore Generation
Run the following command in PowerShell/Terminal when prompted in Phase 6:
```bash
keytool -genkey -v -keystore kilo-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias kilo-key
```
