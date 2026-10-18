# Kilo: Product & Architecture Master Specification

---

## 1. Product Overview & Value Proposition

**KILO** is an ultra-low friction, voice-first workout tracking application designed for gym environments.

### Core Value Proposition
Eliminate manual typing and data entry in high-friction environments (gyms) using a voice-first, **"Zero-Touch"** interaction model where **Latency is the Product**. The lifter should be able to log sets hands-free and see confirmation before starting their next set.

---

## 2. Core Features & Specifications (PRD)

### 2.1 Audio & Environmental Resilience
- **Intelligent Noise Gate & Push-to-Talk**: Physical or touch-held activation combined with hardware DSP (`NoiseSuppressor`) to filter out clanging plates, background music, and crowd chatter.
- **Whisper Mode & High-Sensitivity Capture**: Normalizes low-decibel speech to eliminate the social anxiety of talking loudly in a gym.

### 2.2 The Intelligence Layer
- **Closed-Taxonomy Gym-Speak Matcher**: Hybrid Token-Overlap + Levenshtein distance matcher that strictly resolves gym slang (*"pec deck"*, *"bicep curl"*, *"bench frand"*) to canonical exercises without hallucinating.
- **Smart Context Memory**: Remembers active exercise across sets so subsequent entries only require numbers (*"90 for 8"*) or relative commands (*"same weight, same reps"*).
- **Auto-Progression & Analytics**: Real-time 1RM estimation (Brzycki & Epley formulas), total workout volume, and muscle group volume distributions.

### 2.3 User Interaction & Feedback Flows
- **Instant Correction Loops (Voice & Touch CRUD)**:
  - Voice: *"Change weight to 85 kg"*, *"Change reps to 12"*, *"Delete last set"*.
  - Touch: Inline table cell edit, swipe-to-delete with undo snackbar.
- **Auditory & Tactile Confirmation Receipts**:
  - Default: Subtle haptic vibration pattern + on-screen flash.
  - Optional: Snappy earbud Text-to-Speech (TTS) confirmation (e.g. *"Logged: 80 kg, 10 reps"*).
- **Auto-Rest Timer**: 60-second automated countdown timer with vibration alerts triggered upon completing an individual set in live mode.

---

## 3. Database Schema

### 3.1 Relational Schema (PostgreSQL / SQLite Room)

```sql
-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at INTEGER NOT NULL
);

-- Exercises (Canonical 35 Catalog)
CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    canonical_slug TEXT NOT NULL UNIQUE,
    primary_muscle TEXT NOT NULL, -- Chest, Back, Legs, Shoulders, Arms, Core
    secondary_muscles TEXT
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
    group_index INTEGER NOT NULL,
    exercise_name TEXT NOT NULL,
    weight_value REAL NOT NULL,
    weight_unit TEXT NOT NULL, -- 'kg' | 'lb'
    reps INTEGER NOT NULL,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    is_corrected INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(group_id) REFERENCES workout_groups(id) ON DELETE CASCADE,
    FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE
);

-- Sync Queue (Offline-First Sync Engine)
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    entity_type TEXT NOT NULL, -- 'SESSION' | 'GROUP' | 'SET'
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'UPSERT' | 'DELETE'
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

### 3.2 Cloudflare KV Document Models
- `session:{session_id}` $\rightarrow$ `{ id, user_id, workout_date, group_ids: [], set_ids: [], finished: boolean }`
- `group:{group_id}` $\rightarrow$ `{ id, session_id, exercise_name, set_ids: [], created_at }`
- `set:{set_id}` $\rightarrow$ `{ id, session_id, group_id, group_index, exercise_name, weight_value, weight_unit, reps, corrected, created_at }`

---

## 4. API Specification

### REST Endpoints

#### 1. Create Workout Session
- **Endpoint**: `POST /api/sessions`
- **Request Body**:
  ```json
  { "user_id": "usr_123", "workout_date": "2026-09-29" }
  ```
- **Response** (200 OK):
  ```json
  { "session_id": "d32ca505-b886-49e4-b30c-4ea4c2d01791" }
  ```

#### 2. Log Set or Batch of Sets
- **Endpoint**: `POST /api/sessions/{session_id}/sets`
- **Request Body** (Batch or Single):
  ```json
  {
    "exercise_name": "bench press",
    "sets": [
      { "weight_value": 80, "weight_unit": "kg", "reps": 10 },
      { "weight_value": 85, "weight_unit": "kg", "reps": 8 }
    ]
  }
  ```
- **Response** (200 OK):
  ```json
  { "group_id": "grp_456", "set_ids": ["set_789", "set_790"] }
  ```

#### 3. Update / Correct Set
- **Endpoint**: `PATCH /api/sets/{set_id}`
- **Request Body**:
  ```json
  { "weight_value": 82.5, "reps": 10, "exercise_name": "incline bench press" }
  ```
- **Response** (200 OK):
  ```json
  { "ok": true }
  ```

#### 4. Finish Workout Session
- **Endpoint**: `POST /api/sessions/{session_id}/finish`
- **Response** (200 OK):
  ```json
  { "ok": true, "finished_at": "2026-09-29T19:30:00.000Z" }
  ```

### WebSocket Streaming Endpoint
- **Endpoint**: `GET /ws/ai/live` (Upgrade: websocket)
- **Protocol**:
  - Client $\rightarrow$ Worker: Session handshake, exercise context list, raw PCM16 audio frames.
  - Worker $\leftrightarrow$ Gemini Live API: Bidirectional WebSocket streaming.
  - Worker $\rightarrow$ Client: Real-time status events (`listening`, `processing`, `result`, `error`).
