export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** Reserve exact matches first, then spend the remaining letter counts. */
export function scoreGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill('absent');
  const remaining = {};
  for (let index = 0; index < WORD_LENGTH; index++) {
    if (guess[index] === answer[index]) result[index] = 'correct';
    else remaining[answer[index]] = (remaining[answer[index]] || 0) + 1;
  }
  for (let index = 0; index < WORD_LENGTH; index++) {
    if (result[index] !== 'correct' && remaining[guess[index]] > 0) {
      result[index] = 'present';
      remaining[guess[index]]--;
    }
  }
  return result;
}

export function getKeyboardStates(guesses, answer) {
  const states = {};
  const priority = { absent: 1, present: 2, correct: 3 };
  for (const guess of guesses) {
    scoreGuess(guess, answer).forEach((state, index) => {
      const letter = guess[index];
      if (!states[letter] || priority[state] > priority[states[letter]]) states[letter] = state;
    });
  }
  return states;
}

export function getHardModeError(guess, guesses, answer) {
  const required = {};
  const positions = {};
  for (const previous of guesses) {
    const counts = {};
    scoreGuess(previous, answer).forEach((state, index) => {
      if (state === 'correct') positions[index] = previous[index];
      if (state !== 'absent') counts[previous[index]] = (counts[previous[index]] || 0) + 1;
    });
    for (const [letter, count] of Object.entries(counts)) {
      required[letter] = Math.max(required[letter] || 0, count);
    }
  }
  const ordinal = ['1st', '2nd', '3rd', '4th', '5th'];
  for (const [index, letter] of Object.entries(positions)) {
    if (guess[index] !== letter) return `${ordinal[index]} letter must be ${letter}`;
  }
  for (const [letter, count] of Object.entries(required)) {
    if ([...guess].filter(value => value === letter).length < count) {
      return count === 1 ? `Guess must contain ${letter}` : `Guess must contain ${count} ${letter}s`;
    }
  }
  return null;
}

export function chooseAnswer(answers, previous, random = () => {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}) {
  if (answers.length === 0) throw new Error('The answer list is empty');
  const candidates = answers.length > 1 ? answers.filter(word => word !== previous) : answers;
  return candidates[Math.floor(random() * candidates.length)];
}

export function getGameStatus(guesses, answer) {
  if (guesses.at(-1) === answer) return 'won';
  return guesses.length === MAX_GUESSES ? 'lost' : 'playing';
}

export function emptyStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, distribution: [0, 0, 0, 0, 0, 0], recordedIds: [] };
}

export function recordResult(stats, game) {
  const status = getGameStatus(game.guesses, game.answer);
  if (status === 'playing' || stats.recordedIds.includes(game.id)) return stats;
  const next = { ...stats, distribution: [...stats.distribution], recordedIds: [...stats.recordedIds, game.id] };
  next.played++;
  if (status === 'won') {
    next.wins++;
    next.streak++;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    next.distribution[game.guesses.length - 1]++;
  } else next.streak = 0;
  return next;
}

export function makeShareText(game, highContrast = false, dark = false) {
  const status = getGameStatus(game.guesses, game.answer);
  const colors = { correct: highContrast ? '🟧' : '🟩', present: highContrast ? '🟦' : '🟨', absent: dark ? '⬛' : '⬜' };
  return `Wibe Coded Wordle ${status === 'won' ? game.guesses.length : 'X'}/6${game.hardMode ? '*' : ''}\n\n`
    + game.guesses.map(guess => scoreGuess(guess, game.answer).map(state => colors[state]).join('')).join('\n');
}
