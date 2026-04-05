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
  if (start === -1) return null;

  let end = text.lastIndexOf("}");
  while (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      end = text.lastIndexOf("}", end - 1);
    }
  }

  return null;
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
