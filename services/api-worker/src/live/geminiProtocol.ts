const AUDIO_MIME = "audio/pcm;rate=16000";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseGeminiEventData(data: unknown) {
  if (typeof data === "string") {
    return JSON.parse(data);
  }

  if (data instanceof ArrayBuffer) {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(data));
    if (!text.trim().startsWith("{")) return null;
    return JSON.parse(text);
  }

  return null;
}

export function getGeminiDebugPayload(msg: any) {
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

export function createSetupMessage(model: string, exerciseContext: string[]) {
  const instruction = `You are a specialized parser. Your only world exists within this list of exercises:\n${exerciseContext.join(",")}\n\nRules:\n- Ignore irrelevant words.\n- Prefer exact matches from the list.\n- SPEAK ONLY JSON. No extra words.\n- Output schema: {"workout":[{"exercise":"...","sets":[{"weight":0,"unit":"kg|lb","reps":0}]}]}\n- If sets are missing weights or reps, repeat the last known value.\n- If no clear workout is present, SPEAK {"error":"no_match"} only.`;

  return {
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
  };
}

export function createActivityStartMessage() {
  return { realtime_input: { activity_start: {} } };
}

export function createActivityEndMessage() {
  return { realtime_input: { activity_end: {} } };
}

export function createAudioMessage(chunk: ArrayBuffer) {
  return {
    realtime_input: {
      audio: {
        mime_type: AUDIO_MIME,
        data: arrayBufferToBase64(chunk),
      },
    },
  };
}
