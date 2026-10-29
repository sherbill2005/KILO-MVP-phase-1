export type WeightUnit = 'kg' | 'lb';
export type WorkoutMode = 'LIVE' | 'BATCH';

export interface WorkoutSet {
  id: string;
  groupId: string;
  sessionId: string;
  setIndex: number;
  exerciseName: string;
  weightValue: number;
  weightUnit: WeightUnit;
  reps: number;
  isWarmup?: boolean;
  isCorrected?: boolean;
  createdAt: number;
}

export function calculateEstimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  // Brzycki formula for <= 10 reps, Epley formula for > 10 reps
  if (reps <= 10) {
    return Math.round((weight / (1.0278 - (0.0278 * reps))) * 10) / 10;
  }
  return Math.round((weight * (1.0 + (reps / 30.0))) * 10) / 10;
}

export function calculateEpley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round((weight * (1 + reps / 30)) * 10) / 10;
}

export function calculateBrzycki1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  if (reps >= 37) return Math.round(weight * 1.5 * 10) / 10;
  return Math.round((weight * (36 / (37 - reps))) * 10) / 10;
}

export interface WorkoutGroup {
  id: string;
  sessionId: string;
  exerciseName: string;
  targetSets?: number;
  sets: WorkoutSet[];
  createdAt: number;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  workoutDate: string; // YYYY-MM-DD
  startedAt: number;
  finishedAt?: number;
  mode: WorkoutMode;
  groups: WorkoutGroup[];
  isSynced: boolean;
}

export interface SyncQueueItem {
  id: number;
  entityType: 'SESSION' | 'GROUP' | 'SET';
  entityId: string;
  action: 'UPSERT' | 'DELETE';
  payloadJson: string;
  createdAt: number;
}

/**
 * Pure helper functions for targeted set updates/deletions inside a WorkoutGroup array.
 */
export function applyUpdateSetById(
  groups: WorkoutGroup[],
  setId: string,
  newWeight: number,
  newReps: number
): WorkoutGroup[] {
  return groups.map(group => ({
    ...group,
    sets: group.sets.map(s =>
      s.id === setId
        ? { ...s, weightValue: newWeight, reps: newReps, isCorrected: true }
        : s
    ),
  }));
}

export function applyDeleteSetById(groups: WorkoutGroup[], setId: string): WorkoutGroup[] {
  return groups
    .map(group => {
      const filtered = group.sets.filter(s => s.id !== setId);
      return {
        ...group,
        sets: filtered.map((s, idx) => ({ ...s, setIndex: idx + 1 })),
      };
    })
    .filter(group => group.sets.length > 0);
}
