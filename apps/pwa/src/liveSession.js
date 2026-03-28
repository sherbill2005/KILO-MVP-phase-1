import { bestExerciseMatch } from "./exercises.js";
import { addRow, setText } from "./ui.js";
import { openLiveSocket } from "./ws.js";

export function createLiveSessionController({
  voiceStatus,
  setsBody,
  transcriptEl,
  getSessionId,
  getExerciseContext,
}) {
  let liveSocket = null;
  let liveSocketReady = false;
  let pendingChunks = [];

  function resetSocketState() {
    liveSocket = null;
    liveSocketReady = false;
    pendingChunks = [];
  }

  function onStart() {
    const sessionId = getSessionId();
    if (!sessionId) {
      setText(voiceStatus, "Start a workout first.");
      return;
    }

    liveSocket = openLiveSocket();
    liveSocket.binaryType = "arraybuffer";
    liveSocketReady = false;
    pendingChunks = [];

    liveSocket.addEventListener("open", () => {
      const exerciseContext = getExerciseContext();
      liveSocketReady = true;
      liveSocket.send(JSON.stringify({ type: "session", session_id: sessionId }));
      liveSocket.send(
        JSON.stringify({ type: "context", exercises: exerciseContext })
      );
      for (const chunk of pendingChunks) {
        liveSocket.send(chunk);
      }
      pendingChunks = [];
    });

    liveSocket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "status") {
          if (msg.value === "processing") setText(voiceStatus, "Processing...");
          if (msg.value === "error") {
            setText(voiceStatus, "AI error.");
            if (liveSocket) liveSocket.close();
          }
        }

        if (msg.type === "result" && Array.isArray(msg.workout)) {
          if (transcriptEl && msg.transcript) {
            transcriptEl.textContent = `Transcript: ${msg.transcript}`;
          }

          for (const ex of msg.workout) {
            const exercise = bestExerciseMatch(ex.exercise);
            if (!exercise) continue;
            for (const s of ex.sets || []) {
              addRow(setsBody, {
                id: null,
                exercise_name: exercise,
                weight_value: s.weight,
                weight_unit: s.unit,
                reps: s.reps,
              });
            }
          }

          setText(voiceStatus, "Logged.");
          if (liveSocket) liveSocket.close();
        }
      } catch {
        // Ignore non-JSON websocket messages.
      }
    });

    liveSocket.addEventListener("close", () => {
      resetSocketState();
    });
  }

  function onPcmChunk(buffer) {
    if (!liveSocket) return;
    if (liveSocketReady) {
      liveSocket.send(buffer);
    } else {
      pendingChunks.push(buffer);
    }
  }

  function onStop() {
    if (liveSocket) {
      try {
        liveSocket.send(JSON.stringify({ type: "stop" }));
      } catch {}
    }
    resetSocketState();
  }

  return { onStart, onPcmChunk, onStop };
}
