# Kilo: Product & Architecture Master Specification

---

## 1. Product Overview & Value Proposition

**KILO** is an ultra-low-friction, voice-first workout tracking application designed for gym environments.

### Core Value Proposition
Eliminate manual typing and data entry in high-friction environments (gyms) using a voice-first, **"Zero-Touch"** interaction model where **Latency is the Product**. The lifter logs and corrects sets hands-free with immediate tactile (haptic) and optional earbud Text-to-Speech (TTS) receipts.

---

## 2. Monorepo Architecture

```
Kilo/
├── apps/
│   ├── mobile/         → Production Mobile App (Expo SDK 57 / React Native 0.86 / TypeScript)
│   └── pwa/            → Phase 1 Web PWA Prototype (Vanilla JS + AudioWorklet)
├── services/
│   └── api-worker/     → Cloudflare Worker REST API + Gemini AI / Live WebSocket Proxy
├── packages/
│   └── shared/         → Shared TypeScript workout data models (Session, Group, Set)
└── Documentation/      → Consolidated product, architecture, mobile, UI, and marketing docs
```

---

## 3. Core Features & Specifications (PRD)

### 3.1 Audio & Environmental Resilience
- **Push-to-Talk (Hold-to-Log) Activation Gate**: Microphone only records while the floating action button (FAB) is intentionally held (>350ms), eliminating ambient gym noise, music, and plate drops.
- **Pre-Warmed Audio Session & Focus Safety**: `AudioSessionManager` pre-warms `expo-audio`, routes through connected Bluetooth headsets (`duckOthers`), and listens to `AppState` transitions to safely abort and clean up recordings if interrupted by phone calls or OS lock events.
- **Automatic Disk Cache Hygiene**: Recorded `.m4a` clips are unlinked immediately after Base64 encoding, and `AudioClient.cleanStaleAudioCache()` sweeps orphaned files on startup.

### 3.2 The Intelligence Layer
- **Two-Path Voice Ingestion**:
  1. **Cloud AI Multimodal Parsing (`POST /api/ai/parse-audio`)**: Sends recorded `.m4a` audio to the Cloudflare Worker (with an 8-second `AbortController` circuit breaker), which calls Gemini Flash (`generateContent` with structured JSON output) and persists parsed sets to Cloudflare KV.
  2. **On-Device Contextual & Fuzzy Parser (`ContextualWorkoutParser` + `FuzzyExerciseMatcher`)**: Instant 0ms local parser handling voice shortcuts, typed commands, and offline fallback.
- **Closed-Taxonomy + Custom Exercise Matcher**: Hybrid Token-Overlap + Levenshtein similarity ($\ge 0.65$) matcher against 32 canonical exercises (and aliases) plus user-created custom exercises stored in SQLite (`custom_exercises`).
- **Smart Context Memory (Live Mode)**: Tracks the active exercise and last logged weight/reps across consecutive sets so subsequent sets only require numbers (*"90 for 8"*) or relative commands (*"same weight, same reps"*, *"same as last"*).
- **Analytics & 1RM Engine**: Real-time 1RM estimation using **Brzycki** ($\text{reps} \le 10$) and **Epley** ($\text{reps} > 10$) formulas, plus muscle group volume distribution.

### 3.3 User Interaction & Feedback Flows
- **Dual Workout Modes**:
  - **Mode 1 — Live Interactive Workout**: Set-by-set voice/touch logging, smart exercise context, and automatic 60-second rest timer.
  - **Mode 2 — Batch Workout Ingestion**: Speak an entire completed multi-exercise workout in one take (*"Bench press 3 sets of 10 at 80 kg, then Squat 100 kg for 5 reps"*), preview in an editable table, and save.
- **Instant Correction Loops (Voice & Touch CRUD)**:
  - Voice: *"Change weight to 85"*, *"Update reps to 12"*, *"Delete last set"*, *"Undo"*, *"Finish workout"*.
  - Touch: Inline set row editing and deletion in `GroupedSetTable`.
- **Auditory & Tactile Confirmation Receipts**:
  - Haptic confirmation via `expo-haptics` (`HapticsService`).
  - Optional earbud voice receipts via `expo-speech` (`SpeechReceiptsService`, e.g., *"Bench Press, 80 kg for 10 reps"*).
- **Resilient Rest Timer**: Background-safe countdown using target timestamps (`timerTargetEnd`), scheduled OS alarm notifications (`expo-notifications`), and automatic in-app haptic/TTS fallback.

---

## 4. Database Schema

### 4.1 Mobile On-Device Schema (`expo-sqlite` — `kilo_offline.db`)
Managed via `PRAGMA user_version` migrations in `apps/mobile/src/services/storage/database.ts` (with `AsyncStorage` fallback on web):

```sql
-- Migration v1: Core Workout Tables + WAL Draft Recovery
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  workout_date TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  mode TEXT NOT NULL, -- 'LIVE' | 'BATCH'
  is_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workout_groups (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  target_sets INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  weight_value REAL NOT NULL,
  weight_unit TEXT NOT NULL, -- 'kg' | 'lb'
  reps INTEGER NOT NULL,
  is_corrected INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(group_id) REFERENCES workout_groups(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0
);

-- Write-Ahead Log (WAL) for active session crash recovery
CREATE TABLE IF NOT EXISTS active_draft_session (
  id TEXT PRIMARY KEY NOT NULL,
  session_data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Migration v2: Dynamic Custom Exercise Dictionary
CREATE TABLE IF NOT EXISTS custom_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
```

### 4.2 Cloudflare KV Document Models (`KILO_KV`)
- `session:{session_id}` $\rightarrow$ `{ id, user_id, workout_date, group_ids: [], set_ids: [], finished: boolean, finished_at?: string }`
- `group:{group_id}` $\rightarrow$ `{ id, session_id, exercise_name, set_ids: [], created_at }`
- `set:{set_id}` $\rightarrow$ `{ id, session_id, group_id, group_index, exercise_name, weight_value, weight_unit, reps, corrected, created_at }`

---

## 5. Backend API Specification (`services/api-worker`)

### 5.1 REST Endpoints

#### 1. Health Check
- **Endpoint**: `GET /health` or `GET /`
- **Response** (`200 OK`):
  ```json
  {
    "status": "healthy",
    "kv": true,
    "hasGeminiKey": true,
    "model": "gemini-3-flash-preview"
  }
  ```

#### 2. Parse Recorded Audio via Gemini AI
- **Endpoint**: `POST /api/ai/parse-audio`
- **Request Body**:
  ```json
  {
    "audio_base64": "<base64_encoded_m4a>",
    "mime_type": "audio/mp4",
    "exercises": ["Bench Press", "Squat"],
    "session_id": "live_1774200000000"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "ok": true,
    "transcript": "Bench press 80 kilos for 10 reps",
    "workout": [
      {
        "exercise": "Bench Press",
        "sets": [{ "weight": 80, "unit": "kg", "reps": 10 }]
      }
    ],
    "group_ids": ["..."],
    "set_ids": ["..."]
  }
  ```

#### 3. Atomic Batch Workout Sync
- **Endpoint**: `POST /api/workouts/sync-batch`
- **Request Body**: `{ "session": WorkoutSession }` (accepts camelCase from mobile SQLite or snake_case)
- **Response** (`200 OK`):
  ```json
  { "ok": true, "session_id": "live_1774200000000", "set_count": 4 }
  ```

#### 4. Create Workout Session
- **Endpoint**: `POST /api/sessions`
- **Request Body**: `{ "user_id": "usr_123", "workout_date": "2026-10-28" }`
- **Response** (`200 OK`): `{ "session_id": "<uuid>" }`

#### 5. List Workout Sessions
- **Endpoint**: `GET /api/sessions?user_id={user_id}`
- **Response** (`200 OK`): `{ "sessions": [ ... ] }`

#### 6. Get Hydrated Workout Session
- **Endpoint**: `GET /api/sessions/{session_id}`
- **Response** (`200 OK`): `{ ...session, "groups": [ ... ], "sets": [ ... ] }`

#### 7. Log Set or Batch of Sets
- **Endpoint**: `POST /api/sessions/{session_id}/sets`
- **Request Body**:
  ```json
  {
    "exercise_name": "Bench Press",
    "sets": [
      { "weight_value": 80, "weight_unit": "kg", "reps": 10 }
    ]
  }
  ```
- **Response** (`200 OK`): `{ "set_id": "...", "group_id": "..." }` (single) or `{ "group_id": "...", "set_ids": ["..."] }` (batch)

#### 8. Finish Workout Session
- **Endpoint**: `POST /api/sessions/{session_id}/finish`
- **Request Body** (Optional): `{ "finished_at": "2026-10-28T19:30:00.000Z" }`
- **Response** (`200 OK`): `{ "ok": true, "finished_at": "..." }`

#### 9. Update / Correct Set
- **Endpoint**: `PATCH /api/sets/{set_id}`
- **Request Body**: `{ "weight_value": 82.5, "reps": 10, "exercise_name": "Incline Bench Press" }`
- **Response** (`200 OK`): `{ "ok": true }`

### 5.2 WebSocket Streaming Endpoint (`GET /ws/ai/live`)
- **Protocol**:
  - Client $\rightarrow$ Worker:
    - `{ "type": "session", "session_id": "..." }`
    - `{ "type": "context", "exercises": ["..."] }`
    - `{ "type": "audio", "data": "<base64_pcm16>" }` or binary `ArrayBuffer` (16kHz 16-bit mono PCM)
    - `{ "type": "stop" }`
  - Worker $\leftrightarrow$ Gemini Live API (`BidiGenerateContent` with `gemini-2.5-flash-native-audio-preview-12-2025`)
  - Worker $\rightarrow$ Client:
    - `{ "type": "status", "value": "connected" | "listening" | "processing" | "error" }`
    - `{ "type": "result", "workout": [...], "group_ids": [...], "set_ids": [...], "transcript": "..." }`
