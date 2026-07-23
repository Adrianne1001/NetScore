# 🏸 NetScore

A beautiful, advanced, **rule-aware scoreboard** for net sports — badminton,
volleyball, pickleball, table tennis, tennis (tie-break), sepak takraw, and a
fully custom mode. Built as a static web app with **no dependencies** and
**HTML / CSS / JS in separate files**.

## ✨ Features

- **Sport presets** — each sport ships with correct rules (points to win,
  win-by-2, hard caps, best-of, deciding-game targets, serve rotation).
- **Smart serve tracking** — rally-winner serving (badminton/volleyball) and
  alternate-every-2 serving (table tennis/tennis), or set it manually by
  tapping the serve dot.
- **Game & match logic** — automatic game wins, sets/games tally, best-of
  handling, and a deciding-game target (e.g. volleyball's 5th set to 15).
- **Game / match point badges** — the leading team lights up when one point
  from closing the game or the match.
- **Match timer**, **undo** (unlimited within a match), **swap sides**,
  and **reset**.
- **Big tap targets** — tap anywhere on a score to add a point; ideal for
  courtside phones and tablets.
- **Win celebration** with confetti and a match summary.
- **Light / dark themes**, **fullscreen**, **sound effects**, and full
  **keyboard control**.
- **Auto-save** — the match resumes where you left off (localStorage).
- **Responsive** — works on phones, tablets, and big courtside displays.

## ⌨️ Keyboard shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Q` / `A` | Team A +1 / −1 | `S` | Swap sides |
| `P` / `L` | Team B +1 / −1 | `R` | Reset match |
| `Space` | Toggle server | `E` | Match setup |
| `U` | Undo | `T` | Toggle theme |
| `F` | Fullscreen | `?` | Shortcuts help |

## 🚀 Run it

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
# any static server works, e.g.
npx serve .
# or
python -m http.server 8000
```

## 📁 Structure

```
NetScore/
├── index.html          # markup
├── css/
│   └── styles.css      # theming, layout, animations
└── js/
    ├── sports.js       # per-sport rule presets
    ├── confetti.js     # win-celebration effect
    └── app.js          # scoring engine + UI controller
```

## 🛠 Customizing rules

Open **Match Setup** (gear icon or `E`) to change team names, points per game,
win-by, hard cap, best-of, first server, and sound — or pick **Custom** to
define everything yourself. New sports can be added by extending
`SPORTS` and `SPORT_ORDER` in [`js/sports.js`](js/sports.js).
