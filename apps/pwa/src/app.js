import { postJson, patchJson } from "./api.js";
import { loadExercises } from "./exercises.js";
import { addRow, setText } from "./ui.js";
import { setupRecorder } from "./audio.js";
import { openLiveSocket } from "./ws.js";

const startBtn = document.getElementById("startBtn");
const sessionStatus = document.getElementById("sessionStatus");
const setForm = document.getElementById("setForm");
const setsBody = document.getElementById("setsBody");
const voiceBtn = document.getElementById("voicebtn");
const voiceStatus = document.getElementById("voiceStatus");

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

    if (liveSocket) {
      try {
        liveSocket.close();
      } catch {}
    }

    liveSocket = openLiveSocket();
    liveSocket.binaryType = "arraybuffer";
    liveSocketReady = false;
    pendingChunks = [];

    liveSocket.addEventListener("open", () => {
      if (!liveSocket) return;
      liveSocket.send(
        JSON.stringify({
          type: "session",
          session_id: sessionId,
        })
      );
    });

    liveSocket.addEventListener("error", (err) => {
      console.error("WebSocket error:", err);
    });

    liveSocket.addEventListener("close", () => {
      liveSocket = null;
      liveSocketReady = false;
      pendingChunks = [];
    });

    liveSocket.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "ack") {
        if (!liveSocket) return;
        liveSocket.send(
          JSON.stringify({
            type: "context",
            exercises: exerciseContextList,
          })
        );
      }

      if (msg.type === "ack_context") {
        console.log("Exercise context acknowledged by server.");
        liveSocketReady = true;
        for (const chunk of pendingChunks) {
          if (!liveSocket) return;
          liveSocket.send(chunk);
        }
        pendingChunks = [];
      }

      if (msg.type === "status") {
        if (msg.value === "processing") {
          setText(voiceStatus, "Processing...");
        }
        if (msg.value === "no_match") {
          setText(voiceStatus, "Could not parse workout. Try again.");
          liveSocket = null;
          liveSocketReady = false;
          pendingChunks = [];
        }
        if (msg.value === "error") {
          setText(voiceStatus, "AI error.");
          liveSocket = null;
          liveSocketReady = false;
          pendingChunks = [];
        }
      }

      if (msg.type === "result") {
        for (const ex of msg.workout || []) {
          for (const set of ex.sets || []) {
            addRow(setsBody, {
              id: null,
              exercise_name: ex.exercise,
              weight_value: set.weight,
              weight_unit: set.unit,
              reps: set.reps,
            });
          }
        }

        setText(voiceStatus, "Logged.");
        liveSocket = null;
        liveSocketReady = false;
        pendingChunks = [];
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
    if (!liveSocket) return;
    try {
      liveSocket.send(JSON.stringify({ type: "stop" }));
    } catch {}
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
