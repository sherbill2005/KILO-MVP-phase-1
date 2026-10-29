import { describe, it, expect } from "vitest";
import { ContextualWorkoutParser } from "../contextualParser";
import { FuzzyExerciseMatcher } from "../fuzzyMatcher";
import {
  applyUpdateSetById,
  applyDeleteSetById,
  WorkoutGroup,
} from "../../../models/workout";
import { getWorkerHeaders, WORKER_HOST } from "../../../config/api";

describe("FuzzyExerciseMatcher", () => {
  const matcher = new FuzzyExerciseMatcher();

  it("matches exact exercise names", () => {
    expect(matcher.match("bench press")).toBe("Bench Press");
    expect(matcher.match("barbell squat")).toBe("Squat");
    expect(matcher.match("squat")).toBe("Squat");
  });

  it("matches common gym slang / abbreviations", () => {
    expect(matcher.match("flat bench")).toBe("Bench Press");
    expect(matcher.match("rdl")).toBe("Romanian Deadlift");
    expect(matcher.match("lat pulldowns")).toBe("Lat Pulldown");
    expect(matcher.match("military press")).toBe("Overhead Press");
    expect(matcher.match("skullcrushers")).toBe("Skull Crusher");
  });

  it("handles minor speech recognition typos with Levenshtein distance", () => {
    expect(matcher.match("bnech pres")).toBe("Bench Press");
    expect(matcher.match("squatt")).toBe("Squat");
  });

  it("returns null for non-exercise speech", () => {
    expect(matcher.match("drinking coffee")).toBeNull();
    expect(matcher.match("what is the time")).toBeNull();
  });

  it("registers and matches custom exercises via addCustomExercise and loadCustomExercises", () => {
    const customMatcher = new FuzzyExerciseMatcher();
    expect(customMatcher.match("zottman twist")).toBeNull();

    customMatcher.addCustomExercise("Zottman Twist");
    expect(customMatcher.match("zottman twist")).toBe("Zottman Twist");
    expect(customMatcher.match("zottman twst")).toBe("Zottman Twist");

    customMatcher.loadCustomExercises(["Viking Press", "Nordic Glute Ham"]);
    expect(customMatcher.match("viking press")).toBe("Viking Press");
    expect(customMatcher.match("nordic glute ham")).toBe("Nordic Glute Ham");
  });
});

describe("ContextualWorkoutParser", () => {
  const parser = new ContextualWorkoutParser();

  it("parses full explicit set: 'Bench press 80 kg for 10 reps'", () => {
    const result = parser.parse("Bench press 80 kg for 10 reps", {});
    expect(result).toEqual({
      type: "LOG_SET",
      exercise: "Bench Press",
      weight: 80,
      unit: "kg",
      reps: 10,
    });
  });

  it("parses quick format: 'Squat 100 5'", () => {
    const result = parser.parse("Squat 100 5", {});
    expect(result).toEqual({
      type: "LOG_SET",
      exercise: "Squat",
      weight: 100,
      unit: "kg",
      reps: 5,
    });
  });

  it("handles pounds (lbs)", () => {
    const result = parser.parse("Deadlift 225 lbs for 5", {});
    expect(result).toEqual({
      type: "LOG_SET",
      exercise: "Deadlift",
      weight: 225,
      unit: "lb",
      reps: 5,
    });
  });

  it("parses contextual repeat: 'Same weight, same reps'", () => {
    const context = {
      exerciseName: "Incline Bench Press",
      lastWeight: 32,
      lastUnit: "kg" as const,
      lastReps: 8,
    };
    const result = parser.parse("Same weight same reps", context);
    expect(result).toEqual({
      type: "LOG_SET",
      exercise: "Incline Bench Press",
      weight: 32,
      unit: "kg",
      reps: 8,
    });
  });

  it("parses contextual set without naming exercise: '90 for 8'", () => {
    const context = {
      exerciseName: "Bench Press",
      lastWeight: 85,
      lastUnit: "kg" as const,
      lastReps: 10,
    };
    const result = parser.parse("90 for 8", context);
    expect(result).toEqual({
      type: "LOG_SET",
      exercise: "Bench Press",
      weight: 90,
      unit: "kg",
      reps: 8,
    });
  });

  it("parses Voice CRUD: Delete / Undo", () => {
    expect(parser.parse("delete last set", {})).toEqual({ type: "DELETE_LAST_SET" });
    expect(parser.parse("undo", {})).toEqual({ type: "DELETE_LAST_SET" });
    expect(parser.parse("cancel set", {})).toEqual({ type: "DELETE_LAST_SET" });
  });

  it("parses Voice CRUD: Corrections (Weight / Reps)", () => {
    expect(parser.parse("change weight to 85", {})).toEqual({
      type: "UPDATE_LAST_WEIGHT",
      newWeight: 85,
    });
    expect(parser.parse("update reps to 12", {})).toEqual({
      type: "UPDATE_LAST_REPS",
      newReps: 12,
    });
  });

  it("parses Voice CRUD: Finish Workout", () => {
    expect(parser.parse("finish workout", {})).toEqual({ type: "FINISH_WORKOUT" });
    expect(parser.parse("end session", {})).toEqual({ type: "FINISH_WORKOUT" });
  });

  it("parses batch speech correctly", () => {
    const batch = parser.parseBatch("Bench press 3 sets of 10 at 80 kg, then Squat 100 kg for 5 reps");
    expect(batch.length).toBe(2);
    expect(batch[0].exercise).toBe("Bench Press");
    expect(batch[0].sets.length).toBe(3);
    expect(batch[0].sets[0]).toEqual({ weight: 80, reps: 10, unit: "kg" });
    expect(batch[1].exercise).toBe("Squat");
    expect(batch[1].sets.length).toBe(1);
    expect(batch[1].sets[0]).toEqual({ weight: 100, reps: 5, unit: "kg" });
  });
});

describe("Targeted Set CRUD (applyUpdateSetById & applyDeleteSetById)", () => {
  const sampleGroups: WorkoutGroup[] = [
    {
      id: "grp_1",
      sessionId: "sess_1",
      exerciseName: "Bench Press",
      createdAt: 1000,
      sets: [
        {
          id: "set_1",
          groupId: "grp_1",
          sessionId: "sess_1",
          setIndex: 1,
          exerciseName: "Bench Press",
          weightValue: 80,
          weightUnit: "kg",
          reps: 10,
          createdAt: 1001,
        },
        {
          id: "set_2",
          groupId: "grp_1",
          sessionId: "sess_1",
          setIndex: 2,
          exerciseName: "Bench Press",
          weightValue: 85,
          weightUnit: "kg",
          reps: 8,
          createdAt: 1002,
        },
      ],
    },
    {
      id: "grp_2",
      sessionId: "sess_1",
      exerciseName: "Squat",
      createdAt: 2000,
      sets: [
        {
          id: "set_3",
          groupId: "grp_2",
          sessionId: "sess_1",
          setIndex: 1,
          exerciseName: "Squat",
          weightValue: 120,
          weightUnit: "kg",
          reps: 5,
          createdAt: 2001,
        },
      ],
    },
  ];

  it("updates only the targeted setId without mutating the last set", () => {
    const updated = applyUpdateSetById(sampleGroups, "set_1", 82.5, 12);
    expect(updated[0].sets[0].weightValue).toBe(82.5);
    expect(updated[0].sets[0].reps).toBe(12);
    expect(updated[0].sets[0].isCorrected).toBe(true);
    // Ensure set_2 and set_3 are untouched
    expect(updated[0].sets[1].weightValue).toBe(85);
    expect(updated[0].sets[1].reps).toBe(8);
    expect(updated[1].sets[0].weightValue).toBe(120);
  });

  it("deletes only the targeted setId, re-indexes remaining sets, and removes empty groups", () => {
    const afterFirstDelete = applyDeleteSetById(sampleGroups, "set_1");
    expect(afterFirstDelete.length).toBe(2);
    expect(afterFirstDelete[0].sets.length).toBe(1);
    expect(afterFirstDelete[0].sets[0].id).toBe("set_2");
    expect(afterFirstDelete[0].sets[0].setIndex).toBe(1);

    // Deleting the only set in grp_2 removes grp_2 altogether
    const afterSecondDelete = applyDeleteSetById(afterFirstDelete, "set_3");
    expect(afterSecondDelete.length).toBe(1);
    expect(afterSecondDelete[0].id).toBe("grp_1");
  });
});

describe("API Config & Auth Headers (getWorkerHeaders)", () => {
  it("builds headers with extra headers and valid WORKER_HOST", () => {
    expect(WORKER_HOST).toContain("workers.dev");
    const headers = getWorkerHeaders({ "Content-Type": "application/json" });
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
