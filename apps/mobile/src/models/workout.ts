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
