# Kilo: Zero-Touch Voice Workout Tracker

Kilo is a high-performance, voice-first workout tracking application designed for gym environments. The core interaction model is **"Zero-Touch"**, where **Latency is the Product**—enabling lifters to log and correct sets hands-free with instant tactile and earbud audio feedback.

---

## 🏗️ Monorepo Structure

```
Kilo/
├── apps/
│   ├── mobile/         → Production mobile app (Expo SDK 57 / React Native 0.86 / TypeScript)
│   │   ├── src/
│   │   │   ├── components/     5 reusable UI components (FAB, GroupedSetTable, RestTimerBar, etc.)
│   │   │   ├── config/         Central Worker API & WebSocket URL configuration
│   │   │   ├── context/        WorkoutContext (WAL draft recovery) + RestTimerContext
│   │   │   ├── models/         32-exercise taxonomy + workout types + Brzycki/Epley 1RM formulas
│   │   │   ├── navigation/     State-based RootNavigator (6 screens)
│   │   │   ├── screens/        Home, Live, Batch, Analytics, Settings, Welcome
│   │   │   ├── services/
│   │   │   │   ├── audio/      Pre-warmed .m4a capture, AI audio client, Live WS client, haptics, TTS
│   │   │   │   ├── parser/     Fuzzy exercise matcher + contextual & batch voice parser
│   │   │   │   └── storage/    expo-sqlite DB (v1/v2 migrations), AsyncStorage prefs, batch sync
│   │   │   └── theme/          OLED Gym Dark color tokens
│   │   └── tests via vitest
│   └── pwa/            → Web PWA prototype (Phase 1 artifact)
├── services/
│   └── api-worker/     → Cloudflare Worker REST API + Gemini AI / Live WebSocket proxy
│       ├── src/
│       │   ├── index.ts        REST API router (health, parse-audio, sync-batch, sessions, sets)
│       │   ├── validation.ts   Batch payload validation
│       │   └── live/           Gemini Live WebSocket proxy + KV persistence
│       └── tests/              Vitest unit & route integration tests
├── packages/
│   └── shared/         → Shared TypeScript types (server-side workout model)
└── Documentation/      → Consolidated product, architecture, mobile testing, UI, and marketing docs
```

---

## ✨ Key Features (All Implemented)

- 🎙️ **Push-to-Talk voice logging** via Cloudflare Worker Gemini AI (`POST /api/ai/parse-audio` & `/ws/ai/live`)
- 🧠 **Smart contextual parser** — *"90 for 8"*, *"same weight, same reps"*, voice CRUD
- 🔍 **Fuzzy exercise matcher** — 32 canonical exercises with aliases + custom exercises, Levenshtein + token overlap
- ⏱️ **Auto 60s rest timer** with background notification alarms + `+30s` / skip controls
- 📳 **Haptic receipts** — success, delete, timer alerts
- 🔊 **TTS earbud receipts** — *"Bench Press, 80 kilos, 10 reps"* (toggle-able)
- 💾 **100% offline-first** — `expo-sqlite` on device with WAL active-draft crash recovery & `AsyncStorage` fallback
- ☁️ **Atomic background sync** to Cloudflare Worker KV (`POST /api/workouts/sync-batch`)
- 📊 **Analytics** — 1RM estimation (Brzycki + Epley), volume by muscle group
- 🎨 **OLED Gym Dark theme** — `#0B0E14`, Cyan `#00E5FF`, Volt Lime `#D4FF00`

---

## 📱 Quick Start: Mobile App (Expo Go)

```bash
cd apps/mobile
npm install
npx expo start --tunnel
```

1. Install **Expo Go** on your Android or iPhone.
2. Scan the QR code from your terminal.
3. Live hot-reloading — start testing immediately!

---

## ⚡ Quick Start: API Worker

```bash
cd services/api-worker
npm install
npx wrangler dev
```

> Requires a `.dev.vars` file with `GEMINI_API_KEY` and `GEMINI_MODEL`.

---

## 🧪 Running Tests

```bash
# Worker validation & route tests (16 tests)
npm run worker:test

# Mobile parser + fuzzy matcher tests (13 tests)
npm run mobile:test
```

**Current test status**: 29 tests, all passing ✅
- Worker: 16 tests (`validation.test.ts` [4] + `routes.test.ts` [12])
- Mobile: 13 tests (`parser.test.ts` [13])

---

## 🌐 API Reference

### REST Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` or `/` | Health check (KV, Gemini key, model) |
| `POST` | `/api/ai/parse-audio` | Parse base64 `.m4a` voice clip via Gemini & persist sets |
| `POST` | `/api/workouts/sync-batch` | Atomic single-request sync for a full `WorkoutSession` |
| `POST` | `/api/sessions` | Create workout session |
| `GET` | `/api/sessions` | List workout sessions (optional `?user_id=`) |
| `GET` | `/api/sessions/:id` | Get hydrated workout session (with groups & sets) |
| `POST` | `/api/sessions/:id/sets` | Log single or batch sets |
| `POST` | `/api/sessions/:id/finish` | Mark workout session as finished |
| `PATCH` | `/api/sets/:id` | Update/correct a set |
| `OPTIONS` | `*` | CORS preflight |

### WebSocket: `/ws/ai/live`

| Direction | Message Type | Purpose |
|-----------|-------------|---------|
| Client → Worker | `session` | Bind session ID |
| Client → Worker | `context` | Send exercise vocabulary |
| Client → Worker | `audio` | Stream base64 PCM16 16kHz audio |
| Client → Worker | `stop` | End speech / trigger Gemini response |
| Worker → Client | `status` | `connected` / `listening` / `processing` / `error` |
| Worker → Client | `result` | Parsed workout JSON + KV IDs + transcript |

---

## 📋 Consolidated Documentation (`Documentation/`)

| Document | Description |
|----------|-------------|
| [PRODUCT_AND_ARCHITECTURE.md](Documentation/PRODUCT_AND_ARCHITECTURE.md) | Master PRD, SQLite & KV schemas, full REST + WebSocket API spec |
| [MOBILE_APP_ARCHITECTURE_AND_TESTING.md](Documentation/MOBILE_APP_ARCHITECTURE_AND_TESTING.md) | Expo SDK 57 mobile architecture, frontend-backend connections, testing & EAS build guide |
| [UI_DESIGN_SPECIFICATION.md](Documentation/UI_DESIGN_SPECIFICATION.md) | Design system, OLED Gym Dark color palette, screen-by-screen specs |
| [PHASE_1_WEB_MVP.md](Documentation/PHASE_1_WEB_MVP.md) | Phase 1 Web PWA & Gemini Live WebSocket pipeline reference |
| [MARKETING_AND_POSITIONING.md](Documentation/MARKETING_AND_POSITIONING.md) | Brand positioning, founder story, waitlist & investor copy guide |
| [stitch_style_and_concept_explorer/](Documentation/stitch_style_and_concept_explorer/) | UI concept HTML/PNG mockups & Obsidian Kinetic design tokens |

---

## 🔧 Developer Rules

- Always use `npx expo install` for mobile dependencies
- Keep data persistence **offline-first** with `expo-sqlite`
- Maintain the OLED Gym Dark theme (`#0B0E14`, Cyan `#00E5FF`, Volt Lime `#D4FF00`)
- Use `credentials.txt` for reference keys and `.dev.vars` for local worker execution
- Run `npm run worker:test` and `npm run mobile:test` before pushing — all 29 tests (16 worker + 13 mobile) must pass
