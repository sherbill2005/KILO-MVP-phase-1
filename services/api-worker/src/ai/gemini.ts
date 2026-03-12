type GeminiResult = {
  transcript: string;
  workout: Array<{
    exercise: string;
    sets: Array<{ weight: number; unit: "kg" | "lb"; reps: number }>;
  }>;
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
- Output a workout array with exercises and sets.
- If sets are missing weights or reps, repeat the last known value.`;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        transcript: { type: "string" },
        workout: {
          type: "array",
          items: {
            type: "object",
            properties: {
              exercise: { type: "string" },
              sets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    weight: { type: "number" },
                    unit: { type: "string", enum: ["kg", "lb"] },
                    reps: { type: "number" },
                  },
                  required: ["weight", "unit", "reps"],
                },
              },
            },
            required: ["exercise", "sets"],
          },
        },
      },
      required: ["transcript", "workout"],
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
    return { transcript: text || "", workout: [] };
  }

  const workout = Array.isArray(parsed.workout) ? parsed.workout : [];
  const cleanedWorkout = workout
    .filter((w: any) => w && typeof w.exercise === "string" && Array.isArray(w.sets))
    .map((w: any) => ({
      exercise: w.exercise,
      sets: w.sets
        .filter(
          (s: any) =>
            s &&
            typeof s.weight === "number" &&
            (s.unit === "kg" || s.unit === "lb") &&
            typeof s.reps === "number"
        )
        .map((s: any) => ({ weight: s.weight, unit: s.unit, reps: s.reps })),
    }))
    .filter((w: any) => w.sets.length > 0);

  return {
    transcript: parsed.transcript ?? text ?? "",
    workout: cleanedWorkout,
  };
}
