const API_BASE = "http://127.0.0.1:8787/api";
export { API_BASE };

export async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  return res.json();
}

export async function postSetsBatch(sessionId, exercise, sets) {
  return postJson(`/sessions/${sessionId}/sets`, { exercise_name: exercise, sets });
}

export async function patchJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  return res.json();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      resolve(comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function postAudioParse(audioBlob, contextList = [], sessionId = "pwa_session") {
  const audioBase64 = await blobToBase64(audioBlob);
  return postJson("/ai/parse-audio", {
    audio_base64: audioBase64,
    mime_type: audioBlob.type || "audio/webm",
    exercises: contextList,
    session_id: sessionId,
  });
}
