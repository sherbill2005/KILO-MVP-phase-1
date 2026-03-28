import type { Env } from "../env";
import type {
  WorkoutGroup,
  WorkoutSession,
  WorkoutSet,
} from "../../../packages/shared/types/workoutModel";
import type { ClientToWorkerMessage, WorkerToClientMessage } from "./types";
import { validateBatchPayload } from "../validation.js";

const BUFFER_LIMIT_BYTES = 64000;
const AUDIO_MIME = "audio/pcm;rate=16000";

// Send a structured message back to the browser socket.
function sendMessage(worker: WebSocket, message: WorkerToClientMessage) {
  worker.send(JSON.stringify(message));
}

// Convert raw PCM bytes into a base64 string for Gemini's JSON payload.
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// Keep Gemini debug output readable by extracting only the useful fields.
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
    return { serverContent: { turnComplete: true } };
  }

  if (serverContent.generationComplete || serverContent.generation_complete) {
    return { serverContent: { generationComplete: true } };
  }

  return null;
}

// Try to recover a JSON object from model text that may contain extra words.
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

// Persist a parsed live workout into KV and return the created ids.
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

// Bridge the browser's live audio socket to Gemini Live for one session.
export async function handleLiveWs(req: Request, env: Env): Promise<Response> {
  const pair = new WebSocketPair();
  const client = pair[0];
  const worker = pair[1];
  worker.accept();

  let sessionId: string | null = null;
  let exerciseContext: string[] = [];
  let gemini: WebSocket | null = null;
  let setupSent = false;
  let setupComplete = false;
  let contextReceived = false;
  let activityStarted = false;
  let bufferedChunks: ArrayBuffer[] = [];
  let bufferedBytes = 0;
  let accumulatedText = "";
  let inputTranscript = "";
  let outputTranscript = "";

  const model =
    env.GEMINI_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const url =
    "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
    `?key=${env.GEMINI_API_KEY}`;

  // Keep a small rolling audio buffer while Gemini setup is still catching up.
  function bufferAudio(chunk: ArrayBuffer) {
    bufferedChunks.push(chunk);
    bufferedBytes += chunk.byteLength;

    while (bufferedBytes > BUFFER_LIMIT_BYTES) {
      const dropped = bufferedChunks.shift();
      if (dropped) bufferedBytes -= dropped.byteLength;
    }
  }

  // Flush any buffered chunks once Gemini is ready to receive audio.
  function flushBufferedAudio() {
    if (!bufferedChunks.length) return;

    const chunks = bufferedChunks;
    bufferedChunks = [];
    bufferedBytes = 0;

    for (const chunk of chunks) {
      sendAudio(chunk);
    }
  }

  // Send the one-time Gemini setup packet after exercise context is known.
  function sendSetup() {
    if (!gemini || setupSent) return;
    setupSent = true;

    const instruction = `You are a specialized parser. Your only world exists within this list of exercises:\n${exerciseContext.join(",")}\n\nRules:\n- Ignore irrelevant words.\n- Prefer exact matches from the list.\n- SPEAK ONLY JSON. No extra words.\n- Output schema: {"workout":[{"exercise":"...","sets":[{"weight":0,"unit":"kg|lb","reps":0}]}]}\n- If sets are missing weights or reps, repeat the last known value.\n- If no clear workout is present, SPEAK {"error":"no_match"} only.`;

    gemini.send(
      JSON.stringify({
        setup: {
          model: `models/${model}`,
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
      })
    );

    // Keep the pipeline moving even if setupComplete arrives late or not at all.
    setupComplete = true;
    flushBufferedAudio();
  }

  // Forward one PCM chunk to Gemini, starting the activity on first audio.
  function sendAudio(chunk: ArrayBuffer) {
    if (!gemini || gemini.readyState !== WebSocket.OPEN) {
      bufferAudio(chunk);
      return;
    }

    if (!setupComplete) {
      bufferAudio(chunk);
      return;
    }

    if (!activityStarted) {
      gemini.send(JSON.stringify({ realtime_input: { activity_start: {} } }));
      activityStarted = true;
    }

    gemini.send(
      JSON.stringify({
        realtime_input: {
          audio: {
            mime_type: AUDIO_MIME,
            data: arrayBufferToBase64(chunk),
          },
        },
      })
    );
  }

  try {
    const geminiResp = await fetch(url, {
      headers: { Upgrade: "websocket" },
    });
    gemini = geminiResp.webSocket;

    if (!gemini) {
      console.error("[live] failed to create Gemini websocket");
    } else {
      gemini.accept();

      gemini.addEventListener("open", () => {
        if (contextReceived && !setupSent) {
          sendSetup();
        }
      });

      gemini.addEventListener("error", (event) => {
        console.error("[live] gemini WS error", event);
      });

      gemini.addEventListener("close", (event) => {
        if (event.code !== 1000) {
          console.error("[live] gemini WS close", event.code, event.reason);
        }
      });

      // Decode Gemini responses, log the readable parts, and emit final results.
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
          const text = new TextDecoder("utf-8").decode(
            new Uint8Array(event.data)
          );
          if (!text.trim().startsWith("{")) return;

          try {
            msg = JSON.parse(text);
          } catch (err) {
            console.error("[live] gemini binary parse error", err);
            return;
          }
        } else {
          return;
        }

        if (msg.setupComplete || msg.setup_complete) {
          setupComplete = true;
          flushBufferedAudio();
        }

        const debugPayload = getGeminiDebugPayload(msg);
        if (debugPayload) {
          const rawType = typeof event.data;
          const ctor = (event.data as any)?.constructor?.name;
          console.log("[DEBUG][LIVE] gemini msg type:", rawType, ctor || "");
          try {
            console.log(
              "[DEBUG][LIVE] gemini msg:",
              JSON.stringify(debugPayload).slice(0, 500)
            );
          } catch {}
        }

        const serverContent = msg.serverContent || msg.server_content;
        if (!serverContent) return;

        const parts =
          serverContent.modelTurn?.parts ||
          serverContent.model_turn?.parts ||
          [];
        for (const part of parts) {
          if (part.text) {
            accumulatedText += part.text;
          }
        }

        if (
          serverContent.inputTranscription?.text ||
          serverContent.input_transcription?.text
        ) {
          inputTranscript +=
            serverContent.inputTranscription?.text ||
            serverContent.input_transcription?.text ||
            "";
        }

        if (
          serverContent.outputTranscription?.text ||
          serverContent.output_transcription?.text
        ) {
          outputTranscript +=
            serverContent.outputTranscription?.text ||
            serverContent.output_transcription?.text ||
            "";
        }

        if (serverContent.turnComplete || serverContent.turn_complete) {
          const textSource = outputTranscript || accumulatedText;
          const parsed = extractJson(textSource);
          const transcript = inputTranscript || "";

          accumulatedText = "";
          inputTranscript = "";
          outputTranscript = "";

          if (parsed && Array.isArray(parsed.workout)) {
            try {
              if (!sessionId) {
                sendMessage(worker, { type: "status", value: "error" });
                return;
              }

              const logged = await logWorkout(env, sessionId, parsed.workout);
              sendMessage(worker, {
                type: "result",
                workout: parsed.workout,
                group_ids: logged.group_ids,
                set_ids: logged.set_ids,
                transcript,
              });
            } catch (error) {
              console.error("[live] failed to log workout", error);
              sendMessage(worker, { type: "status", value: "error" });
            }
          } else if (parsed?.error === "no_match") {
            sendMessage(worker, { type: "status", value: "no_match" });
          } else {
            sendMessage(worker, { type: "status", value: "error" });
          }
        }
      });
    }
  } catch (error) {
    console.error("[live] failed to connect Gemini websocket", error);
  }

  // Handle browser control messages and PCM chunks for this live session.
  worker.addEventListener("message", async (event) => {
    if (typeof event.data !== "string") {
      let audioBuffer: ArrayBuffer | null = null;

      if (event.data instanceof ArrayBuffer) {
        audioBuffer = event.data;
      } else if (
        typeof SharedArrayBuffer !== "undefined" &&
        event.data instanceof SharedArrayBuffer
      ) {
        audioBuffer = new Uint8Array(event.data).slice().buffer;
      } else if (ArrayBuffer.isView(event.data)) {
        const view = event.data as ArrayBufferView;
        audioBuffer = new Uint8Array(
          view.buffer,
          view.byteOffset,
          view.byteLength
        ).slice().buffer;
      } else if (event.data instanceof Blob) {
        audioBuffer = await event.data.arrayBuffer();
      }

      if (audioBuffer) {
        sendAudio(audioBuffer);
      }
      return;
    }

    let msg: ClientToWorkerMessage;
    try {
      msg = JSON.parse(event.data) as ClientToWorkerMessage;
    } catch (error) {
      console.error("[live] client message parse error", error);
      return;
    }

    if (msg.type === "ping") {
      sendMessage(worker, { type: "pong" });
      return;
    }

    if (msg.type === "session") {
      sessionId = msg.session_id;
      sendMessage(worker, { type: "ack" });
      return;
    }

    if (msg.type === "context") {
      exerciseContext = msg.exercises || [];
      contextReceived = true;
      if (gemini && gemini.readyState === WebSocket.OPEN && !setupSent) {
        sendSetup();
      }
      sendMessage(worker, { type: "ack_context" });
      return;
    }

    if (msg.type === "stop") {
      sendMessage(worker, { type: "status", value: "processing" });
      if (gemini && gemini.readyState === WebSocket.OPEN && activityStarted) {
        gemini.send(JSON.stringify({ realtime_input: { activity_end: {} } }));
        activityStarted = false;
      }
    }
  });

  // Close the Gemini socket when the browser disconnects.
  worker.addEventListener("close", () => {
    try {
      gemini?.close();
    } catch {}
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
