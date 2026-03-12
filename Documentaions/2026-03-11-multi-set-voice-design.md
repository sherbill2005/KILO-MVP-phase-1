### Multi-Set Voice Logging Design (MVP)

#### Goal
Allow one voice input to log multiple sets and multiple exercises, reducing total voice inputs and API calls.

#### Scope
- Explicit set count is required.
- Auto-log all parsed sets (no confirmation step).
- Support multiple exercises in one input.

#### Examples (Target Inputs)
1. "log bench press of 3 sets 40kg 10 reps"
2. "bench press 3 sets of 40kg 35kg for 10 reps 12 reps"
3. "tricep pushdown 4 sets 20kg for 8, 10, 13 and bench press 3 sets 60kg for 7, 9 reps"
4. "bench press 3 sets — first 8 reps, second 8, third 6"

#### Output Schema (Gemini)
```
{
  "transcript": "...",
  "workout": [
    {
      "exercise": "bench press",
      "sets": [
        { "weight": 40, "unit": "kg", "reps": 10 },
        { "weight": 40, "unit": "kg", "reps": 10 },
        { "weight": 40, "unit": "kg", "reps": 10 }
      ]
    }
  ]
}
```

#### Normalization Rules (LLM must apply)
- If sets > weights list, repeat the last weight.
- If sets > reps list, repeat the last reps.
- If unit missing, use previous or default to "lb".
- If any required piece is missing, return an empty workout array.

#### Backend Behavior
- Gemini prompt includes exercise context list.
- Gemini must return only JSON using responseSchema.
- If parsing fails, return empty workout array.

#### Frontend Behavior
- Loop all exercises and sets in `workout[]`.
- Auto-submit each set to `/api/sessions/{id}/sets`.
- Add all rows to the table.
- If workout[] is empty, show "Could not parse".

#### Error Handling
- Malformed JSON → empty workout + error message.
- Exercise not in context → skip that exercise.

#### Non-Goals (for MVP)
- Confirmation UI.
- Manual review/edit before submit.
- Automatic set count inference without explicit set count.
