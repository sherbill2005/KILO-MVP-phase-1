# Expo & React Native Rules for Kilo Mobile App

1. **Package Installation**:
   - ALWAYS use `npx expo install <package>` instead of bare `npm install` or `yarn add` when installing packages in `apps/mobile/`. This ensures compatibility with Expo SDK 57.
   - Do not install conflicting native packages without verifying Expo SDK compatibility.

2. **Native Code & Prebuild**:
   - Never manually edit or commit `ios/` or `android/` folders unless explicit custom native modifications are required. Use Continuous Native Generation (CNG) via `app.json` configuration and config plugins.
   - Development builds: Use Expo Go for rapid prototyping without emulators, or `npx expo run:android` / EAS Build when custom native code is introduced.

3. **Offline-First Persistence**:
   - Workout data, sets, exercise taxonomy, and logs must be stored locally on the device using `expo-sqlite` and `@react-native-async-storage/async-storage`.
   - Never block the UI thread waiting for network roundtrips. Zero-touch latency is the priority.

4. **Linting & Validation**:
   - Always run `npx expo lint` and `npx tsc --noEmit` before concluding work on mobile code.
