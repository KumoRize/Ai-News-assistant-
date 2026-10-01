// Deterministic "of the day" picks. Shared by the browser app and the push script,
// so the notification and the app always agree on today's keyword.
import { KEYWORDS, LESSONS, CHALLENGES, QUIZ, LEVELS } from './content.js';

// YYYY-MM-DD in the given IANA time zone (defaults to the runtime's local zone).
export function dayKey(date = new Date(), timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// FNV-1a 32-bit hash → seeded PRNG (mulberry32).
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededShuffle(arr, seed) {
  const r = rng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dailyKeywords(key, n = 5) {
  return seededShuffle(KEYWORDS, `kw:${key}`).slice(0, n);
}

export function dailyChallenge(key) {
  return seededShuffle(CHALLENGES, `ch:${key}`)[0];
}

export function dailyQuiz(key, n = 3) {
  return seededShuffle(QUIZ, `qz:${key}`).slice(0, n);
}

// Lesson of the day: the next unfinished lesson at or near the user's level,
// otherwise a seeded pick, so there is always something to read.
export function dailyLesson(key, level = 'Beginner', done = []) {
  const li = Math.max(0, LEVELS.indexOf(level));
  const near = LESSONS.filter((l) => Math.abs(LEVELS.indexOf(l.level) - li) <= 1 && !done.includes(l.id));
  const pool = near.length ? near : LESSONS.filter((l) => !done.includes(l.id));
  return seededShuffle(pool.length ? pool : LESSONS, `ls:${key}`)[0];
}
