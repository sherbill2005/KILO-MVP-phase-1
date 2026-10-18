# Kilo Phase 2: Native Android (Kotlin + Jetpack Compose) Production Plan

---

## 1. Executive Summary & Core Requirements

Kilo Mobile is a high-performance, voice-first workout tracker built natively in Kotlin with Jetpack Compose. The core objective is **zero-friction, near-instant (<100ms) gym logging** with **complete gym noise immunity**, **100% offline-first reliability**, and **zero operating server cost for 100+ daily active users**.

### Key Architectural Pillars
1. **Push-to-Talk (Hold-to-Talk)**: Mic is only active during intentional user speech, cutting ambient gym noise, music, and dropped weight clangs.
2. **Hardware DSP Noise Suppression**: Leverages Android's native `NoiseSuppressor` and `AutomaticGainControl` APIs.
3. **Closed Exercise Taxonomy**: Strict matching against 35 standard exercises to guarantee 0% AI hallucinations.
4. **Smart Contextual State Machine**: Tracks active exercise context across consecutive sets (*"same weight, same reps"* or *"80 kg for 10"*).
5. **Dual Workout Modes**:
   - **Mode 1: Start Live Workout** (Interactive, set-by-set with smart context & 60s auto-rest timer).
   - **Mode 2: Log Whole Workout in One Go** (Batch multi-exercise voice ingestion, no rest timer).
6. **Full CRUD by Voice and Touch**: Edit, update, delete, and correct sets via voice commands or tactile gestures.
7. **Offline-First with Background Sync**: Local Room SQLite database with WorkManager synchronization to Cloudflare D1/KV.
8. **Configurable Earbud Audio Receipts**: Subtle haptics by default; optional snappy Text-to-Speech (TTS) confirmation.

---

## 2. Tech Stack & Library Specifications

| Layer | Technology | Justification |
|---|---|---|
| **Language** | Kotlin 2.0+ (K2 compiler) | Modern, concise, null-safe, coroutine-native. |
| **UI Framework** | Jetpack Compose (Material 3) | Declarative, smooth 120Hz rendering, state-driven UI. |
| **Architecture** | Clean Architecture + MVI / UDF | Unidirectional Data Flow for predictable state. |
| **Local Database** | Room (SQLite) + SQLCipher | Offline persistence, ACID transactions, reactive Flow queries. |
| **Preferences** | Jetpack DataStore (Proto/Preferences) | Coroutine-safe user settings (TTS toggle, default units). |
| **Audio Capture** | Android `AudioRecord` + Hardware DSP | Direct PCM streaming with `android.media.audiofx.NoiseSuppressor`. |
| **Speech-to-Text** | Android `SpeechRecognizer` (Offline Language Pack) | 0ms network latency, 100% free, runs on device. |
| **Fallback NLP** | Cloudflare Worker + Gemini 1.5 Flash (Text-only) | Free-tier fallback for ambiguous / multilingual slang. |
| **Auth** | Google Credential Manager API | Modern 1-tap Google Sign-In with auto-token refresh. |
| **Background Sync** | Android `WorkManager` (Exponential Backoff) | Battery-efficient, network-aware background sync. |
| **TTS Engine** | Android Native `TextToSpeech` API | Snappy, low-latency earbud receipts with pitch/speed control. |
| **Haptics** | `VibratorManager` / `HapticFeedbackConstants` | Custom tick & confirmation waveforms. |

---

## 3. System Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                            │
│  Jetpack Compose Screens │ ViewModels (StateFlow / MVI Intent Handler) │
│  - Dashboard & History   │ - Live Workout Mode                         │
│  - Batch Workout Mode    │ - Analytics & 1RM Estimator                 │
│  - Voice Overlay & Timer │ - Settings & Audio Feedback Toggle          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            DOMAIN LAYER                                │
│  UseCases:                                                             │
│  - ProcessVoiceInputUseCase       - LogSetWithContextUseCase           │
│  - ExecuteVoiceCrudUseCase        - CalculateAnalyticsUseCase          │
│  - ManageRestTimerUseCase         - SyncWorkoutSessionUseCase          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                             DATA LAYER                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   Local Data Source     │  │         Audio & Speech Engine       │  │
│  │ - Room Database         │  │ - AudioRecord + NoiseSuppressor DSP │  │
│  │ - DataStore Preferences │  │ - Android Offline SpeechRecognizer  │  │
│  │ - Fuzzy Exercise Matcher│  │ - Local Regex Contextual Parser     │  │
│  └────────────┬────────────┘  └──────────────────┬──────────────────┘  │
└───────────────┼──────────────────────────────────┼─────────────────────┘
                │ (Periodic / Network-Aware)       │ (Fallback Only: ~5%)
                ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      CLOUD BACKEND (ZERO-COST)                         │
│  - Cloudflare Worker (Free: 100k req/day)                              │
│  - Cloudflare D1 / KV Cloud Backup                                     │
│  - Gemini 1.5 Flash Text Intent Fallback (Free: 1,500 req/day)         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Voice Processing, Noise Elimination & Smart Context Engine

### 4.1 Gym Noise Suppression Pipeline
```
[Microphone Input (44.1kHz / 16kHz PCM)]
       │
       ▼
[Android Hardware NoiseSuppressor]  <-- Suppresses AC hum, gym music, ambient crowd
       │
       ▼
[AutomaticGainControl (AGC)]        <-- Normalizes quiet whisper vs loud speech
       │
       ▼
[Bandpass Filter (100Hz - 7.5kHz)]  <-- Cuts low-frequency plate drops & sub-bass
       │
       ▼
[Push-to-Talk Activation Gate]      <-- Mic strictly active only while FAB is held
       │
       ▼
[On-Device SpeechRecognizer]        <-- Offline, locale-aware (en-IN, en-US, en-GB)
```

### 4.2 Closed-Vocabulary Exercise Matcher
To guarantee zero hallucinations, the app uses a **Two-Tier Matching Algorithm**:
1. **Token Overlap with Stop-Word Pruning**: Filters common filler words (*"a", "the", "with", "log", "bhai", "yaar"*).
2. **Normalized Levenshtein Similarity (Threshold $\ge 0.65$)**: Maps phonetic transcriptions (*"bench frand"*, *"brench press"*) directly to the canonical 35-item catalog.

### 4.3 Smart Contextual State Machine (Mode 1: Live Workout)
The Live Workout session maintains an active context state:
```kotlin
data class ActiveExerciseContext(
    val exerciseName: String,
    val targetSets: Int? = null,
    val completedSetsCount: Int = 0,
    val lastWeight: Double? = null,
    val lastUnit: WeightUnit = WeightUnit.KG,
    val lastReps: Int? = null
)
```

**Context Rules:**
- **Trigger Exercise Initiation**: If user speaks an exercise name (e.g. *"Incline bench press"*), the app sets `ActiveExerciseContext` and initiates a target set prompt (*"How many sets planned?"*).
- **Weight & Reps Only**: If active context exists and user speaks *"90 kg for 8"*, the app automatically pairs it with `ActiveExerciseContext.exerciseName`.
- **Repeat / Relative Commands**:
  - *"Same weight same reps"* / *"Same as last"* $\rightarrow$ copies `lastWeight`, `lastUnit`, and `lastReps`.
  - *"Add 5 kilos 8 reps"* $\rightarrow$ calculates `lastWeight + 5.0`.
- **Switching Exercises**: Speaking a different catalog exercise replaces the active context seamlessly.

### 4.4 Voice & Touch CRUD Commands

| Operation | Voice Command Examples | Tactile Gesture |
|---|---|---|
| **Create (Set)** | *"Bench press 80 kg 10 reps"*, *"Same weight 8 reps"* | Tap "+ Add Set" button / Quick-log chip |
| **Update (Weight)** | *"Change weight to 85 kg"*, *"Make it 90 kilos"* | Tap weight cell in table $\rightarrow$ Number picker |
| **Update (Reps)** | *"Change reps to 12"*, *"Make it 8 reps"* | Tap reps cell in table $\rightarrow$ Number picker |
| **Delete (Last)** | *"Delete last set"*, *"Remove previous"* | Swipe set row left $\rightarrow$ Delete (with Undo snackbar) |
| **Delete (Group)** | *"Clear all bench press sets"* | Long-press exercise header $\rightarrow$ Delete Group |
| **Finish / Complete**| *"Finish workout"*, *"Complete session"* | Tap "Finish Workout" button |

---

## 5. Screen Flows & UI/UX Architecture

```
[App Launch]
     │
     ▼
[Google Sign-In Screen] ──(Authenticated)──► [Dashboard & History Screen]
                                                   │
                ┌──────────────────────────────────┴──────────────────────────────────┐
                │                                                                     │
                ▼                                                                     ▼
    [Mode 1: Live Workout]                                                [Mode 2: Batch Workout]
    ├── Active Exercise Header & Target Chips                             ├── Multi-Exercise Voice Recorder
    ├── Live Grouped Set Table (Interactive CRUD)                         ├── Full Transcript Inspector
    ├── 60s Auto-Rest Timer Bar (Pause/Skip/+30s)                         ├── Auto-Grouped Preview Table
    ├── Push-to-Talk Floating Action Button (FAB)                         ├── Inline Touch Correction
    └── Finish Session ──► [Workout Summary & Stats Screen]               └── Confirm & Save ──► [Dashboard]
```

### Key UI Component Specifications
1. **Push-to-Talk FAB**:
   - High-contrast, tactile floating button with scale animation on hold.
   - Real-time pulsating waveform ring indicating audio capture level.
   - Haptic feedback tick on `ACTION_DOWN` and `ACTION_UP`.
2. **60-Second Auto-Rest Timer**:
   - Slides up smoothly from bottom upon set creation in Live Mode.
   - Displays circular progress bar with controls: `+30s`, `Skip`, `Pause`.
   - Fires system vibration notification when countdown hits zero.
3. **Earbud Audio Receipts (Settings Toggle)**:
   - When enabled: Synthesizes a crisp TTS string into the Bluetooth SCO stream (e.g. *"Logged: 80 kg, 10 reps"*).
   - When disabled (default): High-precision haptic buzz pattern with on-screen green flash badge.

---

## 6. Database Schema (Room SQLite)

```sql
-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at INTEGER NOT NULL
);

-- Workout Sessions
CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    workout_date TEXT NOT NULL, -- YYYY-MM-DD
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    mode TEXT NOT NULL, -- 'LIVE' | 'BATCH'
    is_synced INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Workout Groups (Group of sets for one exercise)
CREATE TABLE workout_groups (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    target_sets INTEGER,
    created_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE
);

-- Workout Sets
CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    set_index INTEGER NOT NULL,
    weight_value REAL NOT NULL,
    weight_unit TEXT NOT NULL, -- 'kg' | 'lb'
    reps INTEGER NOT NULL,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    is_corrected INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(group_id) REFERENCES workout_groups(id) ON DELETE CASCADE,
    FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE
);

-- Sync Queue (for offline resilience)
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    entity_type TEXT NOT NULL, -- 'SESSION' | 'GROUP' | 'SET'
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'UPSERT' | 'DELETE'
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

---

## 7. Analytics & Calculations Engine

### 7.1 Estimated One-Rep Max (1RM)
Calculated using the industry-standard **Brzycki Formula** (for $\text{reps} \le 10$) and **Epley Formula** (for $\text{reps} > 10$):
$$\text{1RM}_{\text{Brzycki}} = \frac{\text{Weight}}{1.0278 - (0.0278 \times \text{Reps})}$$
$$\text{1RM}_{\text{Epley}} = \text{Weight} \times \left(1 + \frac{\text{Reps}}{30}\right)$$

### 7.2 Total Volume & Muscle Group Mapping
Each exercise in the 35-item taxonomy is tagged with its primary and secondary muscle groups:
- **Chest**: `bench press`, `incline bench press`, `decline bench press`, `pec deck`, `cable fly`.
- **Back**: `deadlift`, `lat pulldown`, `pull up`, `chin up`, `barbell row`, `dumbbell row`, `seated row`.
- **Legs**: `squat`, `front squat`, `leg press`, `leg extension`, `leg curl`, `calf raise`, `lunge`, `split squat`, `romanian deadlift`, `hip thrust`, `glute bridge`.
- **Shoulders**: `overhead press`, `shoulder press`, `lateral raise`, `face pull`, `z press`.
- **Arms**: `bicep curl`, `hammer curl`, `tricep pushdown`, `skull crusher`.

---

## 8. Detailed Engineering Roadmap & Step-by-Step Implementation

### Phase 1: Project Scaffolding & Core Foundations (Days 1–3)
- [ ] Initialize Android Studio project: Target SDK 35, Min SDK 29, Kotlin 2.0+, Jetpack Compose.
- [ ] Configure Gradle version catalog (`libs.versions.toml`) with Room, Navigation Compose, Hilt/Koin, DataStore, Credential Manager.
- [ ] Implement Material 3 Dark Gym Theme (High-contrast slate/black with electric accent tokens).

### Phase 2: Database Layer & Clean Architecture Setup (Days 4–6)
- [ ] Build Room Entities, DAOs, Database, and TypeConverters.
- [ ] Write Unit Tests for Room DAOs and CRUD transactions.
- [ ] Implement Repository pattern with reactive Kotlin `Flow` data streams.
- [ ] Create `ExerciseCatalogRepository` with pre-bundled 35-exercise JSON and fuzzy-matching logic.

### Phase 3: Audio Engine, Hardware DSP & Offline STT (Days 7–10)
- [ ] Implement `AudioRecordManager` with `android.media.audiofx.NoiseSuppressor` and `AutomaticGainControl`.
- [ ] Integrate Android `SpeechRecognizer` with `EXTRA_PREFER_OFFLINE` and language pack checks.
- [ ] Build `FuzzyExerciseMatcher` and `ContextualWorkoutParser` with full regex rule sets.
- [ ] Write rigorous unit test suite for multilingual / gym-slang speech variations.

### Phase 4: State Machine & Smart Context Engine (Days 11–13)
- [ ] Build `LiveWorkoutViewModel` managing active exercise context, relative commands (*"same as last"*), and set counters.
- [ ] Implement voice CRUD dispatcher (`CreateSet`, `UpdateWeight`, `UpdateReps`, `DeleteLastSet`).
- [ ] Build the 60-Second Auto-Rest Timer service and Compose countdown overlay.
- [ ] Implement Android Native `TextToSpeech` manager for optional earbud audio feedback.

### Phase 5: UI Screens & Interaction Polish (Days 14–18)
- [ ] **Auth Screen**: Google Credential Manager integration.
- [ ] **Home Dashboard**: Past workouts list, weekly volume, 1RM estimate cards.
- [ ] **Mode 1 (Live Workout Screen)**: Push-to-Talk FAB, grouped sets table, inline touch-edit dialogs, swipe-to-delete.
- [ ] **Mode 2 (Batch Workout Screen)**: Full voice ingestion screen, transcript review, bulk save.
- [ ] **Settings Screen**: Earbud TTS toggle, weight unit picker (`kg`/`lb`), cloud sync status.

### Phase 6: Cloudflare Worker Sync & Google Play Store Launch (Days 19–21)
- [ ] Implement `WorkManager` background sync pushing `sync_queue` to Cloudflare Worker & D1.
- [ ] Add app icons, splash screen, ProGuard/R8 obfuscation rules, signed Release AAB bundle.
- [ ] Generate Google Play Store assets, privacy policy, and deploy to internal testing track.
