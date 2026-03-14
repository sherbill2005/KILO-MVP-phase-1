# Future: Live Audio Streaming (Continuous Mode)

Date: 2026-03-14
Status: Planned (post-MVP)

## Current Decision
For MVP we will use **push-to-talk** with audio blobs. This is simpler, cheaper, and easier to debug.

## Future Feature: Continuous Streaming
When performance becomes the priority, we will switch to **continuous streaming** using the Gemini **Live API** with a native-audio model.

## Why Later
- Live streaming requires WebSockets on both the client and Worker.
- Audio must be streamed as **PCM16 @ 16kHz** (browser resampling).
- More complex to test and monitor.
- Higher bandwidth and cost.

## High-Level Architecture
1. Browser captures mic audio continuously.
2. Browser streams PCM16 chunks over WebSocket to Worker.
3. Worker opens WebSocket to Gemini Live API and forwards chunks.
4. Gemini returns structured JSON workout output.
5. Worker relays JSON to client.

## Risks / Unknowns
- Model names may change (preview models can be deprecated).
- Latency varies with network and chunk size.
- Always-listening requires stronger privacy UX.

## When to Revisit
- After MVP traction (real users).
- When voice latency becomes a bottleneck.
- If push-to-talk feels too slow or clunky.
