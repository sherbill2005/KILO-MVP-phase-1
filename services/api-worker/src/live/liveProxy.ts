import type { Env } from "../env";
import type { ClientToWorkerMessage, WorkerToClientMessage } from "./types";
import {
  createActivityEndMessage,
  createActivityStartMessage,
  createAudioMessage,
  createSetupMessage,
  extractJson,
  getGeminiDebugPayload,
  parseGeminiEventData,
} from "./geminiProtocol";
import { logWorkout } from "./persistWorkout";

const BUFFER_LIMIT_BYTES = 64000;

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

  const geminiResp = await fetch(url, {
    headers: { Upgrade: "websocket" },
  });
  const geminiSocket = geminiResp.webSocket;
  if (!geminiSocket) {
    sendMessage(worker, { type: "status", value: "error" });
    return new Response(null, { status: 101, webSocket: client });
  }

  const gemini = geminiSocket;
  gemini.accept();
  gemini.addEventListener("error", (event) => {
    console.error("[live] gemini WS error", event);
  });
  gemini.addEventListener("close", (event) => {
    if (event.code !== 1000) {
      console.error("[live] gemini WS close", event.code, event.reason);
    }
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
    console.log("[DEBUG][LIVE] sending Gemini setup");
    gemini.send(
      JSON.stringify(createSetupMessage(model, exerciseContext))
    );
    setupComplete = true;
    flushBufferedAudio();
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

    if (!msg) return;

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

    if (msg.setupComplete || msg.setup_complete) {
      setupComplete = true;
      sendMessage(worker, { type: "status", value: "listening" });
      return;
    }

    const serverContent = msg.serverContent || msg.server_content;
    if (!serverContent) return;

    const parts =
      serverContent.modelTurn?.parts || serverContent.model_turn?.parts || [];
    for (const part of parts) {
      if (part.text) accumulatedText += part.text;
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
          sendMessage(worker, { type: "status", value: "processing" });
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
          console.error("[live] log error", error);
          sendMessage(worker, { type: "status", value: "error" });
        }
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
          sendMessage(worker, { type: "status", value: "error" });
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

  sendMessage(worker, { type: "status", value: "listening" });
  return new Response(null, { status: 101, webSocket: client });
}
