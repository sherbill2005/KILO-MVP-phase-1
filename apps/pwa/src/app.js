import { postJson, patchJson, postAudioParse } from "./api.js";
import { loadExercises, bestExerciseMatch } from "./exercises.js";
import { parseWorkoutText } from "./parser.js";
import { addRow, setText } from "./ui.js";
import { setupRecorder } from "./audio.js";

const startBtn = document.getElementById("startBtn");
const sessionStatus = document.getElementById("sessionStatus");
const setForm = document.getElementById("setForm");
const setsBody = document.getElementById("setsBody");
const voiceBtn = document.getElementById("voicebtn");
const voiceStatus = document.getElementById("voiceStatus");
const transcriptEl = document.getElementById("transcript");

let sessionId = null;
let exerciseContextList = [];

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
  onAudioBlob: async (audioBlob) => {
    if (!sessionId) {
      setText(voiceStatus, "Start a workout first.");
      return;
    }

    const data = await postAudioParse(audioBlob, exerciseContextList);

    if (transcriptEl) {
      transcriptEl.textContent = `Transcript: ${data.transcript || "(none)"}`;
    }

    let exercise = data.exercise || null;
    if (exercise) {
      exercise = bestExerciseMatch(exercise);
    } else if (data.transcript) {
      const parsed = parseWorkoutText(data.transcript);
      exercise = parsed?.exercise || null;
      data.weight = data.weight ?? parsed?.weight ?? null;
      data.unit = data.unit ?? parsed?.unit ?? null;
      data.reps = data.reps ?? parsed?.reps ?? null;
    }

    if (!exercise || !data.weight || !data.reps) {
      setText(voiceStatus, "Could not parse. Try again.");
      return;
    }

    document.getElementById("exercise").value = exercise;
    document.getElementById("weight").value = data.weight;
    document.getElementById("unit").value = data.unit || "lb";
    document.getElementById("reps").value = data.reps;

    const created = await postJson(`/sessions/${sessionId}/sets`, {
      exercise_name: exercise,
      weight_value: data.weight,
      weight_unit: data.unit || "lb",
      reps: data.reps,
    });
    addRow(setsBody, {
      id: created.set_id,
      exercise_name: exercise,
      weight_value: data.weight,
      weight_unit: data.unit || "lb",
      reps: data.reps,
    });
    setForm.reset();
    setText(voiceStatus, "Set logged.");
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

