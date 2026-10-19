import { DatabaseService } from './database';
import { WorkoutSession } from '../../models/workout';

const WORKER_API_BASE = 'https://kilo-worker.sherbill2005.workers.dev/api';

export interface SyncStatusResult {
  syncedCount: number;
  failedCount: number;
  isOnline: boolean;
}

export const SyncService = {
  // Sync unsynced workout sessions to Cloudflare Worker KV
  syncPendingWorkouts: async (): Promise<SyncStatusResult> => {
    try {
      const allSessions = await DatabaseService.getAllSessions();
      const unsynced = allSessions.filter(s => !s.isSynced);

      if (unsynced.length === 0) {
        return { syncedCount: 0, failedCount: 0, isOnline: true };
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const session of unsynced) {
        try {
          // 1. Create remote session
          const sessRes = await fetch(`${WORKER_API_BASE}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: session.userId || 'usr_local',
              workout_date: session.workoutDate,
            }),
          });

          if (!sessRes.ok) {
            failedCount++;
            continue;
          }

          const sessData = await sessRes.json();
          const remoteSessionId = sessData.session_id;

          // 2. Upload each group and set
          for (const group of session.groups) {
            if (group.sets.length > 0) {
              await fetch(`${WORKER_API_BASE}/sessions/${remoteSessionId}/sets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  exercise_name: group.exerciseName,
                  sets: group.sets.map(s => ({
                    weight_value: s.weightValue,
                    weight_unit: s.weightUnit,
                    reps: s.reps,
                  })),
                }),
              });
            }
          }

          // 3. Mark as synced in local SQLite
          session.isSynced = true;
          await DatabaseService.saveSession(session);
          syncedCount++;
        } catch (err) {
          console.warn('[SyncService] Failed syncing session:', session.id, err);
          failedCount++;
        }
      }

      if (syncedCount > 0) {
        await DatabaseService.clearSyncQueue();
      }

      return { syncedCount, failedCount, isOnline: true };
    } catch (error) {
      console.warn('[SyncService] Offline, cannot reach Cloudflare Worker:', error);
      return { syncedCount: 0, failedCount: 0, isOnline: false };
    }
  },
};
