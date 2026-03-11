### Workflow: Web-First PWA

#### User Flow
1. User opens PWA and taps Start Workout
2. App starts listening (push-to-talk or tap-to-listen)
3. Audio is sent to backend in chunks
4. Cloud STT returns text
5. Parser extracts Exercise, Weight, Reps
6. Live table updates immediately
7. User corrects via voice or keyboard
8. User taps Finish; session is saved

#### Minimal Architecture Diagram

[ PWA (Cloudflare Pages) ]
    |  audio chunks + UI events
    v
[ Cloudflare Worker API ] ----> [ Cloud STT Provider ]
    |\
    | \--> [ Postgres ] (workouts, exercises, users)
    | \
    |  \--> [ R2 ] (optional raw audio)
    \
     \--> [ KV / Durable Object ] (active session state)

#### API Endpoints (Phase 1)
- POST /sessions/start
  - creates a workout session
- POST /sessions/{id}/audio
  - uploads audio chunk or stream
- POST /sessions/{id}/parse
  - returns parsed sets from STT text
- PATCH /sessions/{id}/sets/{set_id}
  - manual correction
- POST /sessions/{id}/finish
  - finalizes and stores session
- GET /sessions/{id}
  - fetch session for resume/debug
