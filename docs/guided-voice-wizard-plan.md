# Guided Voice Wizard for Kilo

## Summary
Replace the current one-shot “say everything in one go” voice logging with a **guided voice wizard** that collects workout data in four narrow steps:

1. exercise  
2. set count  
3. reps summary  
4. weight summary  

Each step uses **browser speech-to-text**, not live audio streaming. After all four raw answers are collected, Kilo sends **one final structured Gemini request** that normalizes the data into a final set list. Kilo then shows an **editable summary** before saving. On confirm, Kilo sends **one final batch log write** and updates the workout table.

This keeps the product voice-first while reducing ambiguity, lowering Gemini load, and improving logging accuracy.

## Key Changes
### UX and interaction
- The voice button opens a **modal wizard** instead of immediately starting full-session live parsing.
- The wizard asks one question at a time:
  - “What exercise did you do?”
  - “How many sets?”
  - “What were the reps?”
  - “What were the weights?”
- Each step captures a **voice transcript** in the browser and stores the raw text.
- If a step fails to transcribe or is unclear, the wizard stays on that step and asks again.
- After all steps, show a **summary screen** with:
  - resolved exercise
  - normalized set list
  - editable set rows
- User actions on summary:
  - `Confirm` ? save
  - `Edit inline` ? adjust fields directly in modal
  - optional `Retry parse` if final Gemini output is unusable

### Gemini responsibilities
- Gemini is no longer asked to infer a whole workout from one freeform utterance.
- Gemini receives one **final text-only structured prompt** with:
  - exercise context list
  - raw exercise answer
  - raw set-count answer
  - raw reps answer
  - raw weight answer
- Gemini returns:
  - one matched exercise
  - normalized `sets[]` array with `weight`, `unit`, `reps`
- Gemini handles the complex shorthand interpretation for reps and weight, so local custom parsing logic stays minimal.

### Frontend engineering
- Add a new wizard controller/state machine that manages:
  - current step
  - raw transcripts
  - retry state
  - final parsed summary
- Keep the current manual logging flow unchanged.
- The current live websocket voice flow should be treated as the **old path** and either:
  - be replaced by the wizard for the main voice button, or
  - be kept behind a separate experimental toggle during migration
- Browser speech-to-text is used for step capture.
- Summary editing happens in the modal before save.
- Final save uses the existing batch logging path:
  - one request after confirmation
  - UI table updates only after successful save

### Backend engineering
- Add a **new text-based parse endpoint** for the wizard instead of reusing the live audio websocket path.
- Input should include:
  - `session_id`
  - `exercise_context`
  - raw `exercise_answer`
  - raw `sets_answer`
  - raw `reps_answer`
  - raw `weight_answer`
- Response should return:
  - normalized `exercise`
  - normalized `sets[]`
  - optional transcript/debug echo for the summary view
- Keep the existing final write path to store grouped sets in one save operation.
- The current Gemini Live websocket path remains useful for the existing product, but the wizard should not depend on PCM streaming.

### Public interfaces / types
- Add a new request/response contract for the wizard parse endpoint.
- Add frontend wizard state type with:
  - `step`
  - `exerciseAnswer`
  - `setCountAnswer`
  - `repsAnswer`
  - `weightAnswer`
  - `parsedWorkout`
- Add summary data shape aligned with current logged-set schema:
  - `exercise`
  - `sets: [{ weight, unit, reps }]`

## Test Plan
### User flow scenarios
- Start workout ? open wizard ? complete all four voice steps ? confirm summary ? rows appear in table.
- Exercise speech is messy but recoverable ? Gemini resolves to valid exercise from context.
- Reps/weight shorthand like:
  - “10, 10, last one 8”
  - “100kg, last one 90”
  is normalized correctly in summary.
- One step fails transcription ? wizard stays on that step and allows retry.
- Gemini returns invalid or incomplete final parse ? show retry/error state instead of saving bad data.
- User edits summary manually before confirm ? edited values are what get logged.
- Final save failure ? no silent success; summary stays visible with error state.

### Backend/API scenarios
- Valid wizard parse request returns normalized workout structure.
- Unknown exercise or unusable answers return structured parse error, not malformed JSON.
- Final batch save still creates grouped sets and updates session correctly.
- Existing manual set logging still works unchanged.

### Regression checks
- Existing manual form path remains functional.
- Existing table rendering still works.
- Existing set correction flow still works.
- If the old live websocket path remains temporarily, it should not break while the wizard is introduced.

## Assumptions and defaults
- The guided wizard becomes the **primary** voice logging experience.
- Browser speech-to-text is used for each wizard step.
- Gemini is used **once at the end**, not once per step.
- The wizard is **fully voice-first** during capture, but the summary screen allows manual inline edits before save.
- Save happens **once at the end** after confirmation.
- Complex reps/weight interpretation is handled by Gemini, not by large local parsing logic.
- If needed during rollout, the current live websocket flow can remain behind an internal/experimental path while the wizard becomes the user-facing default.
