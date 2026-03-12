### Live Audio via Worker (Push-to-Talk, Multi-Set) — Design

#### Goal
Use Gemini Live Audio models with push-to-talk audio chunks while keeping the API key on the server, and return multi-set JSON for auto-logging.

---

### Architecture
PWA → Worker (HTTP upload) → Worker ↔ Gemini Live WebSocket → Worker → PWA

1. PWA records short audio clip (push-to-talk)
2. PWA POSTs audio bytes to Worker
3. Worker opens WebSocket to Gemini Live API
4. Worker sends system instruction + schema + audio chunk
5. Worker receives JSON response
6. Worker returns JSON to PWA
7. PWA logs all sets

---

### Worker Endpoint
**POST `/api/ai/live-parse`**
- Input: audio bytes (content-type: audio/webm)
- Header: `x-exercise-context` (comma-separated)
- Output: JSON with `workout[]`

---

### Output Schema (Multi-Set)
```
{
  "transcript": "...",
  "workout": [
    {
      "exercise": "bench press",
      "sets": [
        { "weight": 40, "unit": "kg", "reps": 10 }
      ]
    }
  ]
}
```

---

### LLM Rules
- Ignore irrelevant words
- Prefer exact matches from context list
- If sets > weights list, repeat last weight
- If sets > reps list, repeat last reps
- If unit missing, default to previous or "lb"

---

### Error Handling
- If Gemini returns invalid JSON → return empty workout
- If WebSocket fails → return 500 + error message

---

### Non-Goals (MVP)
- Real-time streaming audio (continuous)
- Client-side WebSocket (key exposure risk)
- Confirmation UI
