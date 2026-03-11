### Phase 1: Web-First PWA MVP (Solo Test)

Goal: you can log a full hands-free workout, with <2 seconds from speech to log.

#### Target User
- You only (solo tester)

#### Success Criteria
- You can complete a full workout without touching the keyboard.
- Median time from speech to table update is under 2 seconds.

#### Scope (Must Have)
1. Start workout button
2. Push-to-talk or tap-to-listen (hands-free voice workflow)
3. Cloud STT to text
4. Parse text into Exercise / Weight / Reps
5. Live table update
6. Voice correction (e.g., "Correction, 225")
7. Finish workout and save session

#### Workflow (High-Level)
1. Tap Start Workout
2. Speak set ("Bench press, 225 for 10")
3. STT returns text
4. Parser extracts fields
5. Table updates immediately
6. Corrections by voice
7. Finish and save session


#### Tech Stack
Phase 1 MVP (fast validation):

Use cloud STT or Web Speech API (if web only).
Use a simple parser (rules) to extract Exercise/Weight/Reps.
    

Phase 2 (performance):
Move to on‑device STT (whisper.cpp / Vosk).
Add VAD for automatic segmenting.
Use Gemini only for advanced “coach” features, not core logging.
