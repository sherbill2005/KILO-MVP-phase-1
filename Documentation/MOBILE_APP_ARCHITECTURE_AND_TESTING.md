# Kilo Mobile App: Architecture, Connections & Testing Guide

This document describes the production React Native / Expo mobile application (`apps/mobile`), its offline-first persistence, backend connections, and how to test and build the app.

---

## 1. Tech Stack (`apps/mobile`)

| Layer | Package / Technology | Purpose |
|---|---|---|
| **Framework** | Expo SDK 57 / React Native 0.86 / React 19 | Cross-platform mobile runtime with Continuous Native Generation (CNG) |
| **Language** | TypeScript (`~6.0.3`) | Strict typing across models, contexts, and services |
| **Local Database** | `expo-sqlite` (`~57.0.4`) | Offline-first relational database with WAL mode & versioned migrations |
| **Preferences / Web Fallback** | `@react-native-async-storage/async-storage` | User preferences (`kg`/`lb`, TTS toggle, rest timer) & web storage fallback |
| **Audio Recording** | `expo-audio` (`~57.0.5`) + `expo-file-system` | Pre-warmed `.m4a` voice capture with automatic cache file deletion |
| **Tactile & Voice Receipts** | `expo-haptics` + `expo-speech` | Instant vibration patterns and earbud TTS confirmations |
| **Rest Timer Alerts** | `expo-notifications` (`~57.0.24`) | High-priority OS alarm notifications with in-app haptic/TTS fallback |
| **Testing** | `vitest` (`^3.2.7`) | Unit tests for `FuzzyExerciseMatcher` and `ContextualWorkoutParser` |

---

## 2. Mobile Source Structure

```
apps/mobile/src/
├── components/
│   ├── BottomTabBar.tsx        → 4-tab bottom navigation (Home, Live, Analytics, Settings)
│   ├── GroupedSetTable.tsx     → Exercise group cards, tabular set rows, inline edit modal
│   ├── HeaderBar.tsx           → Top app bar with offline-ready badge & settings trigger
│   ├── PushToTalkFab.tsx       → Hold-to-log microphone FAB + keyboard shortcut modal
│   └── RestTimerBar.tsx        → Floating countdown bar (+30s / Skip)
├── config/
│   └── api.ts                  → Central Worker host & URL resolver (EXPO_PUBLIC_WORKER_URL)
├── context/
│   ├── RestTimerContext.tsx    → Timestamp-based rest timer state + notification scheduling
│   └── WorkoutContext.tsx      → Active session state, smart exercise context, WAL draft auto-save
├── models/
│   ├── exercises.ts            → 32 canonical exercises with muscle groups & gym slang aliases
│   └── workout.ts              → TypeScript interfaces + Brzycki & Epley 1RM calculators
├── navigation/
│   └── RootNavigator.tsx       → State-based navigator across all 6 screens
├── screens/
│   ├── WelcomeScreen.tsx       → Onboarding & guest/Google entry
│   ├── HomeScreen.tsx          → Hero volume stats, draft recovery banner, Mode 1/2 cards, history
│   ├── LiveWorkoutScreen.tsx   → Mode 1: Set-by-set voice logging with smart context & rest timer
│   ├── BatchWorkoutScreen.tsx  → Mode 2: Multi-exercise batch voice ingestion & preview
│   ├── AnalyticsScreen.tsx     → 1RM strength curves, Brzycki/Epley cards, muscle volume breakdown
│   └── SettingsScreen.tsx      → Earbud TTS toggle, default unit (KG/LB), rest timer, cloud sync
├── services/
│   ├── audio/
│   │   ├── audioClient.ts          → Uploads recorded .m4a to /api/ai/parse-audio (8s timeout) + cache cleanup
│   │   ├── audioSessionManager.ts  → Pre-warms mic permissions, Bluetooth routing, AppState interruption guard
│   │   ├── haptics.ts              → Haptic feedback wrappers
│   │   ├── liveAudioSocket.ts      → WebSocket client for /ws/ai/live (PCM16 streaming)
│   │   ├── speechReceipts.ts       → Earbud TTS synthesis wrapper
│   │   └── timerNotification.ts    → OS alarm notification scheduler with safe fallback
│   ├── parser/
│   │   ├── contextualParser.ts     → Local voice/text intent & batch parser
│   │   ├── fuzzyMatcher.ts         → Stop-word pruning + token overlap + Levenshtein matcher
│   │   └── __tests__/parser.test.ts→ 13 unit tests for voice parsing & fuzzy matching
│   └── storage/
│       ├── database.ts             → SQLite init, v1/v2 migrations, WAL draft recovery, SQL stats
│       ├── preferences.ts          → AsyncStorage user settings
│       └── syncService.ts          → Atomic batch sync to /api/workouts/sync-batch
└── theme/
    └── colors.ts               → OLED Gym Dark color tokens (#0B0E14, #00E5FF, #D4FF00)
```

---

## 3. Frontend ↔ Backend Connection Map

All URLs are resolved in `apps/mobile/src/config/api.ts`:
- Default production host: `kilo-worker.sherbill2005.workers.dev`
- Override via environment variable: `EXPO_PUBLIC_WORKER_URL` (automatically selects `http`/`ws` for `localhost` or LAN IPs `192.168.*` / `10.0.*`, and `https`/`wss` for remote hosts).

| Mobile Service | Method & Endpoint | Purpose |
|---|---|---|
| `AudioClient.uploadAudioForParsing` | `POST /api/ai/parse-audio` | Sends Base64 `.m4a` audio + exercise vocabulary; returns structured `{ workout, transcript }` and persists to KV |
| `SyncService.syncPendingWorkouts` | `POST /api/workouts/sync-batch` | Atomically syncs an entire offline `WorkoutSession` (groups + sets) to Cloudflare KV in a single HTTP request |
| `SyncService.fetchRemoteSessions` | `GET /api/sessions` | Lists sessions stored in Cloudflare KV |
| `SyncService.fetchRemoteSessionDetail` | `GET /api/sessions/:id` | Retrieves a hydrated session with all groups and sets |
| `LiveAudioSocketService.parseLiveAudio` | `WSS /ws/ai/live` | Bidirectional WebSocket client for 16kHz PCM16 streaming to Gemini Live |

---

## 4. How to Test the Mobile App

### 4.1 Unit Tests & Type Checking (No Device Required)
From the repository root:
```bash
# Run mobile parser & fuzzy matcher unit tests (13 tests)
npm run mobile:test

# Run Cloudflare Worker validation & route unit tests (16 tests)
npm run worker:test

# Type-check mobile and worker TypeScript
npx --prefix apps/mobile tsc --noEmit
npx --prefix services/api-worker tsc --noEmit
```

### 4.2 Interactive Testing on Physical Phone (Expo Go)
1. Start the Metro bundler in `apps/mobile`:
   ```bash
   cd apps/mobile
   npx expo start --tunnel
   ```
   *(Use `--tunnel` if your phone and PC are on different networks or firewall blocks LAN; `@expo/ngrok` is installed in `devDependencies`.)*
2. Scan the QR code using **Expo Go** on Android or iOS.
3. **Testing Voice & Keyboard Flows**:
   - **Tap the Keyboard icon** next to the `HOLD TO LOG` button in **Live Workout** or **Batch Workout** to test the local `ContextualWorkoutParser` immediately with preset gym chips or custom text (*"Bench press 80 kg for 10"*, *"90 for 8"*, *"same as last"*, *"change weight to 85"*, *"delete last set"*).
   - **Hold the Mic button (>350ms)** and speak to record `.m4a` audio and test end-to-end AI parsing via `POST /api/ai/parse-audio`.
   - **Crash Recovery**: Log a set in Live Workout, force-close the app before finishing, and reopen—the **Unfinished Workout Found** banner will appear on `HomeScreen` to resume or discard the SQLite WAL draft.

### 4.3 Local Backend Worker Testing with Mobile
To point the mobile app at a local Cloudflare Worker instead of `kilo-worker.sherbill2005.workers.dev`:
1. Start the Worker locally on your LAN:
   ```bash
   cd services/api-worker
   npx wrangler dev --ip 0.0.0.0 --port 8787
   ```
2. Start Expo with your machine's LAN IP:
   ```powershell
   $env:EXPO_PUBLIC_WORKER_URL="http://192.168.1.X:8787"
   cd apps/mobile
   npx expo start
   ```

### 4.4 Building Standalone APK via EAS Build
`apps/mobile/eas.json` is pre-configured with three profiles (`development`, `preview`, `production`):
```bash
cd apps/mobile
# Build an installable Android APK for internal testing (includes full native modules)
npx eas-cli@latest build --platform android --profile preview
```

