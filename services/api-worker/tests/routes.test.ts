import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

const parseJson = async <T = any>(res: Response): Promise<T> => (await res.json()) as T;

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key: string, value: string) {
      store.set(key, String(value));
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix || "";
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return {
        keys,
        list_complete: true,
        cursor: "",
      } as any;
    },
  } as unknown as KVNamespace;
}

describe("Cloudflare Worker API Routes", () => {
  let env: Env;

  beforeEach(() => {
    env = {
      KILO_KV: createMockKV(),
      GEMINI_API_KEY: "fake_gemini_key",
      GEMINI_MODEL: "gemini-2.5-flash-native-audio-preview-12-2025",
    };
  });

  describe("CORS & Health", () => {
    it("responds to OPTIONS preflight with CORS headers", async () => {
      const req = new Request("http://localhost/api/sessions", {
        method: "OPTIONS",
      });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it("returns healthy status on /health", async () => {
      const req = new Request("http://localhost/health");
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
      const data = await parseJson(res);
      expect(data).toMatchObject({
        status: "healthy",
        kv: true,
        hasGeminiKey: true,
      });
    });
  });

  describe("Workout Sessions", () => {
    it("validates session creation payload", async () => {
      const invalidUser = new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "", workout_date: "2026-10-21" }),
      });
      const res1 = await worker.fetch(invalidUser, env);
      expect(res1.status).toBe(400);

      const invalidDate = new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "usr_123", workout_date: "not-a-date" }),
      });
      const res2 = await worker.fetch(invalidDate, env);
      expect(res2.status).toBe(400);
    });

    it("creates a new session and retrieves it", async () => {
      const createReq = new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "usr_athlete_1",
          workout_date: "2026-10-21",
        }),
      });
      const createRes = await worker.fetch(createReq, env);
      expect(createRes.status).toBe(200);
      const { session_id } = await parseJson(createRes);
      expect(session_id).toBeTruthy();

      const getReq = new Request(`http://localhost/api/sessions/${session_id}`);
      const getRes = await worker.fetch(getReq, env);
      expect(getRes.status).toBe(200);
      const session = await parseJson(getRes);
      expect(session.id).toBe(session_id);
      expect(session.user_id).toBe("usr_athlete_1");
      expect(session.finished).toBe(false);
      expect(session.groups).toEqual([]);
      expect(session.sets).toEqual([]);
    });

    it("lists sessions and filters by user_id", async () => {
      // Create session for user A
      await worker.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "user_a", workout_date: "2026-10-20" }),
        }),
        env
      );
      // Create session for user B
      await worker.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "user_b", workout_date: "2026-10-21" }),
        }),
        env
      );

      // List all
      const listAll = await worker.fetch(
        new Request("http://localhost/api/sessions"),
        env
      );
      const allData = await parseJson(listAll);
      expect(allData.sessions.length).toBe(2);

      // List filtered by user_a
      const listFiltered = await worker.fetch(
        new Request("http://localhost/api/sessions?user_id=user_a"),
        env
      );
      const filteredData = await parseJson(listFiltered);
      expect(filteredData.sessions.length).toBe(1);
      expect(filteredData.sessions[0].user_id).toBe("user_a");
    });

    it("returns 404 for non-existent session", async () => {
      const res = await worker.fetch(
        new Request("http://localhost/api/sessions/non_existent_id"),
        env
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Workout Sets & Groups", () => {
    let sessionId: string;

    beforeEach(async () => {
      const res = await worker.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "usr_athlete_1",
            workout_date: "2026-10-21",
          }),
        }),
        env
      );
      const data = await parseJson(res);
      sessionId = data.session_id;
    });

    it("adds a single set to a session", async () => {
      const addSetReq = new Request(
        `http://localhost/api/sessions/${sessionId}/sets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercise_name: "Bench Press",
            weight_value: 80,
            weight_unit: "kg",
            reps: 8,
          }),
        }
      );
      const res = await worker.fetch(addSetReq, env);
      expect(res.status).toBe(200);
      const data = await parseJson(res);
      expect(data.set_id).toBeTruthy();
      expect(data.group_id).toBeTruthy();
    });

    it("adds batch sets to a session and hydrates properly on GET", async () => {
      const batchReq = new Request(
        `http://localhost/api/sessions/${sessionId}/sets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercise_name: "Barbell Squat",
            sets: [
              { weight_value: 100, weight_unit: "kg", reps: 5 },
              { weight_value: 105, weight_unit: "kg", reps: 5 },
              { weight_value: 110, weight_unit: "kg", reps: 3 },
            ],
          }),
        }
      );
      const res = await worker.fetch(batchReq, env);
      expect(res.status).toBe(200);
      const batchData = await parseJson(res);
      expect(batchData.group_id).toBeTruthy();
      expect(batchData.set_ids.length).toBe(3);

      // Verify hydrated session
      const getRes = await worker.fetch(
        new Request(`http://localhost/api/sessions/${sessionId}`),
        env
      );
      const session = await parseJson(getRes);
      expect(session.groups.length).toBe(1);
      expect(session.groups[0].exercise_name).toBe("Barbell Squat");
      expect(session.sets.length).toBe(3);
      expect(session.sets[0].weight_value).toBe(100);
      expect(session.sets[1].weight_value).toBe(105);
      expect(session.sets[2].weight_value).toBe(110);
    });

    it("patches and corrects an existing set", async () => {
      // Add a set
      const addRes = await worker.fetch(
        new Request(`http://localhost/api/sessions/${sessionId}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercise_name: "Incline Dumbbell Press",
            weight_value: 30,
            weight_unit: "kg",
            reps: 10,
          }),
        }),
        env
      );
      const { set_id } = await parseJson(addRes);

      // Patch the set (user corrected reps from 10 to 12)
      const patchReq = new Request(`http://localhost/api/sets/${set_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reps: 12, weight_value: 32 }),
      });
      const patchRes = await worker.fetch(patchReq, env);
      expect(patchRes.status).toBe(200);
      const patchData = await parseJson(patchRes);
      expect(patchData.ok).toBe(true);

      // Check hydrated session has corrected flag and updated values
      const getRes = await worker.fetch(
        new Request(`http://localhost/api/sessions/${sessionId}`),
        env
      );
      const session = await parseJson(getRes);
      const updatedSet = session.sets.find((s: any) => s.id === set_id);
      expect(updatedSet.reps).toBe(12);
      expect(updatedSet.weight_value).toBe(32);
      expect(updatedSet.corrected).toBe(true);
    });
  });

  describe("Finish Session", () => {
    it("finishes an active session with timestamp", async () => {
      // 1. Create session
      const createRes = await worker.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "usr_athlete_1",
            workout_date: "2026-10-21",
          }),
        }),
        env
      );
      const { session_id } = await parseJson(createRes);

      // 2. Finish session
      const customTimestamp = "2026-10-21T18:45:00.000Z";
      const finishReq = new Request(
        `http://localhost/api/sessions/${session_id}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finished_at: customTimestamp }),
        }
      );
      const finishRes = await worker.fetch(finishReq, env);
      expect(finishRes.status).toBe(200);
      const finishData = await parseJson(finishRes);
      expect(finishData.ok).toBe(true);
      expect(finishData.finished_at).toBe(customTimestamp);

      // 3. Verify session retrieval reflects finished state
      const getRes = await worker.fetch(
        new Request(`http://localhost/api/sessions/${session_id}`),
        env
      );
      const session = await parseJson(getRes);
      expect(session.finished).toBe(true);
      expect(session.finished_at).toBe(customTimestamp);
    });

    it("returns 404 when finishing a non-existent session", async () => {
      const finishReq = new Request(
        "http://localhost/api/sessions/unknown_sess/finish",
        {
          method: "POST",
        }
      );
      const finishRes = await worker.fetch(finishReq, env);
      expect(finishRes.status).toBe(404);
    });
  });

  describe("Unknown Routes", () => {
    it("returns 404 for unrecognized paths", async () => {
      const res = await worker.fetch(
        new Request("http://localhost/unknown/endpoint"),
        env
      );
      expect(res.status).toBe(404);
    });
  });
});
