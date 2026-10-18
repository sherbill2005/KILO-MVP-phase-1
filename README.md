# Kilo: Zero-Touch Voice Workout Tracker

Kilo is a high-performance, voice-first workout tracking application designed for gym environments. The core interaction model is **"Zero-Touch"**, where **Latency is the Product**—enabling lifters to log and correct sets hands-free with instant tactile and earbud audio feedback.

---

## 🏗️ Repo Structure
- `apps/mobile/` — **Production Mobile App (React Native / Expo + TypeScript)**
  - Zero Android Studio / heavy emulator footprint
  - 100% Offline-first local persistence
  - Push-to-Talk (Hold-to-Talk) voice input
  - Closed-taxonomy 35-exercise fuzzy matcher (0% hallucinations)
  - Smart contextual state engine (*"90 for 8"*, *"same weight, same reps"*, voice CRUD)
  - Auto 60s rest countdown timer
  - Earbud Text-to-Speech (TTS) & tactile haptic receipts
- `apps/pwa/` — Web-first PWA prototype (static HTML/CSS/JS)
- `services/api-worker/` — Cloudflare Worker API & Google Gemini Live WebSocket proxy
- `Documentaions/` — Master specifications & UI design systems

---

## 📱 Quick Start (Mobile App with Expo Go)

You do **not** need Android Studio or heavy virtual emulators to run and test the app.

1. Install dependencies:
```bash
cd apps/mobile
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open on your phone:
- Install **Expo Go** on your Android or iPhone from the App Store / Google Play.
- Scan the QR code shown in your terminal with your phone camera or Expo Go.
- Enjoy live hot-reloading!

---

## ⚡ Quick Start (API Worker)

1. Install dependencies:
```bash
cd services/api-worker
npm install
```

2. Start worker locally:
```bash
npx wrangler dev
```

---

## 🎨 Design System & UI Specs
See [UI_DESIGN_SPECIFICATION.md](file:///c:/Users/Zaid/Desktop/Zaid/projects/Kilo/Documentaions/UI_DESIGN_SPECIFICATION.md) for color tokens (`#0B0E14` Gym Dark OLED theme, `#00E5FF` Kinetic Cyan, `#D4FF00` Volt Lime), typography, and component specifications.