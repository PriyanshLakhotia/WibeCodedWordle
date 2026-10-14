import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const answers = (await readFile(new URL('public/data/answers.txt', root), 'utf8')).trim().split(/\s+/);
const guesses = (await readFile(new URL('public/data/guesses.txt', root), 'utf8')).trim().split(/\s+/);
for (const [name, words] of [['answers', answers], ['guesses', guesses]]) {
  assert(words.every(word => /^[a-z]{5}$/.test(word)), `${name} contains an invalid word`);
  assert.equal(new Set(words).size, words.length, `${name} contains duplicate words`);
}
assert.equal(answers.length, 2315);
assert(guesses.length > 14000);
const accepted = new Set(guesses);
assert(answers.every(word => accepted.has(word)), 'Every answer must be an accepted guess');
for (const file of ['src/app.js', 'src/game.js', 'server.mjs']) {
  execFileSync(process.execPath, ['--check', new URL(file, root).pathname]);
}
console.log(`Verified ${answers.length.toLocaleString()} answers and ${guesses.length.toLocaleString()} accepted guesses. JavaScript syntax checks passed.`);
