import { postJson, patchJson } from "./api.js";
import { loadExercises, bestExerciseMatch } from "./exercises.js";
import { addRow, setText } from "./ui.js";
import { setupRecorder } from "./audio.js";
import { openLiveSocket } from "./ws.js";

const startBtn = document.getElementById("startBtn");
const sessionStatus = document.getElementById("sessionStatus");
const setForm = document.getElementById("setForm");
const setsBody = document.getElementById("setsBody");
const voiceBtn = document.getElementById("voicebtn");
const voiceStatus = document.getElementById("voiceStatus");
const transcriptEl = document.getElementById("transcript");

let sessionId = null;
let exerciseContextList = [];
let liveSocket = null;
let liveSocketReady = false;
let pendingChunks = [];

loadExercises().then((list) => {
  exerciseContextList = Array.isArray(list) ? list.slice(0, 30) : [];
});

startBtn.addEventListener("click", async () => {
  try {
    const data = await postJson("/sessions", {
      user_id: "me",
      workout_date: new Date().toISOString().slice(0, 10),
    });
    sessionId = data.session_id;
    setText(sessionStatus, `Session: ${sessionId}`);
  } catch (err) {
    setText(sessionStatus, `Error: ${err.message}`);
  }
});

setForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sessionId) {
    alert("Start a workout first");
    return;
  }

  const exercise = document.getElementById("exercise").value.trim();
  const weight = Number(document.getElementById("weight").value);
  const unit = document.getElementById("unit").value;
  const reps = Number(document.getElementById("reps").value);

  try {
    const created = await postJson(`/sessions/${sessionId}/sets`, {
      exercise_name: exercise,
      weight_value: weight,
      weight_unit: unit,
      reps,
    });

    addRow(setsBody, {
      id: created.set_id,
      exercise_name: exercise,
      weight_value: weight,
      weight_unit: unit,
      reps,
    });

    setForm.reset();
  } catch (err) {
    alert(err.message);
  }
});

setupRecorder({
  voiceBtn,
  voiceStatus,
  onStart: () => {
    if (!sessionId) {
      setText(voiceStatus, "Start a workout first.");
      return;
    }

    liveSocket = openLiveSocket();
    liveSocket.binaryType = "arraybuffer";
    liveSocketReady = false;
    pendingChunks = [];

    liveSocket.addEventListener("open", () => {
      liveSocketReady = true;
      liveSocket.send(JSON.stringify({ type: "session", session_id: sessionId }));
      liveSocket.send(
        JSON.stringify({ type: "context", exercises: exerciseContextList })
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
        // ignore non-json frames
      }
    });
  },
  onPcmChunk: (buffer) => {
    if (!liveSocket) return;
    if (liveSocketReady) {
      liveSocket.send(buffer);
    } else {
      pendingChunks.push(buffer);
    }
  },
  onStop: () => {
    if (liveSocket) {
      try {
        liveSocket.send(JSON.stringify({ type: "stop" }));
      } catch {}
    }
    liveSocket = null;
    liveSocketReady = false;
  },
});

setsBody.addEventListener("click", async (e) => {
  const row = e.target.closest("tr");
  if (!row) return;
  const setId = row.dataset.setId;
  if (!setId) return;

  const weight = prompt("New weight (leave blank to keep):");
  const reps = prompt("New reps (leave blank to keep):");
  const updates = {};
  if (weight && !Number.isNaN(Number(weight))) updates.weight_value = Number(weight);
  if (reps && !Number.isNaN(Number(reps))) updates.reps = Number(reps);
  if (Object.keys(updates).length === 0) return;

  await patchJson(`/sets/${setId}`, updates);

  const cells = row.querySelectorAll("td");
  if (updates.weight_value !== undefined) {
    const unit = cells[1].textContent.split(" ").pop();
    cells[1].textContent = `${updates.weight_value} ${unit}`;
  }
  if (updates.reps !== undefined) {
    cells[2].textContent = updates.reps;
  }
});
