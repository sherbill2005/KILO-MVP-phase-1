# Kilo: Zero-Touch Voice Workout Tracker

Kilo is a high-performance, voice-first workout tracking application designed for gym environments. The core interaction model is **"Zero-Touch"**, where **Latency is the Product**—enabling lifters to log and correct sets hands-free with instant tactile and earbud audio feedback.

---

## 🏗️ Monorepo Structure

```
Kilo/
├── apps/
│   ├── mobile/         → Production mobile app (Expo SDK 57 / React Native / TypeScript)
│   │   ├── src/
│   │   │   ├── components/     5 reusable UI components
│   │   │   ├── context/        WorkoutContext + RestTimerContext
│   │   │   ├── models/         32-exercise taxonomy + workout types + 1RM formulas
│   │   │   ├── navigation/     State-based RootNavigator (6 screens)
│   │   │   ├── screens/        Home, Live, Batch, Analytics, Settings, Welcome
│   │   │   ├── services/
│   │   │   │   ├── audio/      16kHz PCM recording, WebSocket client, haptics, TTS
│   │   │   │   ├── parser/     Fuzzy exercise matcher + contextual voice parser
│   │   │   │   └── storage/    expo-sqlite DB, AsyncStorage prefs, sync service
│   │   │   └── theme/          OLED Gym Dark color tokens
│   │   └── tests via vitest
│   └── pwa/            → Web PWA prototype (Phase 1 artifact)
├── services/
│   └── api-worker/     → Cloudflare Worker + Gemini Live WebSocket proxy
│       ├── src/
│       │   ├── index.ts        REST API router (sessions, sets, corrections)
│       │   ├── validation.ts   Batch payload validation
│       │   └── live/           Gemini Live WebSocket proxy + persistence
│       └── tests/              Vitest unit tests
├── packages/
│   └── shared/         → Shared TypeScript types (server-side workout model)
└── Documentation/      → Master specs: Product & Architecture, UI Design, Phase 2 Roadmap
```

---

## ✨ Key Features (All Implemented)

- 🎙️ **Push-to-Talk voice logging** via Gemini Live AI streaming
- 🧠 **Smart contextual parser** — *"90 for 8"*, *"same weight, same reps"*, voice CRUD
- 🔍 **Fuzzy exercise matcher** — 32 exercises with aliases, Levenshtein + token overlap
- ⏱️ **Auto 60s rest timer** with +30s / skip controls
- 📳 **Haptic receipts** — success, delete, timer alerts
- 🔊 **TTS earbud receipts** — *"80 kilos, 10 reps"* (toggle-able)
- 💾 **100% offline-first** — expo-sqlite on device, AsyncStorage fallback
- ☁️ **Background sync** to Cloudflare Worker KV
- 📊 **Analytics** — 1RM estimation (Brzycki + Epley), volume by muscle group
- 🎨 **OLED Gym Dark theme** — `#0B0E14`, Cyan `#00E5FF`, Volt Lime `#D4FF00`

---

## 📱 Quick Start: Mobile App (Expo Go)

You do **not** need Android Studio or heavy virtual emulators.

```bash
cd apps/mobile
npm install
npm start
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
# All tests from root
npm test

# Worker validation tests only
npm run worker:test

# Mobile parser + fuzzy matcher tests only
npm run mobile:test
```

**Current test status**: 17 tests, all passing ✅
- Worker: 4 validation tests
- Mobile: 13 parser + fuzzy matcher tests

---

## 🌐 API Reference

### REST Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` or `/` | Health check (KV, Gemini key, model) |
| `POST` | `/api/sessions` | Create workout session |
| `POST` | `/api/sessions/:id/sets` | Log single or batch sets |
| `PATCH` | `/api/sets/:id` | Update/correct a set |
| `OPTIONS` | `*` | CORS preflight |

### WebSocket: `/ws/ai/live`

| Direction | Message Type | Purpose |
|-----------|-------------|---------|
| Client → Worker | `session` | Bind session ID |
| Client → Worker | `context` | Send exercise vocabulary |
| Client → Worker | `audio` | Stream base64 PCM16 16kHz audio |
| Client → Worker | `stop` | End speech / trigger Gemini response |
| Worker → Client | `status` | `listening` / `processing` / `error` |
| Worker → Client | `result` | Parsed workout JSON + KV IDs + transcript |

---

## 🎨 Design System & UI Specs

See [UI_DESIGN_SPECIFICATION.md](Documentation/UI_DESIGN_SPECIFICATION.md) for the complete design system including:
- Color tokens (OLED Gym Dark theme)
- Typography specs (Inter / Plus Jakarta Sans)
- Screen-by-screen layout prompts
- Component specifications

---

## 📋 Documentation Index

| Document | Description |
|----------|-------------|
| [PRODUCT_AND_ARCHITECTURE.md](Documentation/PRODUCT_AND_ARCHITECTURE.md) | Full PRD, database schema, API spec |
| [UI_DESIGN_SPECIFICATION.md](Documentation/UI_DESIGN_SPECIFICATION.md) | Design system, color palette, screen prompts |
| [PHASE_1_WEB_MVP.md](Documentation/PHASE_1_WEB_MVP.md) | Web PWA + Gemini Live pipeline details |
| [PHASE_2_ANDROID_NATIVE.md](Documentation/PHASE_2_ANDROID_NATIVE.md) | Native Kotlin/Compose production plan |
| [USER_PREREQUISITES_CHECKLIST.md](Documentation/USER_PREREQUISITES_CHECKLIST.md) | External credentials & setup tracker |

---

## 🔧 Developer Rules

- Always use `npx expo install` for mobile dependencies
- Keep data persistence **offline-first** with `expo-sqlite`
- Maintain the OLED Gym Dark theme (`#0B0E14`, Cyan `#00E5FF`, Volt Lime `#D4FF00`)
- Use `credentials.txt` for reference keys and `.dev.vars` for local worker execution
- Run `npm test` before pushing — all 29 tests (16 worker + 13 mobile) must pass