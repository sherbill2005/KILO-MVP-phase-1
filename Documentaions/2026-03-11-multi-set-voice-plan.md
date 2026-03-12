# Multi-Set Voice Logging Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one voice input to log multiple sets and multiple exercises using Gemini audio output.

**Architecture:** Gemini returns a structured `workout[]` array (exercise + sets). Frontend iterates through the array and creates one set per entry. Backend enforces JSON schema with `responseSchema`.

**Tech Stack:** Cloudflare Workers (TypeScript), Gemini API (REST), PWA (vanilla JS modules).

---

## File Structure (changes)
- Modify: `services/api-worker/src/ai/gemini.ts` — update schema and parsing to return `workout[]`
- Modify: `services/api-worker/src/index.ts` — no logic change, keep same endpoint
- Modify: `apps/pwa/src/app.js` — iterate `workout[]` and log multiple sets
- (Optional) Modify: `apps/pwa/src/api.js` — no change needed

---

## Chunk 1: Backend Schema + Parsing

### Task 1: Update Gemini schema + return shape

**Files:**
- Modify: `services/api-worker/src/ai/gemini.ts`

- [ ] **Step 1: Write the failing test**

No test harness exists. Create a minimal inline test plan:
```
Manual test: call /api/ai/parse and verify JSON contains workout[]
Expected: workout is an array; each element has exercise + sets[]
```

- [ ] **Step 2: Run test to verify it fails**

Run with current code (single-set). Expected: `workout` missing.

- [ ] **Step 3: Write minimal implementation**

Update schema + parsing to:
```
type GeminiResult = { transcript: string; workout: Array<{ exercise: string; sets: Array<{ weight: number; unit: "kg"|"lb"; reps: number }> }> };
```
Update `responseSchema` to require `workout[]` and remove single-set fields.
Update parsing to return `workout` array and sanitize invalid items.

- [ ] **Step 4: Run test to verify it passes**

Re-run manual test: expect `workout[]` present.

- [ ] **Step 5: Commit**

```
git add services/api-worker/src/ai/gemini.ts
git commit -m "feat: gemini returns workout arrays for multi-set logging"
```

---

## Chunk 2: Frontend Multi-Set Logging

### Task 2: Consume workout[] and log all sets

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: Write the failing test**

Manual test plan:
```
Input: "bench press 3 sets 40kg 10 reps"
Expected: 3 rows added to table + 3 POSTs
```

- [ ] **Step 2: Run test to verify it fails**

Current code only logs one set. Expect 1 row only.

- [ ] **Step 3: Write minimal implementation**

Replace single-set handling with:
- loop `for (const ex of data.workout)`
- loop `for (const s of ex.sets)`
- POST each set
- add each row

- [ ] **Step 4: Run test to verify it passes**

Speak the multi-set command. Expect 3 rows.

- [ ] **Step 5: Commit**

```
git add apps/pwa/src/app.js
git commit -m "feat: log multiple sets from single voice input"
```

---

## Chunk 3: End-to-End Verification

### Task 3: Manual E2E

**Files:**
- No code changes

- [ ] **Step 1: Run services**
```
cd services/api-worker
npx wrangler dev
```
```
cd apps/pwa
python -m http.server 5173
```

- [ ] **Step 2: Test examples**

1. "log bench press of 3 sets 40kg 10 reps"
2. "tricep pushdown 4 sets 20kg for 8, 10, 13 and bench press 3 sets 60kg for 7, 9 reps"

Expected: correct rows + set counts.

- [ ] **Step 3: Commit (if any fixes)**

```
git add -A
git commit -m "chore: verify multi-set logging"
```

---

**Plan complete and saved to `Documentaions/2026-03-11-multi-set-voice-plan.md`. Ready to execute?**
