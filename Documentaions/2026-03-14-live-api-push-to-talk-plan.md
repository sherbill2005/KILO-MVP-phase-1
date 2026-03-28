# Live API Push-to-Talk Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace REST audio parsing with a Worker-proxied Gemini Live API WebSocket pipeline that streams PCM16 audio and auto-logs multi-set results.

**Architecture:** Browser opens a WebSocket to the Worker, sends session/context JSON then PCM16 audio frames. The Worker opens a WebSocket to Gemini Live API, forwards audio, receives final JSON, auto-logs sets, and sends a summary to the browser.

**Tech Stack:** Cloudflare Workers (TypeScript), WebSockets, PWA (vanilla JS), Gemini Live API

---

## File Structure Changes

- Create: `services/api-worker/src/live/liveProxy.ts`
  - Gemini Live WebSocket client + message framing
- Create: `services/api-worker/src/live/types.ts`
  - Shared types for WS messages (client?worker, worker?gemini)
- Modify: `services/api-worker/src/index.ts`
  - Add WebSocket upgrade route `/ws/ai/live`
  - Keep existing REST endpoints intact
- Modify: `services/api-worker/src/env.d.ts`
  - Add `GEMINI_LIVE_MODEL` (if not already)
- Modify: `apps/pwa/src/audio.js`
  - Add PCM16 streaming pipeline + silence detection (2s)
- Modify: `apps/pwa/src/app.js`
  - WebSocket connect + send session/context + handle results
- Modify: `apps/pwa/src/api.js`
  - (Optional) keep REST helper for fallback
- Create: `apps/pwa/src/ws.js`
  - WebSocket client wrapper for live stream

---

## Chunk 1: Worker WebSocket Proxy

### Task 1: Define WS message types

**Files:**
- Create: `services/api-worker/src/live/types.ts`

- [ ] **Step 1: Write minimal type definitions**

```ts
export type ClientToWorkerMessage =
  | { type: "session"; session_id: string }
  | { type: "context"; exercises: string[] };

export type WorkerToClientMessage =
  | { type: "status"; value: "listening" | "processing" | "error" }
  | { type: "result"; workout: unknown[]; group_ids: string[]; set_ids: string[] };
```

- [ ] **Step 2: Commit**

```bash
git add services/api-worker/src/live/types.ts
git commit -m "feat: add live ws types"
```

---

### Task 2: Implement Gemini Live proxy

**Files:**
- Create: `services/api-worker/src/live/liveProxy.ts`

- [ ] **Step 1: Add minimal proxy skeleton**

```ts
import type { Env } from "../env";
import type { ClientToWorkerMessage, WorkerToClientMessage } from "./types";

export async function handleLiveWs(req: Request, env: Env): Promise<Response> {
  const pair = new WebSocketPair();
  const client = pair[0];
  const worker = pair[1];
  worker.accept();

  // TODO: connect to Gemini Live WS
  worker.send(JSON.stringify({ type: "status", value: "listening" } satisfies WorkerToClientMessage));

  return new Response(null, { status: 101, webSocket: client });
}
```

- [ ] **Step 2: Commit**

```bash
git add services/api-worker/src/live/liveProxy.ts
git commit -m "feat: add live ws proxy skeleton"
```

---

### Task 3: Wire WS route in Worker

**Files:**
- Modify: `services/api-worker/src/index.ts`

- [ ] **Step 1: Add route**

```ts
import { handleLiveWs } from "./live/liveProxy";

if (req.method === "GET" && url.pathname === "/ws/ai/live") {
  return handleLiveWs(req, env);
}
```

- [ ] **Step 2: Commit**

```bash
git add services/api-worker/src/index.ts
git commit -m "feat: add live ws route"
```

---

## Chunk 2: Client Streaming + Silence Detection

### Task 4: Add WebSocket client wrapper

**Files:**
- Create: `apps/pwa/src/ws.js`

- [ ] **Step 1: Minimal wrapper**

```js
export function openLiveSocket() {
  return new WebSocket("ws://127.0.0.1:8787/ws/ai/live");
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pwa/src/ws.js
git commit -m "feat: add live ws client"
```

---

### Task 5: Stream PCM16 audio with silence detection

**Files:**
- Modify: `apps/pwa/src/audio.js`

- [ ] **Step 1: Implement PCM16 stream + silence timer**

Pseudo-code structure:
```js
// Create AudioContext
// Create ScriptProcessor or AudioWorklet
// Downsample to 16k
// Convert float ? int16 PCM
// Track RMS energy
// If silence for 2s -> stop
// Send PCM chunks over WS
```

- [ ] **Step 2: Manual test**

Open console, verify chunks are sent, and auto-stop after ~2s silence.

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/audio.js
git commit -m "feat: stream pcm16 with silence detection"
```

---

### Task 6: Update app.js to use live WS

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: Open WS on voice start**
- [ ] **Step 2: Send session + context messages**
- [ ] **Step 3: Display status and result**

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/src/app.js
git commit -m "feat: wire live ws in ui"
```

---

## Chunk 3: Gemini Live Integration + Auto-Logging

### Task 7: Implement Live API connection in Worker

**Files:**
- Modify: `services/api-worker/src/live/liveProxy.ts`

- [ ] **Step 1: Open Gemini Live WS**
- [ ] **Step 2: Forward audio frames**
- [ ] **Step 3: Receive final JSON**
- [ ] **Step 4: Auto-log sets (batch)**
- [ ] **Step 5: Return summary to client**

- [ ] **Step 6: Commit**

```bash
git add services/api-worker/src/live/liveProxy.ts
git commit -m "feat: live api ws + auto-log"
```

---

## Manual Verification
- [ ] Start worker + PWA.
- [ ] Tap voice ? speak ? auto-stop on 2s silence.
- [ ] Verify logs are created in KV and UI updates.

