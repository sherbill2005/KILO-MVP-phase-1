import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  WorkoutSession,
  WorkoutGroup,
  WorkoutSet,
  SyncQueueItem,
  WeightUnit,
} from '../../models/workout';

const DB_NAME = 'kilo_offline.db';
const LEGACY_STORAGE_KEYS = {
  SESSIONS: '@kilo_sessions',
  SYNC_QUEUE: '@kilo_sync_queue',
};

// Seed initial sample workout data for a rich first experience
const INITIAL_SAMPLE_SESSIONS: WorkoutSession[] = [
  {
    id: 'sample_sess_1',
    userId: 'usr_local',
    workoutDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    startedAt: Date.now() - 86400000 * 2 - 3600000,
    finishedAt: Date.now() - 86400000 * 2,
    mode: 'LIVE',
    isSynced: true,
    groups: [
      {
        id: 'grp_sample_1',
        sessionId: 'sample_sess_1',
        exerciseName: 'Bench Press',
        targetSets: 4,
        createdAt: Date.now() - 86400000 * 2 - 3000000,
        sets: [
          { id: 'set_s1_1', groupId: 'grp_sample_1', sessionId: 'sample_sess_1', setIndex: 1, exerciseName: 'Bench Press', weightValue: 80, weightUnit: 'kg', reps: 10, createdAt: Date.now() - 86400000 * 2 - 2800000 },
          { id: 'set_s1_2', groupId: 'grp_sample_1', sessionId: 'sample_sess_1', setIndex: 2, exerciseName: 'Bench Press', weightValue: 85, weightUnit: 'kg', reps: 8, createdAt: Date.now() - 86400000 * 2 - 2500000 },
          { id: 'set_s1_3', groupId: 'grp_sample_1', sessionId: 'sample_sess_1', setIndex: 3, exerciseName: 'Bench Press', weightValue: 90, weightUnit: 'kg', reps: 6, createdAt: Date.now() - 86400000 * 2 - 2200000 },
          { id: 'set_s1_4', groupId: 'grp_sample_1', sessionId: 'sample_sess_1', setIndex: 4, exerciseName: 'Bench Press', weightValue: 95, weightUnit: 'kg', reps: 5, createdAt: Date.now() - 86400000 * 2 - 1900000 },
        ],
      },
      {
        id: 'grp_sample_2',
        sessionId: 'sample_sess_1',
        exerciseName: 'Incline Bench Press',
        targetSets: 3,
        createdAt: Date.now() - 86400000 * 2 - 1800000,
        sets: [
          { id: 'set_s1_5', groupId: 'grp_sample_2', sessionId: 'sample_sess_1', setIndex: 1, exerciseName: 'Incline Bench Press', weightValue: 70, weightUnit: 'kg', reps: 10, createdAt: Date.now() - 86400000 * 2 - 1600000 },
          { id: 'set_s1_6', groupId: 'grp_sample_2', sessionId: 'sample_sess_1', setIndex: 2, exerciseName: 'Incline Bench Press', weightValue: 75, weightUnit: 'kg', reps: 8, createdAt: Date.now() - 86400000 * 2 - 1300000 },
          { id: 'set_s1_7', groupId: 'grp_sample_2', sessionId: 'sample_sess_1', setIndex: 3, exerciseName: 'Incline Bench Press', weightValue: 75, weightUnit: 'kg', reps: 8, createdAt: Date.now() - 86400000 * 2 - 1000000 },
        ],
      },
    ],
  },
  {
    id: 'sample_sess_2',
    userId: 'usr_local',
    workoutDate: new Date(Date.now() - 86400000 * 4).toISOString().split('T')[0],
    startedAt: Date.now() - 86400000 * 4 - 3600000,
    finishedAt: Date.now() - 86400000 * 4,
    mode: 'BATCH',
    isSynced: true,
    groups: [
      {
        id: 'grp_sample_3',
        sessionId: 'sample_sess_2',
        exerciseName: 'Squat',
        targetSets: 3,
        createdAt: Date.now() - 86400000 * 4 - 3000000,
        sets: [
          { id: 'set_s2_1', groupId: 'grp_sample_3', sessionId: 'sample_sess_2', setIndex: 1, exerciseName: 'Squat', weightValue: 100, weightUnit: 'kg', reps: 8, createdAt: Date.now() - 86400000 * 4 - 2800000 },
          { id: 'set_s2_2', groupId: 'grp_sample_3', sessionId: 'sample_sess_2', setIndex: 2, exerciseName: 'Squat', weightValue: 110, weightUnit: 'kg', reps: 6, createdAt: Date.now() - 86400000 * 4 - 2500000 },
          { id: 'set_s2_3', groupId: 'grp_sample_3', sessionId: 'sample_sess_2', setIndex: 3, exerciseName: 'Squat', weightValue: 120, weightUnit: 'kg', reps: 4, createdAt: Date.now() - 86400000 * 4 - 2200000 },
        ],
      },
    ],
  },
];

let dbInstance: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') return null;
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
}

export const DatabaseService = {
  // Initialize SQLite database schema
  init: async (): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        const existing = await AsyncStorage.getItem(LEGACY_STORAGE_KEYS.SESSIONS);
        if (!existing) {
          await AsyncStorage.setItem(
            LEGACY_STORAGE_KEYS.SESSIONS,
            JSON.stringify(INITIAL_SAMPLE_SESSIONS)
          );
        }
      } catch {}
      return;
    }

    try {
      const db = await getDb();
      if (!db) return;

      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
      `);

      // Versioned Schema Migration Runner
      const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const currentVersion = versionResult?.user_version || 0;

      if (currentVersion < 1) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL,
            workout_date TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            finished_at INTEGER,
            mode TEXT NOT NULL,
            is_synced INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS workout_groups (
            id TEXT PRIMARY KEY NOT NULL,
            session_id TEXT NOT NULL,
            exercise_name TEXT NOT NULL,
            target_sets INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS workout_sets (
            id TEXT PRIMARY KEY NOT NULL,
            group_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            set_index INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            weight_value REAL NOT NULL,
            weight_unit TEXT NOT NULL,
            reps INTEGER NOT NULL,
            is_corrected INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(group_id) REFERENCES workout_groups(id) ON DELETE CASCADE,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY NOT NULL,
            action TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS active_draft_session (
            id TEXT PRIMARY KEY NOT NULL,
            session_data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id);
          CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_name);
          CREATE INDEX IF NOT EXISTS idx_groups_session ON workout_groups(session_id);
          PRAGMA user_version = 1;
        `);
      }

      if (currentVersion < 2) {
        // Migration 2: Add dynamic custom exercises dictionary
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS custom_exercises (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_custom_ex_name ON custom_exercises(name);
          PRAGMA user_version = 2;
        `);
      }

      // Check if sessions table is empty; if so, populate sample data or migrate from AsyncStorage
      const countResult = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sessions'
      );

      if (!countResult || countResult.count === 0) {
        // Try migrating from AsyncStorage first
        const legacyData = await AsyncStorage.getItem(LEGACY_STORAGE_KEYS.SESSIONS);
        const sessionsToSeed = legacyData ? JSON.parse(legacyData) : INITIAL_SAMPLE_SESSIONS;
        for (const s of sessionsToSeed) {
          await DatabaseService.saveSession(s);
        }
      }
    } catch (error) {
      console.error('[SQLite] init error:', error);
    }
  },

  // Get completed/saved workout sessions with pagination
  getAllSessions: async (limit: number = 50, offset: number = 0): Promise<WorkoutSession[]> => {
    if (Platform.OS === 'web') {
      try {
        const json = await AsyncStorage.getItem(LEGACY_STORAGE_KEYS.SESSIONS);
        if (!json) return [];
        const list: WorkoutSession[] = JSON.parse(json);
        return list.sort((a, b) => b.startedAt - a.startedAt).slice(offset, offset + limit);
      } catch {
        return [];
      }
    }

    try {
      const db = await getDb();
      if (!db) return [];

      const sessionRows = await db.getAllAsync<{
        id: string;
        user_id: string;
        workout_date: string;
        started_at: number;
        finished_at: number | null;
        mode: 'LIVE' | 'BATCH';
        is_synced: number;
      }>('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?', [limit, offset]);

      if (sessionRows.length === 0) return [];
      const sessionIds = sessionRows.map(s => s.id);
      const placeholders = sessionIds.map(() => '?').join(',');

      const groupRows = await db.getAllAsync<{
        id: string;
        session_id: string;
        exercise_name: string;
        target_sets: number | null;
        created_at: number;
      }>(
        `SELECT * FROM workout_groups WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`,
        sessionIds
      );

      const setRows = await db.getAllAsync<{
        id: string;
        group_id: string;
        session_id: string;
        set_index: number;
        exercise_name: string;
        weight_value: number;
        weight_unit: WeightUnit;
        reps: number;
        is_corrected: number;
        created_at: number;
      }>(
        `SELECT * FROM workout_sets WHERE session_id IN (${placeholders}) ORDER BY set_index ASC`,
        sessionIds
      );

      const result: WorkoutSession[] = sessionRows.map(s => {
        const sessionGroups = groupRows
          .filter(g => g.session_id === s.id)
          .map(g => {
            const groupSets: WorkoutSet[] = setRows
              .filter(st => st.group_id === g.id)
              .map(st => ({
                id: st.id,
                groupId: st.group_id,
                sessionId: st.session_id,
                setIndex: st.set_index,
                exerciseName: st.exercise_name,
                weightValue: st.weight_value,
                weightUnit: st.weight_unit,
                reps: st.reps,
                isCorrected: Boolean(st.is_corrected),
                createdAt: st.created_at,
              }));

            const group: WorkoutGroup = {
              id: g.id,
              sessionId: g.session_id,
              exerciseName: g.exercise_name,
              targetSets: g.target_sets || undefined,
              sets: groupSets,
              createdAt: g.created_at,
            };
            return group;
          });

        return {
          id: s.id,
          userId: s.user_id,
          workoutDate: s.workout_date,
          startedAt: s.started_at,
          finishedAt: s.finished_at || undefined,
          mode: s.mode,
          groups: sessionGroups,
          isSynced: Boolean(s.is_synced),
        };
      });

      return result;
    } catch (error) {
      console.error('[SQLite] getAllSessions error:', error);
      return [];
    }
  },

  // Save or update a session with full relational integrity
  saveSession: async (session: WorkoutSession): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        const list = await DatabaseService.getAllSessions();
        const idx = list.findIndex(s => s.id === session.id);
        if (idx >= 0) {
          list[idx] = session;
        } else {
          list.unshift(session);
        }
        await AsyncStorage.setItem(LEGACY_STORAGE_KEYS.SESSIONS, JSON.stringify(list));
      } catch {}
      return;
    }

    try {
      const db = await getDb();
      if (!db) return;

      await db.withTransactionAsync(async () => {
        // Upsert session
        await db.runAsync(
          `INSERT OR REPLACE INTO sessions (id, user_id, workout_date, started_at, finished_at, mode, is_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            session.id,
            session.userId,
            session.workoutDate,
            session.startedAt,
            session.finishedAt || null,
            session.mode,
            session.isSynced ? 1 : 0,
          ]
        );

        // Clear existing groups and sets for this session to handle updates cleanly
        await db.runAsync('DELETE FROM workout_sets WHERE session_id = ?', [session.id]);
        await db.runAsync('DELETE FROM workout_groups WHERE session_id = ?', [session.id]);

        // Insert groups and sets
        for (const grp of session.groups) {
          await db.runAsync(
            `INSERT INTO workout_groups (id, session_id, exercise_name, target_sets, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [grp.id, session.id, grp.exerciseName, grp.targetSets || null, grp.createdAt]
          );

          for (const s of grp.sets) {
            await db.runAsync(
              `INSERT INTO workout_sets (id, group_id, session_id, set_index, exercise_name, weight_value, weight_unit, reps, is_corrected, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                s.id,
                grp.id,
                session.id,
                s.setIndex,
                s.exerciseName,
                s.weightValue,
                s.weightUnit,
                s.reps,
                s.isCorrected ? 1 : 0,
                s.createdAt,
              ]
            );
          }
        }
      });
    } catch (error) {
      console.error('[SQLite] saveSession error:', error);
    }
  },

  // Delete a session
  deleteSession: async (sessionId: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        const list = await DatabaseService.getAllSessions();
        const filtered = list.filter(s => s.id !== sessionId);
        await AsyncStorage.setItem(LEGACY_STORAGE_KEYS.SESSIONS, JSON.stringify(filtered));
      } catch {}
      return;
    }

    try {
      const db = await getDb();
      if (!db) return;
      await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
    } catch (error) {
      console.error('[SQLite] deleteSession error:', error);
    }
  },

  // Sync Queue Operations
  enqueueSyncItem: async (action: string, payload: unknown): Promise<void> => {
    try {
      const db = await getDb();
      if (!db) return;
      const id = 'sync_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      await db.runAsync(
        `INSERT INTO sync_queue (id, action, payload, created_at, retry_count) VALUES (?, ?, ?, ?, ?)`,
        [id, action, JSON.stringify(payload), Date.now(), 0]
      );
    } catch {}
  },

  getPendingSyncCount: async (): Promise<number> => {
    if (Platform.OS === 'web') {
      try {
        const list = await DatabaseService.getAllSessions();
        return list.filter(s => !s.isSynced).length;
      } catch {
        return 0;
      }
    }
    try {
      const db = await getDb();
      if (!db) return 0;
      const res = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sessions WHERE is_synced = 0'
      );
      return res?.count || 0;
    } catch {
      return 0;
    }
  },

  clearSyncQueue: async (): Promise<void> => {
    try {
      const db = await getDb();
      if (!db) return;
      await db.runAsync('DELETE FROM sync_queue');
    } catch {}
  },

  // Native High-Performance SQL Aggregations
  getWorkoutStats: async (): Promise<{ totalSets: number; totalVolume: number; totalWorkouts: number }> => {
    if (Platform.OS === 'web') {
      const all = await DatabaseService.getAllSessions(100, 0);
      let totalSets = 0;
      let totalVolume = 0;
      for (const s of all) {
        for (const g of s.groups) {
          totalSets += g.sets.length;
          for (const st of g.sets) {
            totalVolume += st.weightValue * st.reps;
          }
        }
      }
      return { totalSets, totalVolume: Math.round(totalVolume * 10) / 10, totalWorkouts: all.length };
    }

    try {
      const db = await getDb();
      if (!db) return { totalSets: 0, totalVolume: 0, totalWorkouts: 0 };

      const stats = await db.getFirstAsync<{ total_sets: number; total_volume: number }>(
        'SELECT COUNT(*) as total_sets, COALESCE(SUM(weight_value * reps), 0) as total_volume FROM workout_sets'
      );
      const countRes = await db.getFirstAsync<{ total_workouts: number }>(
        'SELECT COUNT(*) as total_workouts FROM sessions'
      );

      return {
        totalSets: stats?.total_sets || 0,
        totalVolume: Math.round((stats?.total_volume || 0) * 10) / 10,
        totalWorkouts: countRes?.total_workouts || 0,
      };
    } catch (e) {
      console.warn('[SQLite] getWorkoutStats error:', e);
      return { totalSets: 0, totalVolume: 0, totalWorkouts: 0 };
    }
  },

  // Active Draft Session WAL (Write-Ahead Log) for Crash Recovery
  saveDraftSession: async (session: WorkoutSession): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.setItem('@kilo_active_draft', JSON.stringify(session));
      } catch {}
      return;
    }

    try {
      const db = await getDb();
      if (!db) return;
      await db.runAsync(
        'INSERT OR REPLACE INTO active_draft_session (id, session_data, updated_at) VALUES (?, ?, ?)',
        ['current_active_draft', JSON.stringify(session), Date.now()]
      );
    } catch (e) {
      console.warn('[SQLite] saveDraftSession error:', e);
    }
  },

  getDraftSession: async (): Promise<WorkoutSession | null> => {
    if (Platform.OS === 'web') {
      try {
        const raw = await AsyncStorage.getItem('@kilo_active_draft');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    try {
      const db = await getDb();
      if (!db) return null;
      const row = await db.getFirstAsync<{ session_data: string }>(
        'SELECT session_data FROM active_draft_session WHERE id = ?',
        ['current_active_draft']
      );
      return row ? (JSON.parse(row.session_data) as WorkoutSession) : null;
    } catch (e) {
      console.warn('[SQLite] getDraftSession error:', e);
      return null;
    }
  },

  clearDraftSession: async (): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.removeItem('@kilo_active_draft');
      } catch {}
      return;
    }

    try {
      const db = await getDb();
      if (!db) return;
      await db.runAsync('DELETE FROM active_draft_session WHERE id = ?', ['current_active_draft']);
    } catch (e) {
      console.warn('[SQLite] clearDraftSession error:', e);
    }
  },

  // Custom User Exercises
  getCustomExercises: async (): Promise<string[]> => {
    if (Platform.OS === 'web') return [];
    try {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.getAllAsync<{ name: string }>(
        'SELECT name FROM custom_exercises ORDER BY name ASC'
      );
      return rows.map(r => r.name);
    } catch {
      return [];
    }
  },

  saveCustomExercise: async (name: string): Promise<void> => {
    if (Platform.OS === 'web' || !name || !name.trim()) return;
    try {
      const db = await getDb();
      if (!db) return;
      const clean = name.trim();
      await db.runAsync(
        'INSERT OR IGNORE INTO custom_exercises (id, name, created_at) VALUES (?, ?, ?)',
        ['cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), clean, Date.now()]
      );
    } catch (e) {
      console.warn('[SQLite] saveCustomExercise error:', e);
    }
  },
};
