### Database Schema (MVP - Workout Tracker)

We are keeping this simple: track workouts by date, not by exact start/finish time.

#### Tables

users
- id (uuid, pk)
- email (text, unique)
- created_at (timestamptz)

exercises
- id (uuid, pk)
- name (text)
- canonical_slug (text, unique)

workout_sessions
- id (uuid, pk)
- user_id (uuid, fk -> users.id)
- workout_date (date)
- source (text) -- e.g. 'pwa'

workout_sets
- id (uuid, pk)
- session_id (uuid, fk -> workout_sessions.id)
- exercise_id (uuid, fk -> exercises.id)
- weight_value (numeric)
- weight_unit (text) -- 'lb' or 'kg'
- reps (int)
- created_at (timestamptz)
- corrected (bool, default false)

#### Notes
- We can add started_at/finished_at later if you want precise timing.
- This is a workout tracker MVP, so a single date per session is enough.
