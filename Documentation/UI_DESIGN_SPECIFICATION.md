# Kilo Mobile: UI/UX Design System & AI Prompt Specification

**Document Purpose:** Feed this specification directly into AI UI makers (e.g. Galileo AI, v0, Uizard, Claude, Figma AI) to generate production-ready UI mockups, design tokens, and wireframes for **Kilo Mobile (Android)**.

---

## 1. Design System, Visual Theme & Style Guide

### 1.1 Aesthetic & Atmosphere
- **Theme:** Ultra-modern, athletic **Gym Dark Mode** with tactile, high-contrast surfaces.
- **Mood:** Minimalist, fast, premium, focused. Designed for high readability under glaring gym lights or low-lit workout floors.
- **Micro-Interactions:** Haptic feedback on touches, pulsating audio waveform rings during speech, smooth 60fps card transitions.

### 1.2 Color Palette (Dark Mode First)
| Token Name | Hex Code | Purpose |
|---|---|---|
| `--bg-base` | `#0B0E14` | Main screen background (deep OLED slate/black) |
| `--surface-card` | `#161B22` | Card containers, table rows, and dialogue surfaces |
| `--surface-elevated`| `#212833` | Modals, bottom sheets, active input fields |
| `--primary-accent` | `#00E5FF` | Kinetic Cyan / Electric Blue (Primary CTAs, active timers) |
| `--secondary-accent`| `#D4FF00` | Volt Lime (Voice active states, 1RM PR badges) |
| `--text-primary` | `#FFFFFF` | Primary headers, weights, and reps |
| `--text-secondary` | `#94A3B8` | Subtext, timestamps, units, exercise muscle tags |
| `--danger` | `#FF453A` | Delete actions, cancel buttons |
| `--success` | `#30D158` | Logged confirmation badges, sync completed |

### 1.3 Typography
- **Font Family:** `Inter` or `Plus Jakarta Sans`
- **Weights:** Heavy Bold (800) for numbers (weights, reps, timer), Medium (500) for labels, Regular (400) for transcripts.

---

## 2. Screen-by-Screen UI Layout & Component Prompts

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE SCREENS OVERVIEW                           │
│                                                                        │
│  [Screen 1] Auth & Welcome       ──► Google 1-Tap Sign-In              │
│  [Screen 2] Home Dashboard       ──► Weekly Stats & Mode Selection     │
│  [Screen 3] Mode 1: Live Workout ──► Set-by-Set Voice & 60s Rest Timer │
│  [Screen 4] Mode 2: Batch Voice  ──► Single Multi-Exercise Audio Log   │
│  [Screen 5] Analytics & 1RM      ──► Volume & Muscle Group Distribution│
│  [Screen 6] Settings & Audio     ──► Earbud TTS & Metric Preferences   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 1: Welcome & Authentication Screen

**AI Prompt Description:**
> "Design an athletic, high-contrast dark mode welcome screen for a voice-first workout app called 'KILO'. Deep slate background (`#0B0E14`). Clean bold typography: 'KILO' in heavy white with a kinetic cyan accent. Tagline: 'Zero-Touch Voice Workout Tracker'. An elegant glowing microphone icon in the center with subtle concentric rings. At the bottom, a prominent white Google Sign-In button ('Continue with Google') and a secondary subtle text button 'Explore as Guest'."

**Key UI Elements:**
1. Minimalist Kilo Logo with subtle cyan glow.
2. Value Proposition bullet chips: `⚡ <100ms Logging` · `🎙️ Gym Noise Proof` · `📶 100% Offline`.
3. High-contrast **"Continue with Google"** button with standard Google icon.
4. Minimalist footer with Privacy Policy link.

---

### Screen 2: Home Dashboard & Workout Hub

**AI Prompt Description:**
> "Design an Android mobile home dashboard for a fitness tracking app in dark mode (`#0B0E14`). Top app bar with user profile avatar, current date, and a cloud sync status badge (green checkmark 'Offline-Ready'). Top Hero Stats Card displaying Weekly Total Volume '28,450 kg' and '14 Workouts Completed' with a subtle gradient border. Below, two large, high-contrast primary action cards for starting a workout: Card 1 'Start Live Workout' (Badge: 'Interactive · 60s Rest Timer · Voice Context') with an electric volt accent, and Card 2 'Log Whole Workout in One Go' (Badge: 'Batch Voice Log'). Lower section shows 'Past Workouts' list cards with date, exercise summary chips, volume, and total sets."

**Key UI Elements:**
1. **Header Bar:** Profile image, streak counter (e.g. `🔥 4 days`), Sync status icon.
2. **Weekly Volume Widget:** Large digital numbers (`32,100 kg`), mini weekly bar chart.
3. **Primary Action Cards (The 2 Core Modes):**
   - **Card A: "Start Live Workout"**: Highlighted in Electric Volt (`#D4FF00`) / Cyan border. Explains: *"Log sets one-by-one as you lift with auto rest timer"*.
   - **Card B: "Log Whole Workout in One Go"**: Surface slate card. Explains: *"Speak your whole completed routine in one voice clip"*.
4. **Recent History List:** Cards showing past dates (*"Yesterday: Chest & Triceps · 18 sets · 6,400 kg"*).

---

### Screen 3: Mode 1 — Live Interactive Workout Screen (The Core Experience)

**AI Prompt Description:**
> "Design the core live workout screen for a voice-first gym logger in dark slate (`#0B0E14`). Top header shows active exercise 'Bench Press' with target set chips ('Set 3 of 4'). Main area contains a sleek grouped sets table with columns: Set #, Weight (kg), Reps, 1RM Est. Row 3 is highlighted with a green accent border indicating it was just logged. Above the table, a Smart Voice Context banner: 'Context: Bench Press · Say \"same weight, same reps\" or \"85 kg for 8\"'. Bottom area has an animated floating 60-second circular Rest Timer with '+30s' and 'Skip' buttons. Floating at the bottom center is a large, glowing circular Push-to-Talk microphone button with a pulsating wave ring and label 'HOLD TO LOG'."

**Key UI Elements:**
1. **Active Exercise Header:**
   - Exercise Title (e.g. **Bench Press**).
   - Target Set Selector chips: `[3 Sets]` `[4 Sets]` `[5 Sets]`.
2. **Smart Context Pill:**
   - *"Active: Bench Press. Next set: Say '90 kg 8 reps' or 'same as last'"*.
3. **Live Sets Table:**
   - Columns: `SET` | `WEIGHT` | `REPS` | `EST 1RM` | `ACTIONS`.
   - Tap cell to open quick numeric keypad / swipe left to delete.
4. **Auto 60-Second Rest Timer Bar:**
   - Circular countdown timer (`00:48 / 01:00`).
   - Controls: `[+30s]`, `[Pause]`, `[Skip]`.
5. **Push-to-Talk Floating Action Button (FAB):**
   - Extra-large center-docked button with microphone icon.
   - Scale-up animation on press with radiating soundwave rings.

---

### Screen 4: Mode 2 — Batch Voice Workout Ingestion Screen

**AI Prompt Description:**
> "Design a batch voice workout ingestion screen in dark mode. Top navigation with 'Cancel' and 'Save Workout'. Upper half features a large circular audio visualizer showing live voice waveforms while the user speaks multiple exercises in one go. Below the visualizer is a live speech-to-text transcript card with recognized gym terms highlighted. Lower half displays a generated multi-exercise grouped table preview (e.g. 'Incline Bench Press: 3 sets', 'Dumbbell Row: 4 sets') with instant tap-to-edit numbers and a big primary button at the bottom: 'Confirm & Save Workout'."

**Key UI Elements:**
1. **Voice Prompt Banner:** *"Hold and speak your entire session (e.g. 'Bench press 3 sets of 10 at 80 kg, then Squats 100 kg for 5 reps')"*.
2. **Audio Waveform Canvas:** Real-time animated audio level bars.
3. **Live Transcript Card:** Real-time streaming transcription with recognized exercises highlighted in Volt Lime.
4. **Parsed Workout Preview Table:** Automatically grouped by exercise with editable weights/reps.
5. **Bottom Action Bar:** `[Discard]` and `[Confirm & Save Workout]`.

---

### Screen 5: Analytics & 1RM Estimator Screen

**AI Prompt Description:**
> "Design an analytics and strength progress screen for a workout tracker. Dark theme (`#0B0E14`). Top toggle: '1RM Strength' vs 'Volume Distribution'. When 1RM is selected, a sleek line chart tracks 1RM progression for 'Bench Press' over the last 8 weeks (from 95 kg to 115 kg). Below the chart are stat cards for 'All-Time Best Set', 'Brzycki Formula Estimate', and 'Epley Formula Estimate'. When Volume is selected, display a circular muscle group distribution chart (Chest 35%, Legs 30%, Back 20%, Arms 15%) with colored legend badges."

**Key UI Elements:**
1. **Metric Segmented Control:** `[1RM Strength]` `[Volume Trends]` `[Muscle Breakdown]`.
2. **Strength Curve Chart:** Smooth bezier line chart with data points and PR badges.
3. **1RM Formula Comparison Cards:** Brzycki Estimate vs Epley Estimate.
4. **Muscle Group Radar / Donut Chart:** Categorized into Chest, Back, Legs, Shoulders, Arms.

---

### Screen 6: Settings & Audio Preferences Screen

**AI Prompt Description:**
> "Design a clean settings screen in dark mode with grouped list tiles. Group 1: 'Audio & Feedback' featuring a switch toggle 'Earbud Audio Receipts (TTS)' with subtext 'Hear snappy voice confirmations in headphones', and an Audio Volume slider. Group 2: 'Workout Defaults' with a selector for Default Unit ('kg' / 'lb') and Rest Timer default slider (60s). Group 3: 'Data & Sync' showing Cloudflare D1 Sync status '100% Offline Capable - 0 Pending Synced' and a 'Sync Now' button."

**Key UI Elements:**
1. **Earbud Voice Receipts Toggle:** `[ON / OFF]` switch with headphone icon.
2. **Default Units Selector:** Segmented control (`KG` / `LB`).
3. **Rest Timer Duration:** Slider from `30s` to `180s` (Default: `60s`).
4. **Cloud Sync Card:** Shows pending offline sync queue and status.
5. **About & Version:** Version `1.0.0-PROD`, Privacy Policy link.
