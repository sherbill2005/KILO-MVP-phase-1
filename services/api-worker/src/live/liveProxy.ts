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

function getGeminiDebugPayload(msg: any) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.setupComplete || msg.setup_complete) {
    return { setupComplete: true };
  }

  const serverContent = msg.serverContent || msg.server_content;
  if (!serverContent) return null;

  const inputText =
    serverContent.inputTranscription?.text ||
    serverContent.input_transcription?.text;
  if (inputText) {
    return { serverContent: { inputTranscription: { text: inputText } } };
  }

  const outputText =
    serverContent.outputTranscription?.text ||
    serverContent.output_transcription?.text;
  if (outputText) {
    return { serverContent: { outputTranscription: { text: outputText } } };
  }

  const parts =
    serverContent.modelTurn?.parts || serverContent.model_turn?.parts || [];
  const textParts = parts
    .filter((part: any) => typeof part?.text === "string" && part.text.trim())
    .map((part: any) => ({ text: part.text }));
  if (textParts.length > 0) {
    return { serverContent: { modelTurn: { parts: textParts } } };
  }

  if (serverContent.turnComplete || serverContent.turn_complete) {
    return {
      serverContent: { turnComplete: true },
      usageMetadata: msg.usageMetadata || msg.usage_metadata,
    };
  }

  if (serverContent.generationComplete || serverContent.generation_complete) {
    return { serverContent: { generationComplete: true } };
  }

  return null;
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
  let inputTranscript = "";
  let outputTranscript = "";
  let activityStarted = false;
  let contextReceived = false;

  const model = env.GEMINI_LIVE_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const url =
    "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
    `?key=${env.GEMINI_API_KEY}`;

  const geminiResp = await fetch(url, {
    headers: { Upgrade: "websocket" },
  });
  const gemini = geminiResp.webSocket;
  if (!gemini) {
    sendClientMessage({ type: "status", value: "error" });
    return new Response(null, { status: 101, webSocket: client });
  }
  gemini.accept();
  gemini.addEventListener("error", (e) => {
    console.error("[live] gemini WS error", e);
  });
  gemini.addEventListener("close", (e) => {
    if (e.code !== 1000) {
      console.error("[live] gemini WS close", e.code, e.reason);
    }
  });

  function sendClientMessage(message: WorkerToClientMessage) {
    worker.send(JSON.stringify(message));
  }

  function sendSetup() {
    if (setupSent) return;
    setupSent = true;
    const instruction = `You are a specialized parser. Your only world exists within this list of exercises:\n${exerciseContext.join(",")}\n\nRules:\n- Ignore irrelevant words.\n- Prefer exact matches from the list.\n- SPEAK ONLY JSON. No extra words.\n- Output schema: {"workout":[{"exercise":"...","sets":[{"weight":0,"unit":"kg|lb","reps":0}]}]}\n- If sets are missing weights or reps, repeat the last known value.\n- If no clear workout is present, SPEAK {"error":"no_match"} only.`;

    const setup = {
      setup: {
        model: `models/${model}`,
        // Native audio models only support AUDIO response modality.
        // We rely on output_audio_transcription for text. See:
        // https://ai.google.dev/gemini-api/docs/live-api/capabilities#response_modalities
        generation_config: { response_modalities: ["AUDIO"] },
        system_instruction: { parts: [{ text: instruction }] },
        input_audio_transcription: {},
        output_audio_transcription: {},
        realtime_input_config: {
          automatic_activity_detection: {
            disabled: true,
          },
        },
      },
    };
    gemini.send(JSON.stringify(setup));
    // Live WebSocket docs don't guarantee a setupComplete event.
    setupComplete = true;
    if (buffered.length) {
      for (const chunk of buffered) {
        sendAudio(chunk);
      }
      buffered = [];
      bufferedBytes = 0;
    }
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
    if (!activityStarted) {
      const startMsg = { realtime_input: { activity_start: {} } };
      gemini.send(JSON.stringify(startMsg));
      activityStarted = true;
    }
    // DEBUG: forwarding audio to Gemini (remove later)
    const data = arrayBufferToBase64(chunk);
    const msg = {
      realtime_input: {
        audio: {
          mime_type: AUDIO_MIME,
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
    let msg: any;
    if (typeof event.data === "string") {
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.error("[live] gemini msg parse error", err);
        return;
      }
    } else if (event.data instanceof ArrayBuffer) {
      // Gemini may send JSON text frames as binary or audio bytes.
      const text = new TextDecoder("utf-8").decode(new Uint8Array(event.data));
      if (text.trim().startsWith("{")) {
        try {
          msg = JSON.parse(text);
        } catch (err) {
          console.error("[live] gemini binary parse error", err);
          return;
        }
      } else {
        return;
      }
    } else {
      return;
    }

    const debugPayload = getGeminiDebugPayload(msg);
    if (debugPayload) {
      const rawType = typeof event.data;
      const ctor = (event.data as any)?.constructor?.name;
      console.log("[DEBUG][LIVE] gemini msg type:", rawType, ctor || "");
      try {
        console.log("[DEBUG][LIVE] gemini msg:", JSON.stringify(debugPayload).slice(0, 500));
      } catch {}
    }

    if (msg.setupComplete || msg.setup_complete) {
      setupComplete = true;
      sendClientMessage({ type: "status", value: "listening" });
      return;
    }

    const serverContent = msg.serverContent || msg.server_content;
    if (serverContent?.modelTurn?.parts || serverContent?.model_turn?.parts) {
      const parts =
        serverContent.modelTurn?.parts || serverContent.model_turn?.parts || [];
      for (const part of parts) {
        if (part.text) accumulatedText += part.text;
      }
    }

    if (serverContent?.inputTranscription?.text || serverContent?.input_transcription?.text) {
      inputTranscript +=
        serverContent.inputTranscription?.text ||
        serverContent.input_transcription?.text ||
        "";
    }
    if (serverContent?.outputTranscription?.text || serverContent?.output_transcription?.text) {
      outputTranscript +=
        serverContent.outputTranscription?.text ||
        serverContent.output_transcription?.text ||
        "";
    }

    if (serverContent?.turnComplete || serverContent?.turn_complete) {
      const textSource = outputTranscript || accumulatedText;
      const parsed = extractJson(textSource);
      const transcript = inputTranscript || "";
      accumulatedText = "";
      inputTranscript = "";
      outputTranscript = "";

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
            transcript,
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
        if (activityStarted) {
          const stopMsg = { realtime_input: { activity_end: {} } };
          gemini.send(JSON.stringify(stopMsg));
          activityStarted = false;
        }
      }
      return;
    }

    let audioBuffer: ArrayBuffer | null = null;
    if (event.data instanceof ArrayBuffer) {
      audioBuffer = event.data;
    } else if (ArrayBuffer.isView(event.data)) {
      const view = event.data as ArrayBufferView;
      audioBuffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    } else if (event.data instanceof Blob) {
      audioBuffer = await event.data.arrayBuffer();
    }

    if (audioBuffer) {
      if (!sessionId) {
        bufferAudio(audioBuffer);
      } else {
        sendAudio(audioBuffer);
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
