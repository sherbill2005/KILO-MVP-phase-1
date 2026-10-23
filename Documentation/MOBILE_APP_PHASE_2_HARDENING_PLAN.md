# Kilo Mobile Phase 2 Architecture Hardening & Reliability Implementation

This document specifies the technical design, architectural rationale, and implementation details for Phase 2 hardening of the Kilo mobile workout tracker (`apps/mobile`) and worker API (`services/api-worker`).

---

## 1. Objectives

- **Atomic Cloud Sync:** Eliminate the $N+1$ sequential HTTP call pattern by providing an atomic single-request sync endpoint (`POST /api/workouts/sync-batch`).
- **Database Schema Evolution:** Implement SQLite `PRAGMA user_version` migrations for safe, non-destructive database evolution over app updates.
- **Dynamic Custom Exercise Dictionary:** Break the hardcoded canonical exercise barrier by storing user custom exercises in SQLite and feeding them into fuzzy voice matching.
- **Native Audio Interruption & Focus Safety:** Safeguard recording sessions against phone calls, alarms, and OS audio focus changes.
- **Typography & Accessibility Resiliency:** Protect tabular data in workout sets from layout breakage under large Android/iOS display scales and accessibility font sizes.

---

## 2. Technical Specifications

### A. Atomic Sync Endpoint (`POST /api/workouts/sync-batch`)
- **Worker Endpoint:** `services/api-worker/src/index.ts`
- **Payload Schema:**
  ```json
  {
    "session": {
      "id": "live_123456",
      "user_id": "usr_local",
      "workout_date": "2026-10-22",
      "started_at": 1774200000000,
      "finished_at": 1774203600000,
      "mode": "LIVE",
      "groups": [
        {
          "id": "grp_1",
          "exercise_name": "Bench Press",
          "target_sets": 4,
          "sets": [
            { "weight_value": 80, "weight_unit": "kg", "reps": 10 }
          ]
        }
      ]
    }
  }
  ```
- **Mobile Integration:** `apps/mobile/src/services/storage/syncService.ts` executes a single atomic fetch request with rollback safety on failure.

### B. SQLite Versioned Migration Runner (`PRAGMA user_version`)
- **Location:** `apps/mobile/src/services/storage/database.ts`
- **Mechanism:**
  - Query current `PRAGMA user_version`.
  - Migration 1 (v1): Baseline schema (`sessions`, `workout_groups`, `workout_sets`, `sync_queue`, `active_draft_session`).
  - Migration 2 (v2): Add `custom_exercises` table:
    ```sql
    CREATE TABLE IF NOT EXISTS custom_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_custom_ex_name ON custom_exercises(name);
    ```
  - Increment `PRAGMA user_version` to target version.

### C. Custom Exercise Library & Dynamic Matching
- **Location:** `apps/mobile/src/services/parser/fuzzyMatcher.ts` & `database.ts`
- **Mechanism:**
  - `DatabaseService.getAllExercises()` returns `CANONICAL_EXERCISES` combined with user's saved custom movements.
  - When a user logs an unrecognized exercise, it automatically persists to `custom_exercises`.

### D. Audio Interruption & Focus Recovery
- **Location:** `apps/mobile/src/services/audio/audioSessionManager.ts`
- **Mechanism:**
  - Listen to `AppState` transitions. If the app is backgrounded (e.g. incoming call) while a recording is in progress, cancel and release recording resources safely without crashing.

### E. Resilient Typography in Tabular Set Rows
- **Location:** `apps/mobile/src/components/GroupedSetTable.tsx`
- **Mechanism:**
  - Apply `allowFontScaling={false}` and `maxFontSizeMultiplier={1.2}` to numerical weight and rep badges.
  - Ensure column headers and metrics maintain fixed aspect ratios under high system font zoom.
