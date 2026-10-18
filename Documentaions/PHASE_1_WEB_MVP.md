# Kilo Phase 1: Web PWA & Cloudflare Worker Live Voice MVP

---

## 1. Overview & Goal
Phase 1 delivers a lightweight, browser-based Progressive Web App (PWA) paired with a Cloudflare Worker proxying Google Gemini Live API. The primary objective is validating hands-free, voice-driven set logging with under 2 seconds latency from speech to UI table update.

---

## 2. Architecture & Pipeline

```
[Browser PWA (apps/pwa)]
  ├── AudioWorklet (Pcm16Processor downsampling to 16kHz PCM16)
  └── WebSocket Client (/ws/ai/live)
          │
          ▼
[Cloudflare Worker (services/api-worker)]
  ├── WebSocket Router & Session Handshake
  ├── Gemini Live WebSocket Client (BidiGenerateContent)
  └── Auto-Persistence Engine (Persists sets to Cloudflare KV)
          │
          ▼
[Google Gemini Live API]
  └── Ingests 16kHz PCM audio & returns structured JSON output
```

---

## 3. Implementation Details

### 3.1 Audio Capture & Resampling (`apps/pwa/src/audio.js`)
- Uses `AudioWorkletProcessor` (`pcm16-processor`) to capture microphone stream.
- Resamples incoming browser audio to **16,000 Hz 16-bit Linear PCM**.
- Buffers and streams binary chunks over WebSocket.

### 3.2 Gemini Live Protocol Proxy (`services/api-worker/src/live/`)
- **System Instructions**: Configures Gemini Live with a strict JSON-only instruction containing the active exercise context list.
- **Message Framing**:
  - `setup`: Initializes model and audio input/output transcription.
  - `activity_start` / `activity_end`: Demarcates spoken user activity.
  - `realtime_input.audio`: Base64-encoded PCM16 chunks.
- **Turn Completion & Output Extraction**:
  - Extracts `{ "workout": [ { "exercise": "...", "sets": [ ... ] } ] }`.
  - Automatically validates batch payload and persists records to `KILO_KV`.

### 3.3 Fuzzy Exercise Matcher (`apps/pwa/src/exercises.js`)
- 35 canonical exercises loaded from `exercises.json`.
- Hybrid matcher: Word-overlap score $+ (1 - \text{Levenshtein} / \text{maxLen})$.
- Minimum similarity threshold (0.04) prevents false matching.

---

## 4. Multi-Set Batch Logging Specs

### Supported Voice Input Patterns
- **Single Set**: *"Bench press 80 kg for 10 reps"* $\rightarrow$ 1 set of 80kg $\times$ 10.
- **Multi-Set (Explicit)**: *"Squat 100 kg 10 reps, 105 kg 8 reps, 110 kg 6 reps"* $\rightarrow$ 3 sets under 1 exercise group.
- **Multi-Set (Repeat)**: *"Deadlift 3 sets of 5 at 140 kg"* $\rightarrow$ 3 sets of 140kg $\times$ 5.
