import type { Env } from "../env";
import type { ClientToWorkerMessage, WorkerToClientMessage } from "./types";
import {
  createActivityEndMessage,
  createActivityStartMessage,
  createAudioMessage,
  createSetupMessage,
  extractJson,
  parseGeminiEventData,
} from "./geminiProtocol";
import { logWorkout } from "./persistWorkout";

const BUFFER_LIMIT_BYTES = 64000;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function sendMessage(worker: WebSocket, message: WorkerToClientMessage) {
  worker.send(JSON.stringify(message));
}

export async function handleLiveWs(_req: Request, env: Env): Promise<Response> {
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

  const model =
    env.GEMINI_LIVE_MODEL ||
    env.GEMINI_MODEL ||
    "gemini-2.5-flash-native-audio-preview-12-2025";
  const url =
    "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
    `?key=${env.GEMINI_API_KEY}`;

  let gemini: WebSocket;
  try {
    const geminiResp = await fetch(url, {
      headers: { Upgrade: "websocket" },
    });
    const geminiSocket = geminiResp.webSocket;
    if (!geminiSocket) {
      console.error("[live] Gemini WS upgrade failed");
      sendMessage(worker, { type: "status", value: "error" });
      return new Response(null, { status: 101, webSocket: client });
    }
    gemini = geminiSocket;
    gemini.accept();
  } catch (err) {
    console.error("[live] Gemini WS connect error", err);
    sendMessage(worker, { type: "status", value: "error" });
    return new Response(null, { status: 101, webSocket: client });
  }

  gemini.addEventListener("error", (event) => {
    console.error("[live] gemini WS error", event);
    sendMessage(worker, { type: "status", value: "error" });
  });
  gemini.addEventListener("close", (event) => {
    console.log("[live] gemini WS close", event.code, event.reason);
    if (event.code !== 1000) {
      sendMessage(worker, { type: "status", value: "error" });
    }
    try { worker.close(event.code || 1000, event.reason || "gemini closed"); } catch {}
  });

  function bufferAudio(chunk: ArrayBuffer) {
    buffered.push(chunk);
    bufferedBytes += chunk.byteLength;
    while (bufferedBytes > BUFFER_LIMIT_BYTES) {
      const dropped = buffered.shift();
      if (dropped) bufferedBytes -= dropped.byteLength;
    }
  }

  function flushBufferedAudio() {
    if (!buffered.length) return;
    const chunks = buffered;
    buffered = [];
    bufferedBytes = 0;

    for (const chunk of chunks) {
      sendAudio(chunk);
    }
  }

  function sendSetup() {
    if (setupSent) return;
    setupSent = true;
    console.log("[DEBUG][LIVE] sending Gemini setup for model:", model);
    gemini.send(
      JSON.stringify(createSetupMessage(model, exerciseContext))
    );
    // NOTE: Do NOT set setupComplete here.
    // Audio stays buffered until Gemini confirms setup via setupComplete message.
  }

  function sendAudio(chunk: ArrayBuffer) {
    if (!setupComplete) {
      bufferAudio(chunk);
      return;
    }

    if (!activityStarted) {
      console.log("[DEBUG][LIVE] sending activity_start");
      gemini.send(JSON.stringify(createActivityStartMessage()));
      activityStarted = true;
    }

    gemini.send(JSON.stringify(createAudioMessage(chunk)));
  }

  gemini.addEventListener("open", () => {
    if (contextReceived && !setupSent) {
      sendSetup();
    }
  });

  gemini.addEventListener("message", async (event) => {
    let msg: any;

    try {
      msg = parseGeminiEventData(event.data);
    } catch (error) {
      console.error("[live] gemini parse error", error);
      return;
    }

    if (!msg) {
      console.log("[DEBUG][LIVE] gemini msg was null/undefined");
      return;
    }

    // Log every message's top-level keys
    console.log("[DEBUG][LIVE] gemini msg keys:", Object.keys(msg).join(", "));

    if (msg.setupComplete || msg.setup_complete) {
      setupComplete = true;
      console.log("[DEBUG][LIVE] Gemini setup complete — flushing buffered audio");
      sendMessage(worker, { type: "status", value: "listening" });
      flushBufferedAudio();
      return;
    }

    const serverContent = msg.serverContent || msg.server_content;
    if (!serverContent) {
      console.log("[DEBUG][LIVE] no serverContent, raw msg:", JSON.stringify(msg).slice(0, 500));
      return;
    }

    console.log("[DEBUG][LIVE] serverContent keys:", Object.keys(serverContent).join(", "));

    const parts =
      serverContent.modelTurn?.parts || serverContent.model_turn?.parts || [];
    
    for (const part of parts) {
      if (part.text) {
        console.log("[DEBUG][LIVE] text part:", part.text.slice(0, 200));
        accumulatedText += part.text;
      }
      if (part.inlineData || part.inline_data) {
        const d = part.inlineData || part.inline_data;
        console.log("[DEBUG][LIVE] audio part, mime:", d?.mimeType || d?.mime_type, "len:", d?.data?.length || 0);
      }
    }

    if (
      serverContent.inputTranscription?.text ||
      serverContent.input_transcription?.text
    ) {
      const t = serverContent.inputTranscription?.text ||
        serverContent.input_transcription?.text || "";
      console.log("[DEBUG][LIVE] inputTranscription:", t.slice(0, 200));
      inputTranscript += t;
    }

    if (
      serverContent.outputTranscription?.text ||
      serverContent.output_transcription?.text
    ) {
      const t = serverContent.outputTranscription?.text ||
        serverContent.output_transcription?.text || "";
      console.log("[DEBUG][LIVE] outputTranscription:", t.slice(0, 200));
      outputTranscript += t;
    }

    if (serverContent.turnComplete || serverContent.turn_complete) {
      console.log("[DEBUG][LIVE] === TURN COMPLETE ===");
      console.log("[DEBUG][LIVE] accumulatedText:", accumulatedText.slice(0, 500));
      console.log("[DEBUG][LIVE] inputTranscript:", inputTranscript.slice(0, 500));
      console.log("[DEBUG][LIVE] outputTranscript:", outputTranscript.slice(0, 500));

      const textSource = outputTranscript || accumulatedText;
      console.log("[DEBUG][LIVE] textSource for JSON parse:", textSource.slice(0, 500));

      const parsed = extractJson(textSource);
      const transcript = inputTranscript || "";

      console.log("[DEBUG][LIVE] parsed result:", parsed ? JSON.stringify(parsed).slice(0, 300) : "null");

      accumulatedText = "";
      inputTranscript = "";
      outputTranscript = "";

      if (parsed && Array.isArray(parsed.workout)) {
        try {
          sendMessage(worker, { type: "status", value: "processing" });
          if (!sessionId) {
            console.error("[DEBUG][LIVE] no sessionId at turnComplete");
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
          console.error("[live] log error", error);
          sendMessage(worker, { type: "status", value: "error" });
        }
      } else {
        console.log("[live] no workout parsed from textSource:", textSource.slice(0, 500) || "(empty)");
        sendMessage(worker, {
          type: "result",
          workout: [],
          group_ids: [],
          set_ids: [],
          transcript,
        });
      }
    }
  });

  worker.addEventListener("message", async (event) => {
    if (typeof event.data === "string") {
      const msg = JSON.parse(event.data) as ClientToWorkerMessage | {
        type: "stop";
      };

      if (msg.type === "session") {
        sessionId = msg.session_id;
        console.log("[DEBUG][LIVE] client session:", sessionId);
        const raw = await env.KILO_KV.get(`session:${sessionId}`);
        if (!raw) {
          const fallbackSession = {
            id: sessionId,
            user_id: "usr_local",
            workout_date: new Date().toISOString().split("T")[0],
            group_ids: [],
            set_ids: [],
            finished: false,
          };
          await env.KILO_KV.put(
            `session:${sessionId}`,
            JSON.stringify(fallbackSession)
          );
        }
      }

      if (msg.type === "context") {
        exerciseContext = msg.exercises || [];
        contextReceived = true;
        console.log(
          "[DEBUG][LIVE] client context exercises:",
          exerciseContext.length
        );
        if (!setupSent && gemini.readyState === WebSocket.OPEN) {
          sendSetup();
        }
      }

      if (msg.type === "audio" && typeof (msg as any).data === "string") {
        const audioBuf = base64ToArrayBuffer((msg as any).data);
        if (!sessionId) {
          bufferAudio(audioBuf);
        } else {
          sendAudio(audioBuf);
        }
      }

      if (msg.type === "stop") {
        console.log("[DEBUG][LIVE] client stop");
        sendMessage(worker, { type: "status", value: "processing" });
        if (activityStarted) {
          gemini.send(JSON.stringify(createActivityEndMessage()));
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
      audioBuffer = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength
      ).slice().buffer;
    } else if (event.data instanceof Blob) {
      audioBuffer = await event.data.arrayBuffer();
    }

    if (!audioBuffer) return;

    if (!sessionId) {
      bufferAudio(audioBuffer);
    } else {
      sendAudio(audioBuffer);
    }
  });

  worker.addEventListener("close", () => {
    try {
      gemini.close();
    } catch {}
  });

  sendMessage(worker, { type: "status", value: "connected" });
  return new Response(null, { status: 101, webSocket: client });
}
