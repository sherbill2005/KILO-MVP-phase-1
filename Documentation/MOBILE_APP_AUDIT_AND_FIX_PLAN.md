# Kilo Mobile Production Hardening & Architectural Fix Plan

This document outlines the expert software engineering and mobile development audit of the Kilo mobile application (`apps/mobile`), detailing the critical flaws identified and the step-by-step implementation to harden the app for enterprise reliability, zero data-loss, and high-performance gym ergonomics.

---

## 1. Executive Summary & Audit Scores

- **System Architecture & Data:** 7.5 / 10 ➔ Target: 9.8 / 10
- **Mobile & Gym Ergonomics:** 7.0 / 10 ➔ Target: 9.5 / 10
- **Voice & AI Integration:** 8.5 / 10 ➔ Target: 9.5 / 10
- **Production Readiness:** 6.5 / 10 ➔ Target: 9.5 / 10

---

## 2. Identified Vulnerabilities & Flaws

### Flaw 1: Ephemeral Workout Crash Vulnerability (High Severity)
- **Problem:** Active workout sets exist purely in React component memory (`useState`) until "Finish Workout" is clicked. An OS process kill (e.g., user takes a phone call or switches to Spotify), an unhandled exception, or a dead battery permanently wipes out the 45-minute gym session.
- **Solution:** Implement a Write-Ahead Log (WAL) pattern via an `active_draft_session` table in SQLite (`database.ts`). Every set logged, edited, or removed immediately persists to disk. On app startup, detect unfinished drafts and offer automatic one-tap session recovery.

### Flaw 2: Unpaginated $O(N)$ Database Scans (Medium Severity)
- **Problem:** `getAllSessions()` executes three unconstrained `SELECT *` queries across `sessions`, `workout_groups`, and `workout_sets`, joining and sorting them in JavaScript memory. This freezes the UI thread when historical data reaches hundreds of workouts.
- **Solution:** Push aggregate calculations directly into native SQLite (`COUNT(*)`, `SUM(weight_value * reps)`), add query pagination (`LIMIT 20`), and memoize stats calculations with `useMemo`.

### Flaw 3: Audio Cache Disk Leak (Medium Severity)
- **Problem:** Every Push-to-Talk audio recording creates a `.m4a` file in the device cache that is never unlinked or garbage-collected after base64 encoding and transmission.
- **Solution:** Clean up audio files immediately after conversion via `FileSystem.deleteAsync`, and add a startup sweep to purge any stale recording files.

### Flaw 4: Network Hang / Unbounded Fetch (Medium Severity)
- **Problem:** Network calls to `/api/ai/parse-audio` lack timeout handling. In basement gyms with spotty connectivity, the request hangs indefinitely and locks the UI in processing state.
- **Solution:** Implement an `AbortController` with an 8-second timeout, falling back gracefully to on-device regex/fuzzy parsing with clear haptic/audio feedback.

### Flaw 5: Rest Timer In Background / Pocket Problem (High UX Severity)
- **Problem:** The rest timer relies on an in-component `setInterval`. When a lifter places their locked phone in their pocket, the OS suspends timers; vibrations and TTS receipts do not fire until the phone is unlocked.
- **Solution:** Schedule high-priority OS-level local notifications with custom vibration patterns via `expo-notifications` matching the target end time.

### Flaw 6: Chalky-Hands Accidental Modal Trap (UX Severity)
- **Problem:** A short tap (<350ms) on the FAB button or a transient network failure triggers a full-screen keyboard text modal, interrupting the lifter.
- **Solution:** Replace short-tap modal triggers with a non-intrusive "Hold to record" haptic pulse and toast hint.

### Flaw 7: Deprecated React Native Core APIs (Tech Debt)
- **Problem:** Deprecated `SafeAreaView` from `react-native` causes developer warnings and poor edge-to-edge support on modern Android/iOS gesture bars.
- **Solution:** Migrate to `react-native-safe-area-context`.

---

## 3. Implementation Roadmap

1. **Step 1: Install Dependencies**
   - `react-native-safe-area-context`
   - `expo-file-system`
   - `expo-notifications`
2. **Step 2: SQLite Draft Storage & Auto-Recovery**
   - Add draft table & migration in `services/storage/database.ts`
   - Implement draft auto-save and restore in `context/WorkoutContext.tsx`
   - Add recovery banner on `HomeScreen.tsx`
3. **Step 3: Background Rest Timer Notifications**
   - Configure local notification scheduling in `context/RestTimerContext.tsx` & `components/RestTimerBar.tsx`
4. **Step 4: SQL Aggregation & History Pagination**
   - Implement `getWorkoutStats()` and `getAllSessions(limit, offset)` in `database.ts`
   - Optimize `HomeScreen.tsx` and `AnalyticsScreen.tsx` with memoization
5. **Step 5: Audio Cache Hygiene & Network Circuit Breaker**
   - Auto-unlink `.m4a` files in `services/audio/audioClient.ts`
   - Add 8s timeout with local fallback in `audioClient.ts`
6. **Step 6: Ergonomics & SafeAreaView Migration**
   - Refactor `PushToTalkFab.tsx` tap handling
   - Migrate all screens to `react-native-safe-area-context`
