# Multi-Set Logging (Grouped Sets) Design

Date: 2026-03-11
Owner: Kilo MVP

## Summary
Enable logging an exercise with multiple sets in one request. The client will reuse the existing `POST /api/sessions/:sessionId/sets` endpoint with a **batch payload**. The backend will create a `group_id` automatically, store a `WorkoutGroup`, and store each set with the shared `group_id` and an ordered `group_index`.

## Goals
- Reduce voice/API calls by allowing multi-set logs per exercise.
- Keep MVP simple by reusing the existing `/sets` endpoint.
- Maintain single-set correction via `PATCH /api/sets/:id`.

## Non-Goals (for MVP)
- No new “exercise list” endpoint.
- No complex UI grouping (only basic status text).
- No partial success: batch is all-or-nothing.

## API Contract
### POST /api/sessions/:sessionId/sets (batch)
Request:
```json
{
  "exercise_name": "bench press",
  "sets": [
    { "weight_value": 40, "weight_unit": "kg", "reps": 10 },
    { "weight_value": 35, "weight_unit": "kg", "reps": 12 },
    { "weight_value": 35, "weight_unit": "kg", "reps": 12 }
  ]
}
```
Response:
```json
{
  "group_id": "uuid",
  "set_ids": ["uuid1", "uuid2", "uuid3"]
}
```
Errors:
- `400` invalid payload (missing `exercise_name`, empty `sets`, invalid set values)
- `404` session not found

## Data Model
### WorkoutSet (new fields)
- `group_id: string`
- `group_index: number` (1-based order within group)

### WorkoutGroup (new type)
- `id: string` (group_id)
- `session_id: string`
- `exercise_name: string`
- `set_ids: string[]`
- `created_at: string`

### WorkoutSession (add)
- `group_ids: string[]` (optional for MVP, helps future listing)

## Storage (KV keys)
- `set:<id>` ? WorkoutSet
- `group:<id>` ? WorkoutGroup
- `session:<id>` ? WorkoutSession

## Flow
1. Client records audio and calls `/api/ai/parse`.
2. Gemini returns `workout[]` with exercises + sets.
3. For each exercise block, client calls batch `/sets`.
4. Backend creates `group_id`, writes group, writes each set with `group_id` + `group_index`.

## Error Handling
- Validate all sets before writing. If any set invalid, return `400` and **do not write anything**.
- If session missing, return `404`.
- Client shows one error message for the whole exercise block.

## UI Behavior (MVP)
- Show “Logging X exercises…” while posting.
- On success: “Logged N exercises / M sets”.
- On failure: show error message and allow retry.

## Testing (manual)
- Post batch for a valid session ? expect `group_id` and `set_ids`.
- Verify KV has `group:<id>` and all `set:<id>` with same `group_id`.
- Invalid set (e.g., reps = 0) ? 400 and no writes.

