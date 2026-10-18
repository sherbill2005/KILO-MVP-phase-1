# Improving Audio Dead Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove clearly dead frontend files, stale API helpers, and obsolete header leftovers from the improving-audio worktree without changing current live workout behavior.

**Architecture:** This cleanup is intentionally narrow. We will only delete code paths that are unreferenced and tied to older abandoned flows, while leaving the current live websocket/audio pipeline untouched. Verification focuses on ensuring no references remain and existing worker tests still pass.

**Tech Stack:** Vanilla JavaScript PWA frontend, Cloudflare Workers backend, Node test runner, ripgrep.

---

## Chunk 1: Dead frontend removals

### Task 1: Remove unused legacy frontend files

**Files:**
- Delete: `apps/pwa/src/parser.js`
- Delete: `apps/pwa/src/speech.js`
- Verify: `apps/pwa/src/app.js`

- [ ] **Step 1: Confirm the files are unreferenced**

Run: `rg -n "parseWorkoutText|setupSpeech|parser\.js|speech\.js" apps/pwa/src`
Expected: only definitions in the legacy files, no active imports.

- [ ] **Step 2: Delete the unused files**

Delete:
- `apps/pwa/src/parser.js`
- `apps/pwa/src/speech.js`

- [ ] **Step 3: Re-run reference check**

Run: `rg -n "parseWorkoutText|setupSpeech|parser\.js|speech\.js" apps/pwa/src`
Expected: no matches.

### Task 2: Remove dead API helpers

**Files:**
- Modify: `apps/pwa/src/api.js`
- Verify: `apps/pwa/src/app.js`

- [ ] **Step 1: Confirm helper usage**

Run: `rg -n "postSetsBatch|postAudioParse" apps/pwa/src`
Expected: matches only in `apps/pwa/src/api.js`.

- [ ] **Step 2: Remove dead exports**

Delete these functions from `apps/pwa/src/api.js`:
- `postSetsBatch(...)`
- `postAudioParse(...)`

Keep:
- `API_BASE`
- `postJson(...)`
- `patchJson(...)`

- [ ] **Step 3: Verify active imports still resolve**

Run: `rg -n "from \"\.\/api\.js\"|from './api.js'" apps/pwa/src`
Expected: only active imports of `postJson` and `patchJson`.

## Chunk 2: Stale backend leftovers

### Task 3: Remove obsolete header allowance

**Files:**
- Modify: `services/api-worker/src/index.ts`

- [ ] **Step 1: Remove stale CORS header**

In the OPTIONS response, remove `x-exercise-context` from `access-control-allow-headers`.

- [ ] **Step 2: Verify no stale references remain**

Run: `rg -n "x-exercise-context|/ai/parse" apps/pwa/src services/api-worker/src`
Expected: no matches.

## Chunk 3: Verification

### Task 4: Verify cleanup did not break current behavior assumptions

**Files:**
- Verify: `services/api-worker/src/index.ts`
- Verify: `apps/pwa/src/api.js`
- Test: `services/api-worker/tests/validation.test.js`

- [ ] **Step 1: Check git diff for intended files only**

Run: `git diff --stat`
Expected: only `apps/pwa/src/api.js`, `services/api-worker/src/index.ts`, and deleted legacy frontend files.

- [ ] **Step 2: Run backend tests**

Run: `npm test`
Workdir: `services/api-worker`
Expected: `3 passed, 0 failed`.

- [ ] **Step 3: Sanity-check removed symbols**

Run: `rg -n "parseWorkoutText|setupSpeech|postSetsBatch|postAudioParse|x-exercise-context" apps/pwa/src services/api-worker/src`
Expected: no matches.
