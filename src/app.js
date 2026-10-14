import {
  WORD_LENGTH, MAX_GUESSES, scoreGuess, getKeyboardStates, getHardModeError,
  chooseAnswer, getGameStatus, emptyStats, recordResult, makeShareText,
} from './game.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'wordle-unlimited-v1';
const board = $('#board');
const keyboard = $('#keyboard');
const modal = $('#modal');
const content = $('#modal-content');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let answers = [];
let accepted = new Set();
let game;
let stats = emptyStats();
let preferences = { dark: false, highContrast: false, hardMode: false };
let ready = false;
let locked = false;
let toastTimer;
let resultTimer;
let lastFocus;
const rows = [];
const keys = new Map();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, stats, preferences })); }
  catch { /* The game also works when storage is unavailable. */ }
}

function validStats(value) {
  return value && ['played', 'wins', 'streak', 'maxStreak'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    && value.wins <= value.played && value.streak <= value.maxStreak && value.maxStreak <= value.wins
    && Array.isArray(value.distribution) && value.distribution.length === 6
    && value.distribution.every(count => Number.isSafeInteger(count) && count >= 0)
    && value.distribution.reduce((sum, count) => sum + count, 0) === value.wins
    && Array.isArray(value.recordedIds) && value.recordedIds.every(id => typeof id === 'string');
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    for (const key of Object.keys(preferences)) {
      if (typeof saved.preferences?.[key] === 'boolean') preferences[key] = saved.preferences[key];
    }
    if (validStats(saved.stats)) stats = saved.stats;
    const candidate = saved.game;
    if (candidate && typeof candidate.id === 'string' && answers.includes(candidate.answer)
      && Array.isArray(candidate.guesses) && candidate.guesses.length <= MAX_GUESSES
      && candidate.guesses.every(guess => accepted.has(guess))
      && !candidate.guesses.slice(0, -1).includes(candidate.answer)
      && typeof candidate.input === 'string' && /^[A-Z]{0,5}$/.test(candidate.input)
      && typeof candidate.hardMode === 'boolean') {
      game = candidate;
      stats = recordResult(stats, game);
    }
  } catch { /* Ignore stale or damaged browser data. */ }
}

function applyPreferences() {
  document.documentElement.dataset.theme = preferences.dark ? 'dark' : 'light';
  document.documentElement.dataset.contrast = String(preferences.highContrast);
  $('meta[name="theme-color"]').content = preferences.dark ? '#121213' : '#ffffff';
}

function buildBoard() {
  for (let rowIndex = 0; rowIndex < MAX_GUESSES; rowIndex++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'group');
    const tiles = [];
    for (let column = 0; column < WORD_LENGTH; column++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('aria-hidden', 'true');
      row.append(tile);
      tiles.push(tile);
    }
    row.setAttribute('aria-label', `Guess ${rowIndex + 1}: empty`);
    board.append(row);
    rows.push({ row, tiles });
  }
}

function buildKeyboard() {
  for (const letters of ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']) {
    const row = document.createElement('div');
    row.className = 'keyboard-row';
    const spacer = () => {
      const span = document.createElement('span');
      span.className = 'keyboard-spacer';
      span.setAttribute('aria-hidden', 'true');
      row.append(span);
    };
    if (letters === 'ASDFGHJKL') spacer();
    const addKey = (letter, wide = false) => {
      const button = document.createElement('button');
      button.className = `key${wide ? ' wide' : ''}`;
      button.dataset.key = letter;
      button.setAttribute('aria-label', letter === 'BACKSPACE' ? 'Delete' : letter === 'ENTER' ? 'Enter' : letter);
      if (letter === 'BACKSPACE') button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h12v14H9l-7-7zM12 9l6 6M18 9l-6 6"/></svg>';
      else button.textContent = letter;
      button.addEventListener('click', () => handleInput(letter));
      row.append(button);
      keys.set(letter, button);
    };
    if (letters === 'ZXCVBNM') addKey('ENTER', true);
    for (const letter of letters) addKey(letter);
    if (letters === 'ZXCVBNM') addKey('BACKSPACE', true);
    if (letters === 'ASDFGHJKL') spacer();
    keyboard.append(row);
  }
}

function renderBoard() {
  rows.forEach(({ row, tiles }, index) => {
    row.className = 'row';
    const guess = game.guesses[index];
    const word = guess || (index === game.guesses.length ? game.input : '');
    const score = guess ? scoreGuess(guess, game.answer) : [];
    tiles.forEach((tile, column) => {
      tile.textContent = word[column] || '';
      tile.className = `tile${word[column] ? ' filled' : ''}${score[column] ? ` ${score[column]}` : ''}`;
      tile.style.removeProperty('--delay');
    });
    row.setAttribute('aria-label', guess
      ? `Guess ${index + 1}: ${[...guess].map((letter, column) => `${letter} ${describe(score[column])}`).join(', ')}`
      : `Guess ${index + 1}: ${word || 'empty'}`);
  });
  $('#play-again-button').hidden = getGameStatus(game.guesses, game.answer) === 'playing';
}

function describe(state) {
  return { correct: 'correct position', present: 'wrong position', absent: 'not in the word' }[state];
}

function renderKeyboard() {
  const states = getKeyboardStates(game.guesses, game.answer);
  for (const [letter, button] of keys) {
    button.classList.remove('correct', 'present', 'absent');
    if (states[letter]) button.classList.add(states[letter]);
    const label = letter === 'BACKSPACE' ? 'Delete' : letter === 'ENTER' ? 'Enter' : letter;
    button.setAttribute('aria-label', `${label}${states[letter] ? `, ${describe(states[letter])}` : ''}`);
  }
}

function announce(message) { $('#announcer').textContent = message; }

function toast(message, duration = 1900) {
  clearTimeout(toastTimer);
  (modal.open ? modal : document.body).append($('#toast'));
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  if (duration) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, duration);
}

function newGame() {
  if (locked) return;
  if (!ready) { boot(); return; }
  clearTimeout(resultTimer);
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
  closeModal();
  game = {
    id: crypto.randomUUID(), answer: chooseAnswer(answers, game?.answer), guesses: [], input: '', hardMode: preferences.hardMode,
  };
  persist();
  renderBoard();
  renderKeyboard();
  board.focus({ preventScroll: true });
  announce('New puzzle. Guess a five-letter word in six tries.');
}

function rejectGuess(message) {
  toast(message);
  const row = rows[game.guesses.length].row;
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
}

async function submitGuess() {
  if (game.input.length !== WORD_LENGTH) { rejectGuess('Not enough letters'); return; }
  if (!accepted.has(game.input)) { rejectGuess('Not in word list'); return; }
  if (game.hardMode) {
    const error = getHardModeError(game.input, game.guesses, game.answer);
    if (error) { rejectGuess(error); return; }
  }
  locked = true;
  const guess = game.input;
  const index = game.guesses.length;
  const score = scoreGuess(guess, game.answer);
  game.guesses.push(guess);
  game.input = '';
  persist();
  rows[index].tiles.forEach((tile, column) => {
    tile.style.setProperty('--delay', `${column * 250}ms`);
    tile.className = `tile filled ${score[column]} reveal`;
  });
  await new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 20 : 1520));
  renderBoard();
  renderKeyboard();
  announce(`Guess ${index + 1}: ${[...guess].map((letter, column) => `${letter}, ${describe(score[column])}`).join('; ')}.`);
  const status = getGameStatus(game.guesses, game.answer);
  if (status !== 'playing') {
    stats = recordResult(stats, game);
    persist();
    if (status === 'won') {
      const praise = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
      toast(praise[index], 2200);
      rows[index].tiles.forEach((tile, column) => {
        tile.style.setProperty('--delay', `${column * 90}ms`);
        tile.classList.add('bounce');
      });
      announce(`Solved in ${index + 1} ${index === 0 ? 'guess' : 'guesses'}. The word was ${game.answer}.`);
    } else {
      toast(game.answer, 2800);
      announce(`The word was ${game.answer}. Better luck next time.`);
    }
    resultTimer = setTimeout(() => {
      if (!modal.open) openStats();
    }, reducedMotion.matches ? 300 : 1800);
  }
  locked = false;
}

function handleInput(key) {
  if (!ready || locked || modal.open || getGameStatus(game.guesses, game.answer) !== 'playing') return;
  if (key === 'ENTER') { submitGuess(); return; }
  if (key === 'BACKSPACE') game.input = game.input.slice(0, -1);
  else if (/^[A-Z]$/.test(key) && game.input.length < WORD_LENGTH) game.input += key;
  else return;
  renderBoard();
  if (key !== 'BACKSPACE') rows[game.guesses.length].tiles[game.input.length - 1].classList.add('pop');
  persist();
}

function openModal(html) {
  clearTimeout(resultTimer);
  lastFocus = document.activeElement;
  content.innerHTML = html;
  if (!modal.open) modal.showModal();
}

function closeModal() {
  if (modal.open) modal.close();
}

function example(word, index, state) {
  return `<div class="example" aria-label="${word}, ${word[index]} ${describe(state)}">`
    + [...word].map((letter, column) => `<span class="tile filled${column === index ? ` ${state}` : ''}" aria-hidden="true">${letter}</span>`).join('') + '</div>';
}

function openHelp() {
  openModal(`<h2 id="modal-title" class="help-title">How to play</h2>
    <p class="help-intro">Guess the word in 6 tries.</p>
    <ul class="help-list"><li>Each guess must be a valid 5-letter word.</li><li>The tile colors show how close you are.</li></ul>
    <div class="examples"><h3>Examples</h3>
    ${example('WEARY', 0, 'correct')}<p><strong>W</strong> is in the word and in the correct spot.</p>
    ${example('PILLS', 1, 'present')}<p><strong>I</strong> is in the word but in the wrong spot.</p>
    ${example('VAGUE', 3, 'absent')}<p><strong>U</strong> is not in the word.</p></div>
    <p class="help-footer">A random word every game. Play as often as you like.</p>`);
}

function openSettings() {
  openModal(`<h2 id="modal-title" class="settings-title">SETTINGS</h2>
    ${setting('hardMode', 'Hard mode', 'Any revealed hints must be used in subsequent guesses.')}
    ${setting('dark', 'Dark theme', '')}
    ${setting('highContrast', 'High contrast', 'Alternative colors for better visibility.')}`);
  for (const button of content.querySelectorAll('[data-setting]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.setting;
      const playing = game && getGameStatus(game.guesses, game.answer) === 'playing';
      if (key === 'hardMode' && !preferences.hardMode && playing && game.guesses.length) {
        toast('Hard mode can only be enabled at the start');
        return;
      }
      preferences[key] = !preferences[key];
      if (key === 'hardMode' && playing) game.hardMode = preferences.hardMode;
      button.setAttribute('aria-checked', String(preferences[key]));
      applyPreferences();
      persist();
    });
  }
}

function setting(key, label, description) {
  return `<div class="setting"><div><div class="setting-label" id="label-${key}">${label}</div>
    ${description ? `<p class="setting-description" id="description-${key}">${description}</p>` : ''}</div>
    <button class="switch" role="switch" aria-labelledby="label-${key}" ${description ? `aria-describedby="description-${key}"` : ''}
    aria-checked="${preferences[key]}" data-setting="${key}"></button></div>`;
}

function openStats() {
  if (!ready) return;
  const status = getGameStatus(game.guesses, game.answer);
  const finished = status !== 'playing';
  const maximum = Math.max(1, ...stats.distribution);
  openModal(`${finished ? `<p class="result-heading">${status === 'won' ? 'Nicely done.' : 'Next time.'}</p>
    <p class="result-answer">The word was <strong>${game.answer}</strong></p>` : ''}
    <h2 id="modal-title" class="stats-title">STATISTICS</h2>
    <div class="stats-grid">${[
      [stats.played, 'Played'], [stats.played ? Math.round(stats.wins / stats.played * 100) : 0, 'Win %'],
      [stats.streak, 'Current streak'], [stats.maxStreak, 'Max streak'],
    ].map(([value, label]) => `<div><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`).join('')}</div>
    <h3 class="distribution-title">Guess distribution</h3>
    <div>${stats.distribution.map((count, index) => `<div class="distribution-row" aria-label="${index + 1} guesses: ${count} wins">
      <span class="distribution-number">${index + 1}</span><div class="distribution-bar${status === 'won' && game.guesses.length === index + 1 ? ' latest' : ''}"
      style="width: ${Math.max(7, count / maximum * 92)}%">${count}</div></div>`).join('')}</div>
    ${finished ? '<div class="modal-actions"><button class="action-button" id="share-button">Share</button><button class="action-button primary" id="next-button">Play again</button></div><div id="share-fallback" class="share-fallback" hidden></div>' : ''}`);
  if (finished) {
    $('#next-button').addEventListener('click', newGame);
    $('#share-button').addEventListener('click', share);
  }
}

async function share() {
  const text = makeShareText(game, preferences.highContrast, preferences.dark);
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    const fallback = $('#share-fallback');
    fallback.hidden = false;
    fallback.innerHTML = '<label for="share-text">Copy your result</label><textarea id="share-text" readonly></textarea>';
    $('#share-text').value = text;
    $('#share-text').focus();
    $('#share-text').select();
  }
}

async function boot() {
  if (locked) return;
  locked = true;
  try {
    const [answerText, guessText] = await Promise.all(['answers', 'guesses'].map(async name => {
      const response = await fetch(`/public/data/${name}.txt`);
      if (!response.ok) throw new Error('Dictionary unavailable');
      return response.text();
    }));
    answers = answerText.trim().toUpperCase().split(/\s+/);
    accepted = new Set(guessText.trim().toUpperCase().split(/\s+/));
    if (!answers.length || !answers.every(word => /^[A-Z]{5}$/.test(word) && accepted.has(word))) throw new Error('Invalid dictionary');
    restore();
    ready = true;
    locked = false;
    applyPreferences();
    if (!game) newGame();
    else {
      renderBoard();
      renderKeyboard();
      persist();
    }
  } catch {
    locked = false;
    toast('Could not load words. Tap ↻ to retry.', 0);
  }
}

buildBoard();
buildKeyboard();
$('#help-button').addEventListener('click', openHelp);
$('#new-game-button').addEventListener('click', newGame);
$('#play-again-button').addEventListener('click', newGame);
$('#stats-button').addEventListener('click', openStats);
$('#settings-button').addEventListener('click', openSettings);
$('#close-modal').addEventListener('click', closeModal);
modal.addEventListener('close', () => {
  document.body.append($('#toast'));
  lastFocus?.focus();
});
modal.addEventListener('click', event => {
  const bounds = modal.getBoundingClientRect();
  if (event.target === modal && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeModal();
});
document.addEventListener('keydown', event => {
  if (modal.open || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
  const key = event.key.toUpperCase();
  if (/^[A-Z]$/.test(key) || ['ENTER', 'BACKSPACE'].includes(key)) {
    // Header buttons keep their normal keyboard activation.
    if (key === 'ENTER' && event.target.closest('.header, .game-footer')) return;
    event.preventDefault();
    if (/^[A-Z]$/.test(key)) board.focus({ preventScroll: true });
    handleInput(key);
  }
});
boot();
