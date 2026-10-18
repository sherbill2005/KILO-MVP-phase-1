import { WeightUnit } from '../../models/workout';
import { FuzzyExerciseMatcher, fuzzyExerciseMatcher } from './fuzzyMatcher';

export type VoiceCommandType =
  | { type: 'LOG_SET'; exercise: string; weight: number; unit: WeightUnit; reps: number }
  | { type: 'SET_ACTIVE_EXERCISE'; exercise: string; targetSets?: number }
  | { type: 'UPDATE_LAST_WEIGHT'; newWeight: number }
  | { type: 'UPDATE_LAST_REPS'; newReps: number }
  | { type: 'DELETE_LAST_SET' }
  | { type: 'FINISH_WORKOUT' }
  | { type: 'BATCH_SETS'; exercises: { exercise: string; sets: { weight: number; reps: number; unit: WeightUnit }[] }[] }
  | { type: 'UNKNOWN'; rawTranscript: string };

export interface ActiveContextState {
  exerciseName?: string;
  lastWeight?: number;
  lastUnit?: WeightUnit;
  lastReps?: number;
}

export class ContextualWorkoutParser {
  private matcher: FuzzyExerciseMatcher;

  constructor(matcher = fuzzyExerciseMatcher) {
    this.matcher = matcher;
  }

  public parse(transcript: string, context: ActiveContextState, defaultUnit: WeightUnit = 'kg'): VoiceCommandType {
    const lower = transcript.toLowerCase().trim();
    if (!lower) return { type: 'UNKNOWN', rawTranscript: transcript };

    // 1. Voice CRUD: Delete / Undo
    if (
      lower.includes('delete last') ||
      lower.includes('remove last') ||
      lower.includes('cancel set') ||
      lower.includes('undo') ||
      lower.includes('delete set')
    ) {
      return { type: 'DELETE_LAST_SET' };
    }

    // 2. Voice CRUD: Finish Workout
    if (
      lower.includes('finish workout') ||
      lower.includes('complete workout') ||
      lower.includes('end session') ||
      lower.includes('done workout') ||
      lower.includes('finish session')
    ) {
      return { type: 'FINISH_WORKOUT' };
    }

    // 3. Voice CRUD: Update Weight
    const changeWeightMatch = lower.match(/(?:change|update|make|set)\s+weight\s+(?:to\s+)?(\d+(?:\.\d+)?)/);
    if (changeWeightMatch && changeWeightMatch[1]) {
      const weight = parseFloat(changeWeightMatch[1]);
      if (!isNaN(weight)) {
        return { type: 'UPDATE_LAST_WEIGHT', newWeight: weight };
      }
    }

    // 4. Voice CRUD: Update Reps
    const changeRepsMatch = lower.match(/(?:change|update|make|set)\s+reps\s+(?:to\s+)?(\d+)/);
    if (changeRepsMatch && changeRepsMatch[1]) {
      const reps = parseInt(changeRepsMatch[1], 10);
      if (!isNaN(reps)) {
        return { type: 'UPDATE_LAST_REPS', newReps: reps };
      }
    }

    // 5. Repeat / Relative commands: "Same weight, same reps", "Same as last", "Repeat last"
    if (
      lower.includes('same weight') ||
      lower.includes('same as last') ||
      lower.includes('repeat last') ||
      lower.includes('same thing') ||
      lower.includes('same set') ||
      lower.includes('same reps')
    ) {
      if (context.exerciseName && context.lastWeight !== undefined && context.lastReps !== undefined) {
        return {
          type: 'LOG_SET',
          exercise: context.exerciseName,
          weight: context.lastWeight,
          unit: context.lastUnit || defaultUnit,
          reps: context.lastReps,
        };
      }
    }

    // 6. Determine Unit (kg vs lb)
    const unit: WeightUnit = lower.includes('lb') || lower.includes('pound') ? 'lb' : defaultUnit;

    // 7. Extract Numbers
    let extractedWeight: number | null = null;
    let extractedReps: number | null = null;

    // Pattern A: Explicit Reps marker ("for 10", "x 10", "10 reps", "10 rep")
    const explicitRepsMatch = lower.match(/\b(?:for|x|times)\s*(\d+)\b|\b(\d+)\s*(?:reps|rep)\b/);
    if (explicitRepsMatch) {
      const repVal = explicitRepsMatch[1] || explicitRepsMatch[2];
      if (repVal) extractedReps = parseInt(repVal, 10);
      const textWithoutReps = lower.replace(explicitRepsMatch[0], ' ');
      const weightMatch = textWithoutReps.match(/\b(\d{1,4}(?:\.\d+)?)\s*(?:kg|kilos|kilo|lbs|pounds|lb)?\b/);
      if (weightMatch && weightMatch[1]) {
        extractedWeight = parseFloat(weightMatch[1]);
      }
    }

    // Pattern B: Two consecutive numbers: "[Weight] [Reps]" (e.g. "80 10", "100 5", "82.5 8")
    if (extractedWeight === null || extractedReps === null) {
      const twoNumbersMatch = lower.match(/\b(\d{1,4}(?:\.\d+)?)\s*(?:kg|kilos|kilo|lbs|pounds|lb)?\s+(\d{1,3})\s*(?:reps|rep)?\b/);
      if (twoNumbersMatch && twoNumbersMatch[1] && twoNumbersMatch[2]) {
        extractedWeight = parseFloat(twoNumbersMatch[1]);
        extractedReps = parseInt(twoNumbersMatch[2], 10);
      }
    }

    // 8. Exercise matching
    const matchedExercise = this.matcher.match(lower);

    if (matchedExercise) {
      if (extractedWeight !== null && extractedReps !== null) {
        return {
          type: 'LOG_SET',
          exercise: matchedExercise,
          weight: extractedWeight,
          unit,
          reps: extractedReps,
        };
      }

      // Check if target sets mentioned (e.g. "4 sets")
      const targetSetsMatch = lower.match(/(\d+)\s*sets?/);
      const targetSets = targetSetsMatch && targetSetsMatch[1] ? parseInt(targetSetsMatch[1], 10) : undefined;
      return {
        type: 'SET_ACTIVE_EXERCISE',
        exercise: matchedExercise,
        targetSets,
      };
    }

    // 9. If no exercise mentioned, but numbers exist and we have an active context
    if (context.exerciseName && extractedWeight !== null && extractedReps !== null) {
      return {
        type: 'LOG_SET',
        exercise: context.exerciseName,
        weight: extractedWeight,
        unit,
        reps: extractedReps,
      };
    }

    return { type: 'UNKNOWN', rawTranscript: transcript };
  }

  // Parse batch speech for Mode 2 (e.g. "Bench press 3 sets of 10 at 80 kg, then Squat 100 kg for 5 reps")
  public parseBatch(transcript: string, defaultUnit: WeightUnit = 'kg'): { exercise: string; sets: { weight: number; reps: number; unit: WeightUnit }[] }[] {
    const results: { exercise: string; sets: { weight: number; reps: number; unit: WeightUnit }[] }[] = [];
    const segments = transcript.split(/(?:,\s*then|\s+then|\s+after\s+that|\s+and\s+then|[;\n])/i);

    for (const seg of segments) {
      const lower = seg.trim().toLowerCase();
      if (!lower) continue;

      const exercise = this.matcher.match(lower);
      if (!exercise) continue;

      const unit: WeightUnit = lower.includes('lb') || lower.includes('pound') ? 'lb' : defaultUnit;
      const sets: { weight: number; reps: number; unit: WeightUnit }[] = [];

      // Pattern 1: "3 sets of 10 at 80 kg" or "3 sets 80 kg 10 reps"
      const repeatMatch = lower.match(/(\d+)\s*sets?(?:\s+of)?\s+(\d+)\s*(?:reps)?\s*(?:at|with)?\s*(\d+(?:\.\d+)?)/);
      if (repeatMatch) {
        const numSets = parseInt(repeatMatch[1], 10);
        const reps = parseInt(repeatMatch[2], 10);
        const weight = parseFloat(repeatMatch[3]);
        for (let i = 0; i < numSets; i++) {
          sets.push({ weight, reps, unit });
        }
      } else {
        // Pattern 2: Single set extraction inside segment
        const cmd = this.parse(seg, {}, defaultUnit);
        if (cmd.type === 'LOG_SET') {
          sets.push({ weight: cmd.weight, reps: cmd.reps, unit: cmd.unit });
        }
      }

      if (sets.length > 0) {
        results.push({ exercise, sets });
      }
    }

    return results;
  }
}

export const contextualWorkoutParser = new ContextualWorkoutParser();
