import { bestExerciseMatch } from "./exercises.js";

export function parseWorkoutText(text) {
  const lower = text.toLowerCase().trim();
  const repsMatch = lower.match(/\b(?:for|x)\s*(\d+)\b/);
  const reps = repsMatch ? Number(repsMatch[1]) : null;

  const weightMatch = lower.match(/\b(\d{2,4})\b/);
  const weight = weightMatch ? Number(weightMatch[1]) : null;

  const unit = lower.includes("kg") ? "kg" : "lb";

  const exercise = lower
    .replace(/\b(?:for|x)\s*\d+\b/g, "")
    .replace(/\b\d{2,4}\b/g, "")
    .replace(/\bkg\b|\blb\b/g, "")
    .trim();

  // Remove common filler words to reduce STT noise
  const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "is",
    "was",
    "on",
    "at",
    "to",
    "of",
    "for",
    "and",
    "with",
    "set",
    "log",
    "logged",
    "reps",
    "rep",
    "pounds",
    "pound",
    "kgs",
    "kg",
    "lbs",
    "lb",
    "price",
    "press",
    "express",
  ]);

  const filteredExercise = exercise
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(" ")
    .trim();

  if (!filteredExercise || !weight || !reps) return null;

  const matchedExercise = bestExerciseMatch(filteredExercise);
  return { exercise: matchedExercise, weight, unit, reps };
}
