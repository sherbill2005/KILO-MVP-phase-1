import { describe, it, expect } from "vitest";
import { validateBatchPayload } from "../src/validation";

describe("validateBatchPayload", () => {
  it("rejects missing exercise_name", () => {
    const result = validateBatchPayload({
      sets: [{ weight_value: 100, weight_unit: "kg", reps: 10 }],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("exercise_name is required");
  });

  it("rejects empty sets array", () => {
    const result = validateBatchPayload({
      exercise_name: "Squat",
      sets: [],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("sets is required");
  });

  it("rejects invalid weight or reps", () => {
    const invalidWeight = validateBatchPayload({
      exercise_name: "Bench Press",
      sets: [{ weight_value: -5, weight_unit: "kg", reps: 10 }],
    });
    expect(invalidWeight.ok).toBe(false);

    const invalidUnit = validateBatchPayload({
      exercise_name: "Bench Press",
      sets: [{ weight_value: 100, weight_unit: "stone" as any, reps: 10 }],
    });
    expect(invalidUnit.ok).toBe(false);

    const invalidReps = validateBatchPayload({
      exercise_name: "Bench Press",
      sets: [{ weight_value: 100, weight_unit: "kg", reps: 0 }],
    });
    expect(invalidReps.ok).toBe(false);
  });

  it("accepts valid batch payload", () => {
    const result = validateBatchPayload({
      exercise_name: "Squat",
      sets: [
        { weight_value: 100, weight_unit: "kg", reps: 10 },
        { weight_value: 100, weight_unit: "kg", reps: 8 },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
