import { DatabaseService } from './database';
import { WorkoutSession } from '../../models/workout';
import { WORKER_API_BASE } from '../../config/api';

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
          const syncUrl = `${WORKER_API_BASE.replace(/\/api$/, '')}/api/workouts/sync-batch`;
          const syncRes = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session }),
          });

          if (!syncRes.ok) {
            failedCount++;
            continue;
          }

          // Mark as synced in local SQLite
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

  // Fetch remote session list from Cloudflare Worker KV
  fetchRemoteSessions: async (userId?: string): Promise<any[]> => {
    try {
      const url = userId
        ? `${WORKER_API_BASE}/sessions?user_id=${encodeURIComponent(userId)}`
        : `${WORKER_API_BASE}/sessions`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.sessions || [];
    } catch (err) {
      console.warn('[SyncService] Failed to fetch remote sessions:', err);
      return [];
    }
  },

  // Fetch full hydrated session with groups and sets from Cloudflare Worker
  fetchRemoteSessionDetail: async (sessionId: string): Promise<any | null> => {
    try {
      const res = await fetch(`${WORKER_API_BASE}/sessions/${sessionId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[SyncService] Failed to fetch remote session detail:', err);
      return null;
    }
  },
};

