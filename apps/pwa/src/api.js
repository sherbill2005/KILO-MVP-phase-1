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

export async function postAudioParse(audioBlob, contextList = []) {
  const contextHeader = contextList.join(",");
  const res = await fetch(`${API_BASE}/ai/parse`, {
    method: "POST",
    headers: {
      "content-type": audioBlob.type || "audio/webm",
      "x-exercise-context": contextHeader,
    },
    body: audioBlob,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  return res.json();
}
