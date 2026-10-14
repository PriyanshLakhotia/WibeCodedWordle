# Wibe Coded Wordle

A minimal Wordle clone with a random puzzle every game. Six guesses, five letters, the familiar grid and keyboard, and proper repeated-letter scoring.

## Run locally

Requires Node.js 20 or newer. No dependencies or installation step.

```sh
npm start
```

The server runs at **http://localhost:6000**. Browsers reserve port 6000 for X11 and typically block it, so the same process also serves the identical app at **http://localhost:6001** for browser play. Both listeners are restricted to the local computer. Use `PORT=3000 npm start` to choose a different port.

## Features

- Random answers from the original 2,315-word Wordle answer pool; no immediate repeats.
- 14,855 accepted guesses from the NYT Wordle dictionary snapshot dated March 6, 2026.
- Physical keyboard and touch keyboard, tile flips, invalid-word shake, and win animation.
- Hard mode, dark theme, and high-contrast colors.
- Saved game, preferences, statistics, streaks, and guess distribution in browser storage.
- Spoiler-free result sharing and unlimited replay.
- Responsive layout, screen-reader feedback, modal focus handling, and reduced-motion support.

The dictionaries are bundled locally. Gameplay does not depend on third-party services. Reloading resumes a puzzle; the ↻ button starts a new random one.

## Word-list sources

- [`public/data/answers.txt`](public/data/answers.txt): [Cyrus Freshman's original Wordle answer list](https://gist.github.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b), extracted from the original game's source. Pinned raw revision: `c46f451920d5cf6326d550fb2d6abb1642717852`.
- [`public/data/guesses.txt`](public/data/guesses.txt): [NYT allowed guesses as of March 6, 2026](https://gist.github.com/cfreshman/8b92bc418b43096094cf5d1b0eea8f84). Pinned raw revision: `39a93b2708038355f7e35a16518643549b8b9f79`. All 2,315 possible answers are included in this acceptance list.

This is a local, independent clone. Random puzzles use the original answer pool, rather than the NYT's daily editorial selections. The accepted dictionary is a dated snapshot, not a claim of live synchronization.

## Verify

```sh
npm test
npm run check
```

The tests cover repeated-letter scoring, keyboard color priority, hard-mode constraints, replay selection, game outcomes, statistics, and result sharing. The checker validates both word lists and JavaScript syntax.
