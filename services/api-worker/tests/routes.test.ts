import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker, { timingSafeTokenEqual, getCorsHeaders } from "../src/index";
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
      GEMINI_MODEL: "gemini-3-flash-preview",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("CORS & Health (Fix 3)", () => {
    it("responds to OPTIONS preflight with CORS headers including authorization", async () => {
      const req = new Request("http://localhost/api/sessions", {
        method: "OPTIONS",
      });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
      expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
    });

    it("enforces ALLOWED_ORIGINS for browser Origin headers while allowing native mobile (no Origin)", () => {
      const restrictedEnv: Env = {
        ...env,
        ALLOWED_ORIGINS: "https://app.kilo.fit, https://kilo.fit",
      };

      // Allowed browser origin
      const allowedReq = new Request("http://localhost/api/sessions", {
        headers: { Origin: "https://app.kilo.fit" },
      });
      expect(getCorsHeaders(allowedReq, restrictedEnv)["access-control-allow-origin"]).toBe(
        "https://app.kilo.fit"
      );

      // Disallowed browser origin
      const blockedReq = new Request("http://localhost/api/sessions", {
        headers: { Origin: "https://evil.example.com" },
      });
      expect(getCorsHeaders(blockedReq, restrictedEnv)["access-control-allow-origin"]).toBe(
        "null"
      );

      // Native mobile client (no Origin header)
      const mobileReq = new Request("http://localhost/api/sessions");
      expect(getCorsHeaders(mobileReq, restrictedEnv)["access-control-allow-origin"]).toBe(
        "*"
      );
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

  describe("Optional Timing-Safe API Key Authentication (Fix 1)", () => {
    it("compares tokens in constant time via timingSafeTokenEqual", async () => {
      expect(await timingSafeTokenEqual("secret-123", "secret-123")).toBe(true);
      expect(await timingSafeTokenEqual("secret-123", "secret-124")).toBe(false);
      expect(await timingSafeTokenEqual("secret-123", "short")).toBe(false);
    });

    it("enforces KILO_API_KEY when configured while keeping /health public", async () => {
      const securedEnv: Env = {
        ...env,
        KILO_API_KEY: "kilo_prod_secret_token",
      };

      // 1. /health remains public without auth header
      const healthRes = await worker.fetch(new Request("http://localhost/health"), securedEnv);
      expect(healthRes.status).toBe(200);

      // 2. Protected route without token -> 401
      const unauthRes = await worker.fetch(
        new Request("http://localhost/api/sessions"),
        securedEnv
      );
      expect(unauthRes.status).toBe(401);
      const unauthJson = await parseJson(unauthRes);
      expect(unauthJson.error.code).toBe("UNAUTHORIZED");

      // 3. Protected route with wrong Bearer token -> 401
      const wrongRes = await worker.fetch(
        new Request("http://localhost/api/sessions", {
          headers: { Authorization: "Bearer wrong_token" },
        }),
        securedEnv
      );
      expect(wrongRes.status).toBe(401);

      // 4. Protected route with valid Bearer token -> 200
      const validBearerRes = await worker.fetch(
        new Request("http://localhost/api/sessions", {
          headers: { Authorization: "Bearer kilo_prod_secret_token" },
        }),
        securedEnv
      );
      expect(validBearerRes.status).toBe(200);

      // 5. Protected route with valid ?token= query param -> 200
      const validQueryRes = await worker.fetch(
        new Request("http://localhost/api/sessions?token=kilo_prod_secret_token"),
        securedEnv
      );
      expect(validQueryRes.status).toBe(200);
    });
  });

  describe("Workout Sessions & Malformed JSON Handling (Fix 2)", () => {
    it("rejects malformed JSON bodies with 400 BAD_REQUEST instead of 500", async () => {
      const badJsonReq = new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json",
      });
      const res = await worker.fetch(badJsonReq, env);
      expect(res.status).toBe(400);
      const data = await parseJson(res);
      expect(data.error.code).toBe("BAD_REQUEST");
    });

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
      await worker.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "user_a", workout_date: "2026-10-20" }),
        }),
        env
      );
      await worker.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "user_b", workout_date: "2026-10-21" }),
        }),
        env
      );

      const listAll = await worker.fetch(
        new Request("http://localhost/api/sessions"),
        env
      );
      const allData = await parseJson(listAll);
      expect(allData.sessions.length).toBe(2);

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

  describe("Workout Sets, Groups & Atomic Batch Sync", () => {
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

    it("patches and corrects an existing set and rejects empty patch bodies", async () => {
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

      // Empty patch body -> 400
      const emptyPatchRes = await worker.fetch(
        new Request(`http://localhost/api/sets/${set_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        env
      );
      expect(emptyPatchRes.status).toBe(400);

      // Valid patch
      const patchReq = new Request(`http://localhost/api/sets/${set_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reps: 12, weight_value: 32 }),
      });
      const patchRes = await worker.fetch(patchReq, env);
      expect(patchRes.status).toBe(200);
      const patchData = await parseJson(patchRes);
      expect(patchData.ok).toBe(true);

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

    it("atomically syncs an entire mobile workout session via /api/workouts/sync-batch", async () => {
      const syncReq = new Request("http://localhost/api/workouts/sync-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            id: "live_mobile_sync_1",
            userId: "usr_local",
            workoutDate: "2026-10-28",
            startedAt: 1774200000000,
            finishedAt: 1774203600000,
            mode: "LIVE",
            groups: [
              {
                id: "grp_m1",
                exerciseName: "Bench Press",
                sets: [
                  { id: "set_m1", weightValue: 85, weightUnit: "kg", reps: 8 },
                  { id: "set_m2", weightValue: 90, weightUnit: "kg", reps: 6 },
                ],
              },
            ],
          },
        }),
      });
      const syncRes = await worker.fetch(syncReq, env);
      expect(syncRes.status).toBe(200);
      const syncData = await parseJson(syncRes);
      expect(syncData).toEqual({
        ok: true,
        session_id: "live_mobile_sync_1",
        set_count: 2,
      });

      const hydratedRes = await worker.fetch(
        new Request("http://localhost/api/sessions/live_mobile_sync_1"),
        env
      );
      const hydrated = await parseJson(hydratedRes);
      expect(hydrated.groups.length).toBe(1);
      expect(hydrated.sets.length).toBe(2);
    });
  });

  describe("AI Audio Parse Endpoint (/api/ai/parse-audio — Fix 4)", () => {
    it("parses audio via Gemini Flash model and persists extracted sets to KV", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        transcript: "Bench press 80 kg for 10 reps",
                        workout: [
                          {
                            exercise: "Bench Press",
                            sets: [{ weight: 80, unit: "kg", reps: 10 }],
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const parseReq = new Request("http://localhost/api/ai/parse-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_base64: "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////",
          mime_type: "audio/mp4",
          exercises: ["Bench Press", "Squat"],
          session_id: "live_audio_test_1",
        }),
      });

      const res = await worker.fetch(parseReq, env);
      expect(res.status).toBe(200);
      const data = await parseJson(res);
      expect(data.ok).toBe(true);
      expect(data.transcript).toBe("Bench press 80 kg for 10 reps");
      expect(data.workout.length).toBe(1);
      expect(data.set_ids.length).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][0])).toContain("gemini-3-flash-preview:generateContent");
    });
  });

  describe("Finish Session", () => {
    it("finishes an active session with timestamp", async () => {
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
