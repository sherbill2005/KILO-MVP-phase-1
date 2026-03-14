# Live API (WebSocket) Push-to-Talk + Auto-Stop Design

Date: 2026-03-14
Status: Approved (design)

## Summary
Switch Kilo’s voice pipeline to Gemini **Live API** using a **Worker WebSocket proxy**. The browser streams **PCM16 @ 16kHz** audio. The Worker injects exercise context, receives final JSON, **auto-logs** sets, and returns a summary.

## Goals
- Use the native audio model: `gemini-2.5-flash-native-audio-preview-12-2025`.
- Lowest latency possible with Live API.
- Keep API key hidden behind Worker.
- Auto-log parsed multi-sets (performance-first).

## Non-Goals (for MVP)
- Continuous always-listening mode.
- Partial transcripts during speech.
- Client confirmation before logging.

## UX Decisions
- **Tap once** to start recording.
- **Auto-stop after 2s of silence**.
- **Visual-only feedback** (“Listening…”, “Processing…”).
- No max recording length.

## WebSocket Protocol (Client ? Worker)
### Client ? Worker
1. `session` message (first):
```json
{ "type": "session", "session_id": "..." }
```
2. `context` message (once):
```json
{ "type": "context", "exercises": ["bench press", "deadlift", ...] }
```
3. `audio` messages (binary frames):
- Raw PCM16 @ 16kHz, mono

### Worker ? Client
- `status`:
```json
{ "type": "status", "value": "listening" | "processing" | "error" }
```
- `result` (after auto-log):
```json
{ "type": "result", "workout": [...], "group_ids": [...], "set_ids": [...] }
```

## Buffering Rule
If audio arrives before `session_id`, Worker buffers up to **2 seconds** of audio (~64 KB at 16kHz PCM16). If session arrives after that, buffered audio is dropped.

## Worker ? Gemini Live API
- Worker opens WS to Gemini Live API using:
  - Model: `gemini-2.5-flash-native-audio-preview-12-2025`
- Sends system instruction + exercise context once.
- Streams PCM16 audio frames.
- Receives **final JSON** response only.
- Auto-logs sets via existing `/sessions/:id/sets` batch endpoint.

## Error Handling
- Missing/invalid `session_id` ? buffer then error after limit.
- Gemini error ? return `{ type:"error" }` to client.
- Logging error ? return `{ type:"error" }` to client.

## Security
- API key stays in Worker only.
- Browser never sees key.

## When to Revisit
- If we want always-listening mode.
- If we want partial transcripts or confirmation step.
