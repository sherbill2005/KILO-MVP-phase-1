import type { Env } from "../env";
import type { WorkoutGroup, WorkoutSession, WorkoutSet } from "../../../packages/shared/types/workoutModel";
import type { ClientToWorkerMessage, WorkerToClientMessage } from "./types";
import { validateBatchPayload } from "../validation.js";

const BUFFER_LIMIT_BYTES = 64000;
const AUDIO_MIME = "audio/pcm;rate=16000";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function logWorkout(env: Env, sessionId: string, workout: any[]) {
  const raw = await env.KILO_KV.get(`session:${sessionId}`);
  if (!raw) throw new Error("Session not found");
  const session = JSON.parse(raw) as WorkoutSession;
  if (!Array.isArray(session.group_ids)) session.group_ids = [];

  const group_ids: string[] = [];
  const set_ids: string[] = [];

  for (const ex of workout) {
    const batch = {
      exercise_name: ex.exercise,
      sets: (ex.sets || []).map((s: any) => ({
        weight_value: s.weight,
        weight_unit: s.unit,
        reps: s.reps,
      })),
    };

    const validation = validateBatchPayload(batch);
    if (!validation.ok) {
      throw new Error(validation.message || "Invalid batch payload");
    }

    const group_id = crypto.randomUUID();
    const ids: string[] = [];

    for (let i = 0; i < batch.sets.length; i++) {
      const s = batch.sets[i];
      const set: WorkoutSet = {
        id: crypto.randomUUID(),
        session_id: sessionId,
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
      ids.push(set.id);
      set_ids.push(set.id);
    }

    const group: WorkoutGroup = {
      id: group_id,
      session_id: sessionId,
      exercise_name: batch.exercise_name,
      set_ids: ids,
      created_at: new Date().toISOString(),
    };
    await env.KILO_KV.put(`group:${group_id}`, JSON.stringify(group));
    group_ids.push(group_id);
  }

  session.set_ids.push(...set_ids);
  session.group_ids.push(...group_ids);
  await env.KILO_KV.put(`session:${sessionId}`, JSON.stringify(session));

  return { group_ids, set_ids };
}

export async function handleLiveWs(req: Request, env: Env): Promise<Response> {
  const pair = new WebSocketPair();
  const client = pair[0];
  const worker = pair[1];
  worker.accept();

  let sessionId: string | null = null;
  let exerciseContext: string[] = [];
  let buffered: ArrayBuffer[] = [];
  let bufferedBytes = 0;
  let setupSent = false;
  let setupComplete = false;
  let accumulatedText = "";
  let contextReceived = false;

  const model = env.GEMINI_LIVE_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const url =
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
    `?key=${env.GEMINI_API_KEY}`;

  const gemini = new WebSocket(url);

  function sendClientMessage(message: WorkerToClientMessage) {
    worker.send(JSON.stringify(message));
  }

  function sendSetup() {
    if (setupSent) return;
    setupSent = true;
    const instruction = `You are a specialized parser. Your only world exists within this list of exercises:\n${exerciseContext.join(",")}\n\nRules:\n- Ignore irrelevant words.\n- Prefer exact matches from the list.\n- Only return JSON.\n- Output a workout array with exercises and sets.\n- If sets are missing weights or reps, repeat the last known value.`;

    const setup = {
      setup: {
        model: `models/${model}`,
        systemInstruction: { parts: [{ text: instruction }] },
        realtimeInputConfig: {
          automaticActivityDetection: {
            silenceDurationMs: 2000,
          },
        },
      },
    };
    gemini.send(JSON.stringify(setup));
  }

  function bufferAudio(chunk: ArrayBuffer) {
    buffered.push(chunk);
    bufferedBytes += chunk.byteLength;
    while (bufferedBytes > BUFFER_LIMIT_BYTES) {
      const dropped = buffered.shift();
      if (dropped) bufferedBytes -= dropped.byteLength;
    }
  }

  function sendAudio(chunk: ArrayBuffer) {
    if (!setupComplete) {
      bufferAudio(chunk);
      return;
    }
    const data = arrayBufferToBase64(chunk);
    const msg = {
      realtimeInput: {
        audio: {
          mimeType: AUDIO_MIME,
          data,
        },
      },
    };
    gemini.send(JSON.stringify(msg));
  }

  gemini.addEventListener("open", () => {
    if (contextReceived && !setupSent) {
      sendSetup();
    }
  });

  gemini.addEventListener("message", async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.setupComplete) {
      setupComplete = true;
      sendClientMessage({ type: "status", value: "listening" });
      for (const chunk of buffered) {
        sendAudio(chunk);
      }
      buffered = [];
      bufferedBytes = 0;
      return;
    }

    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.text) accumulatedText += part.text;
      }
    }

    if (msg.serverContent?.turnComplete) {
      const parsed = extractJson(accumulatedText);
      accumulatedText = "";

      if (parsed && Array.isArray(parsed.workout)) {
        try {
          sendClientMessage({ type: "status", value: "processing" });
          if (!sessionId) {
            sendClientMessage({ type: "status", value: "error" });
            return;
          }
          const logged = await logWorkout(env, sessionId, parsed.workout);
          sendClientMessage({
            type: "result",
            workout: parsed.workout,
            group_ids: logged.group_ids,
            set_ids: logged.set_ids,
          });
        } catch (err) {
          console.error("[live] log error", err);
          sendClientMessage({ type: "status", value: "error" });
        }
      }
    }
  });

  worker.addEventListener("message", async (event) => {
    if (typeof event.data === "string") {
      const msg = JSON.parse(event.data) as ClientToWorkerMessage | { type: "stop" };
      if (msg.type === "session") {
        sessionId = msg.session_id;
        const raw = await env.KILO_KV.get(`session:${sessionId}`);
        if (!raw) {
          sendClientMessage({ type: "status", value: "error" });
        }
      }
      if (msg.type === "context") {
        exerciseContext = msg.exercises || [];
        contextReceived = true;
        if (!setupSent && gemini.readyState === WebSocket.OPEN) {
          sendSetup();
        }
      }
      if (msg.type === "stop") {
        sendClientMessage({ type: "status", value: "processing" });
        const stopMsg = { realtimeInput: { audioStreamEnd: true } };
        gemini.send(JSON.stringify(stopMsg));
      }
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      if (!sessionId) {
        bufferAudio(event.data);
      } else {
        sendAudio(event.data);
      }
    }
  });

  worker.addEventListener("close", () => {
    try {
      gemini.close();
    } catch {}
  });

  sendClientMessage({ type: "status", value: "listening" });
  return new Response(null, { status: 101, webSocket: client });
}
