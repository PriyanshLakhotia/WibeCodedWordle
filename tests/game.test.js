import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreGuess, getKeyboardStates, getHardModeError, chooseAnswer,
  getGameStatus, emptyStats, recordResult, makeShareText,
} from '../src/game.js';

test('exact matches are all green', () => {
  assert.deepEqual(scoreGuess('APPLE', 'APPLE'), Array(5).fill('correct'));
});

test('letters in other positions are yellow and missing letters are gray', () => {
  assert.deepEqual(scoreGuess('TRAIN', 'CRATE'), ['present', 'correct', 'correct', 'absent', 'absent']);
});

test('repeated guess letters cannot claim one answer letter twice', () => {
  assert.deepEqual(scoreGuess('GEESE', 'THOSE'), ['absent', 'absent', 'absent', 'correct', 'correct']);
});

test('green letters are reserved before yellow letters, regardless of position', () => {
  assert.deepEqual(scoreGuess('ALLEY', 'BALMY'), ['present', 'absent', 'correct', 'absent', 'correct']);
});

test('the answer can contain two copies of the same letter', () => {
  assert.deepEqual(scoreGuess('PAPAL', 'APPLE'), ['present', 'present', 'correct', 'absent', 'present']);
});

test('keyboard retains the best known state of each letter', () => {
  const states = getKeyboardStates(['ALLEY', 'YACHT'], 'BALMY');
  assert.equal(states.L, 'correct');
  assert.equal(states.Y, 'correct');
  assert.equal(states.A, 'correct');
  assert.equal(states.C, 'absent');
});

test('hard mode enforces green positions and yellow letters', () => {
  assert.equal(getHardModeError('CRATE', ['TRAIN'], 'CRATE'), null);
  assert.equal(getHardModeError('PLANT', ['TRAIN'], 'CRATE'), '2nd letter must be R');
  assert.equal(getHardModeError('GRACE', ['TRAIN'], 'CRATE'), 'Guess must contain T');
});

test('hard mode requires all revealed copies of a repeated letter', () => {
  assert.equal(getHardModeError('AMPLE', ['PAPAL'], 'APPLE'), 'Guess must contain 2 Ps');
  assert.equal(getHardModeError('APPLE', ['PAPAL'], 'APPLE'), null);
});

test('hard mode permits a yellow letter in its old position, like Wordle', () => {
  assert.equal(getHardModeError('STALE', ['STALE'], 'LEAST'), null);
});

test('hard mode preserves hints from every earlier guess', () => {
  assert.equal(getHardModeError('CRASH', ['TRAIN', 'CRASH'], 'CRATE'), 'Guess must contain T');
});

test('random answers come from the curated pool and avoid immediate repeats', () => {
  assert.equal(chooseAnswer(['APPLE', 'CRANE', 'GRAPE'], undefined, () => 0), 'APPLE');
  assert.equal(chooseAnswer(['APPLE', 'CRANE', 'GRAPE'], 'APPLE', () => 0), 'CRANE');
  assert.equal(chooseAnswer(['APPLE', 'CRANE', 'GRAPE'], 'CRANE', () => .999), 'GRAPE');
  assert.equal(chooseAnswer(['APPLE'], 'APPLE', () => .5), 'APPLE');
  assert.throws(() => chooseAnswer([], undefined, () => 0));
});

test('a correct sixth guess wins; six incorrect guesses lose', () => {
  const guesses = ['CRANE', 'SLATE', 'GHOST', 'TRAIN', 'GRAPE'];
  assert.equal(getGameStatus(guesses, 'APPLE'), 'playing');
  assert.equal(getGameStatus([...guesses, 'APPLE'], 'APPLE'), 'won');
  assert.equal(getGameStatus([...guesses, 'STEAL'], 'APPLE'), 'lost');
});

test('results count once, even after reloading the same completed puzzle', () => {
  const game = { id: 'first', answer: 'APPLE', guesses: ['CRANE', 'APPLE'] };
  const original = emptyStats();
  const stats = recordResult(original, game);
  assert.equal(stats.played, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.streak, 1);
  assert.deepEqual(stats.distribution, [0, 1, 0, 0, 0, 0]);
  assert.deepEqual(recordResult(stats, game), stats);
  assert.equal(original.played, 0);
});

test('losses reset the current streak without resetting the best streak', () => {
  let stats = recordResult(emptyStats(), { id: 'first', answer: 'APPLE', guesses: ['APPLE'] });
  stats = recordResult(stats, { id: 'second', answer: 'CRANE', guesses: ['CRANE'] });
  stats = recordResult(stats, { id: 'third', answer: 'GRAPE', guesses: Array(6).fill('APPLE') });
  assert.equal(stats.played, 3);
  assert.equal(stats.wins, 2);
  assert.equal(stats.streak, 0);
  assert.equal(stats.maxStreak, 2);
});

test('unfinished games do not affect statistics', () => {
  const stats = emptyStats();
  assert.equal(recordResult(stats, { id: 'unfinished', answer: 'APPLE', guesses: ['CRANE'] }), stats);
});

test('share results use spoiler-free squares and mark hard mode', () => {
  const game = { answer: 'APPLE', guesses: ['CRANE', 'APPLE'], hardMode: true };
  const text = makeShareText(game);
  assert.equal(text, 'Wordle Unlimited 2/6*\n\n⬜⬜🟨⬜🟩\n🟩🟩🟩🟩🟩');
  assert(!text.includes('APPLE'));
  assert(makeShareText(game, true).endsWith('🟧🟧🟧🟧🟧'));
  assert(makeShareText(game, false, true).includes('⬛⬛🟨⬛🟩'));
});
