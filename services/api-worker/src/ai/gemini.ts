type GeminiResult = {
  transcript: string;
  exercise: string | null;
  weight: number | null;
  unit: "kg" | "lb" | null;
  reps: number | null;
};

export type ParseAudioWithGeminiArgs = {
  apiKey: string;
  model: string;
  audioBuffer: ArrayBuffer;
  mimeType: string;
  exerciseContext?: string;
};

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

export async function parseAudioWithGemini({
  apiKey,
  model,
  audioBuffer,
  mimeType,
  exerciseContext,
}: ParseAudioWithGeminiArgs): Promise<GeminiResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const data = arrayBufferToBase64(audioBuffer);

  const systemInstruction = `You are a specialized parser. Your only world exists within this list of exercises:
${exerciseContext || "none"}

Rules:
- Ignore irrelevant words.
- Prefer exact matches from the list.
- Only return JSON.
- If missing exercise/weight/reps, return nulls.`;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        transcript: { type: "string" },
        exercise: { type: "string", nullable: true },
        weight: { type: "number", nullable: true },
        unit: { type: "string", enum: ["kg", "lb"], nullable: true },
        reps: { type: "number", nullable: true },
      },
      required: ["transcript", "exercise", "weight", "unit", "reps"],
    },
  };

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data,
            },
          },
        ],
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error: ${errText}`);
  }

  const json: any = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ??
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n");

  const parsed = text ? extractJson(text) : null;
  if (!parsed) {
    return {
      transcript: text || "",
      exercise: null,
      weight: null,
      unit: null,
      reps: null,
    };
  }

  return {
    transcript: parsed.transcript ?? text ?? "",
    exercise: parsed.exercise ?? null,
    weight: typeof parsed.weight === "number" ? parsed.weight : null,
    unit: parsed.unit === "kg" || parsed.unit === "lb" ? parsed.unit : null,
    reps: typeof parsed.reps === "number" ? parsed.reps : null,
  };
}

