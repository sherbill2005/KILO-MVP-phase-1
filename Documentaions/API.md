### API (MVP - Workout Tracker)

Goal: let the PWA create a workout session, add sets, correct sets, and finish.

#### Core Idea (Simple)
- One workout session = one date.
- Each spoken set becomes one row in `workout_sets`.
- The API should be tiny and predictable.

#### Endpoints (Minimum)

1. POST /api/sessions
- Create a new session for today.
- Body: { user_id, workout_date }
- Returns: { session_id }

2. POST /api/sessions/{session_id}/sets
- Add a new set to the session.
- Body: { exercise_name, weight_value, weight_unit, reps, raw_text? }
- Returns: { set_id }

3. PATCH /api/sets/{set_id}
- Correct a set.
- Body: { exercise_name?, weight_value?, weight_unit?, reps? }
- Returns: { ok: true }

4. POST /api/sessions/{session_id}/finish
- Mark session complete (optional for MVP).
- Body: {}
- Returns: { ok: true }

#### Notes
- For MVP we can skip authentication and use a fixed user_id.
- If you want live STT handling in the API, add:
  - POST /api/stt (audio -> text)
  - POST /api/parse (text -> structured set)
