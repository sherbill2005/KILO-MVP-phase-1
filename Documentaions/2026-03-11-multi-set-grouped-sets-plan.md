# Multi-Set Grouped Sets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multi-set exercise logging via a batch `/sets` payload with backend-generated `group_id`, stored in KV and surfaced to the client.

**Architecture:** Reuse the existing `/api/sessions/:id/sets` endpoint to accept either a single set or a batch. The backend creates a `WorkoutGroup` record and annotates each `WorkoutSet` with `group_id` and `group_index`. The client sends one batch per exercise (from Gemini output) and logs all sets in one request.

**Tech Stack:** Cloudflare Workers (TypeScript), KV storage, PWA (vanilla JS)

---

## File Structure Changes

- Modify: `packages/shared/types/workoutModel.ts`
  - Add `WorkoutGroup` type
  - Add `group_id`, `group_index` to `WorkoutSet`
  - Add `group_ids` to `WorkoutSession`
- Create: `services/api-worker/src/validation.js`
  - Validation helpers for batch payloads (kept in JS to allow `node --test` without TS tooling)
- Create: `services/api-worker/tests/validation.test.js`
  - Node built-in tests for batch validation
- Modify: `services/api-worker/package.json`
  - Add `test` script: `node --test`
- Modify: `services/api-worker/src/index.ts`
  - Accept batch payload, create group + sets, update session
- Modify: `apps/pwa/src/app.js`
  - For voice parse: send batch payload per exercise, handle batch response
- Modify: `apps/pwa/src/api.js`
  - Add `postSetsBatch` helper (optional but makes intent clear)

---

## Chunk 1: Shared Types + Backend Batch Support

### Task 1: Update shared types for grouping

**Files:**
- Modify: `packages/shared/types/workoutModel.ts`

- [ ] **Step 1: Write failing “type expectations” as comments**

```ts
// Expect WorkoutSet to include group_id and group_index
// Expect WorkoutSession to include group_ids
// Expect WorkoutGroup type to exist
```

- [ ] **Step 2: Implement the type changes**

```ts
export type WorkoutSession = {
  id: string;
  user_id: string;
  workout_date: string;
  set_ids: string[];
  group_ids: string[];
  finished: boolean;
};

export type WorkoutGroup = {
  id: string;
  session_id: string;
  exercise_name: string;
  set_ids: string[];
  created_at: string;
};

export type WorkoutSet = {
  id: string;
  session_id: string;
  group_id: string;
  group_index: number;
  exercise_name: string;
  weight_value: number;
  weight_unit: "kg" | "lb";
  reps: number;
  corrected: boolean;
  created_at: string;
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/types/workoutModel.ts
git commit -m "feat: add grouped-set types"
```

---

### Task 2: Add batch validation helper with tests (TDD)

**Files:**
- Create: `services/api-worker/src/validation.js`
- Create: `services/api-worker/tests/validation.test.js`
- Modify: `services/api-worker/package.json`

- [ ] **Step 1: Write failing tests**

```js
// services/api-worker/tests/validation.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateBatchPayload } = require("../src/validation.js");

test("rejects missing exercise_name", () => {
  const result = validateBatchPayload({ sets: [{ weight_value: 10, weight_unit: "kg", reps: 5 }] });
  assert.equal(result.ok, false);
});

test("rejects empty sets", () => {
  const result = validateBatchPayload({ exercise_name: "bench", sets: [] });
  assert.equal(result.ok, false);
});

test("accepts valid batch", () => {
  const result = validateBatchPayload({
    exercise_name: "bench",
    sets: [
      { weight_value: 10, weight_unit: "kg", reps: 5 },
      { weight_value: 12.5, weight_unit: "kg", reps: 4 },
    ],
  });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd services/api-worker; npm test`

Expected: FAIL because `validation.js` doesn’t exist.

- [ ] **Step 3: Implement minimal validation helper**

```js
// services/api-worker/src/validation.js
function validateBatchPayload(body) {
  if (!body || typeof body.exercise_name !== "string" || body.exercise_name.trim() === "") {
    return { ok: false, error: "Invalid exercise_name" };
  }
  if (!Array.isArray(body.sets) || body.sets.length === 0) {
    return { ok: false, error: "Invalid sets" };
  }
  for (const s of body.sets) {
    if (typeof s.weight_value !== "number" || s.weight_value <= 0) {
      return { ok: false, error: "Invalid weight_value" };
    }
    if (s.weight_unit !== "kg" && s.weight_unit !== "lb") {
      return { ok: false, error: "Invalid weight_unit" };
    }
    if (typeof s.reps !== "number" || s.reps <= 0) {
      return { ok: false, error: "Invalid reps" };
    }
  }
  return { ok: true };
}

module.exports = { validateBatchPayload };
```

- [ ] **Step 4: Add test script**

```json
// services/api-worker/package.json
"scripts": {
  "test": "node --test"
}
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `cd services/api-worker; npm test`

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add services/api-worker/src/validation.js services/api-worker/tests/validation.test.js services/api-worker/package.json
git commit -m "test: add batch validation tests"
```

---

### Task 3: Implement batch `/sets` with grouping

**Files:**
- Modify: `services/api-worker/src/index.ts`

- [ ] **Step 1: Write a failing manual test scenario (notes)**

```text
Manual: POST /api/sessions/:id/sets with batch payload should return group_id + set_ids.
```

- [ ] **Step 2: Implement batch handling**

Key changes:
- Import `validateBatchPayload` from `./validation.js`.
- Detect batch: if body.sets exists ? batch path.
- Create `group_id` and `WorkoutGroup` record.
- Create each set with `group_id` + `group_index`.
- Update `WorkoutSession.set_ids` and `WorkoutSession.group_ids`.
- Keep existing single-set support (wrap into batch if body.sets is missing).

Minimal code sketch:
```ts
import { validateBatchPayload } from "./validation.js";

// inside POST /sets
const body = await req.json();
const batch = Array.isArray(body.sets)
  ? body
  : { exercise_name: body.exercise_name, sets: [{ weight_value: body.weight_value, weight_unit: body.weight_unit, reps: body.reps }] };

const validation = validateBatchPayload(batch);
if (!validation.ok) return text(validation.error, 400);

const group_id = crypto.randomUUID();
const set_ids: string[] = [];

for (let i = 0; i < batch.sets.length; i++) {
  const s = batch.sets[i];
  const set: WorkoutSet = {
    id: crypto.randomUUID(),
    session_id,
    group_id,
    group_index: i + 1,
    exercise_name: batch.exercise_name,
    weight_value: s.weight_value,
    weight_unit: s.weight_unit,
    reps: s.reps,
    corrected: false,
    created_at: new Date().toISOString(),
  };
  await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
  set_ids.push(set.id);
}

const group = { id: group_id, session_id, exercise_name: batch.exercise_name, set_ids, created_at: new Date().toISOString() };
await env.KILO_KV.put(`group:${group_id}`, JSON.stringify(group));

// update session
const session = JSON.parse(raw) as WorkoutSession;
session.set_ids.push(...set_ids);
session.group_ids.push(group_id);
await env.KILO_KV.put(`session:${session.id}`, JSON.stringify(session));

return json(batch.sets.length === 1 ? { set_id: set_ids[0], group_id } : { group_id, set_ids });
```

- [ ] **Step 3: Manual test**

Run:
```powershell
# create session
Invoke-RestMethod -Method POST http://127.0.0.1:8787/api/sessions `
  -Headers @{ "content-type" = "application/json" } `
  -Body '{"user_id":"me","workout_date":"2026-03-11"}'

# batch sets
Invoke-RestMethod -Method POST http://127.0.0.1:8787/api/sessions/<SESSION_ID>/sets `
  -Headers @{ "content-type" = "application/json" } `
  -Body '{"exercise_name":"bench press","sets":[{"weight_value":40,"weight_unit":"kg","reps":10},{"weight_value":35,"weight_unit":"kg","reps":12}]}'
```
Expected: JSON with `group_id` + `set_ids`.

- [ ] **Step 4: Commit**

```bash
git add services/api-worker/src/index.ts
git commit -m "feat: add batch sets with grouping"
```

---

## Chunk 2: Frontend Batch Logging

### Task 4: Add batch helper in PWA API

**Files:**
- Modify: `apps/pwa/src/api.js`

- [ ] **Step 1: Add helper**

```js
export async function postSetsBatch(sessionId, exercise, sets) {
  return postJson(`/sessions/${sessionId}/sets`, {
    exercise_name: exercise,
    sets,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pwa/src/api.js
git commit -m "feat: add batch sets api helper"
```

---

### Task 5: Update voice flow to send batches

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: Replace per-set POST with batch POST**

```js
import { postSetsBatch } from "./api.js";

// inside voice loop
const sets = (ex.sets || []).map((s) => ({
  weight_value: s.weight,
  weight_unit: s.unit,
  reps: s.reps,
}));

const created = await postSetsBatch(sessionId, exercise, sets);
// add rows with created.set_ids if returned
```

- [ ] **Step 2: Update UI status**

```js
setText(voiceStatus, `Logged ${data.workout.length} exercises.`);
```

- [ ] **Step 3: Manual test**

1. Start session.
2. Voice log multi-set exercise.
3. Confirm only one network call per exercise in devtools.

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/src/app.js
git commit -m "feat: batch voice logging"
```

---

## Plan Review Loop
- Review each chunk after writing the tasks.
- If subagents are available, dispatch `plan-document-reviewer` per chunk.
- If not available, do a careful self-review and note any risks.

---

## Completion Checklist (manual)
- [ ] Batch `/sets` works with multiple sets.
- [ ] Single-set manual form still works.
- [ ] Sets written with `group_id` and `group_index`.
- [ ] `WorkoutGroup` is stored.
- [ ] UI logs sets from multi-set voice input.
- [ ] Basic error messages shown when parse fails.

