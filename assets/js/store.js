// On-device profile & progress storage (localStorage, private to this browser).
import { dayKey } from './daily.js';

const KEY = 'promptpulse:v1';

const DEFAULTS = () => ({
  profile: null, // { name, avatar, level, interests[], goal, createdAt }
  xp: 0,
  streak: { count: 0, best: 0, last: null },
  lessonsDone: [],
  keywordsLearned: [],
  quiz: {}, // dayKey -> { answers: [], score }
  challenges: {}, // dayKey -> true
  saved: [], // { id, title, text, createdAt }
  bookmarks: [], // news items
  readNews: [],
  newsReadToday: { day: null, count: 0 },
  badges: [],
  daily: { day: null, lessonId: null },
  lastNewsSeen: null,
  settings: { sound: true, animations: true, notifyHour: 8, localDaily: false },
  push: { enabled: false, code: null },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const d = DEFAULTS();
    return { ...d, ...parsed, settings: { ...d.settings, ...parsed.settings }, streak: { ...d.streak, ...parsed.streak } };
  } catch {
    return DEFAULTS();
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    persist();
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset() { state = DEFAULTS(); persist(); },
  export: () => JSON.stringify({ app: 'PromptPulse', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2),
  import(json) {
    const obj = JSON.parse(json);
    const data = obj.data || obj;
    if (typeof data !== 'object' || !('xp' in data)) throw new Error('Not a PromptPulse backup file');
    const d = DEFAULTS();
    state = { ...d, ...data, settings: { ...d.settings, ...data.settings } };
    persist();
  },
};

// ---------- XP & levels ----------
export const TITLES = ['Prompt Rookie', 'Prompt Apprentice', 'Prompt Crafter', 'Prompt Engineer', 'Prompt Architect', 'Prompt Strategist', 'Prompt Wizard', 'Prompt Legend'];

// Level n starts at 50·n·(n−1) XP: 0, 100, 300, 600, 1000, …
export function levelFor(xp) {
  const lvl = Math.floor((1 + Math.sqrt(1 + (8 * xp) / 100)) / 2);
  const start = 50 * lvl * (lvl - 1);
  const next = 50 * (lvl + 1) * lvl;
  return { level: lvl, title: TITLES[Math.min(lvl - 1, TITLES.length - 1)], start, next, progress: (xp - start) / (next - start) };
}

// Returns { gained, leveledUp, level }.
export function addXP(amount) {
  const before = levelFor(state.xp).level;
  store.set({ xp: state.xp + amount });
  const after = levelFor(state.xp);
  return { gained: amount, leveledUp: after.level > before, level: after };
}

// ---------- Streak ----------
// Call once per app open; returns true when the streak grew today.
export function touchStreak() {
  const today = dayKey();
  const s = state.streak;
  if (s.last === today) return false;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const count = s.last === dayKey(y) ? s.count + 1 : 1;
  store.set({ streak: { count, best: Math.max(s.best, count), last: today } });
  return true;
}

// ---------- Badges ----------
export const BADGES = [
  { id: 'welcome', icon: '🚀', name: 'Lift-off', desc: 'Created your profile', test: (s) => !!s.profile },
  { id: 'lesson1', icon: '📘', name: 'First Lesson', desc: 'Completed a lesson', test: (s) => s.lessonsDone.length >= 1 },
  { id: 'lesson10', icon: '🎓', name: 'Scholar', desc: '10 lessons completed', test: (s) => s.lessonsDone.length >= 10 },
  { id: 'lessonall', icon: '🏆', name: 'Grandmaster', desc: 'All 30 lessons', test: (s) => s.lessonsDone.length >= 30 },
  { id: 'streak3', icon: '🔥', name: 'On Fire', desc: '3-day streak', test: (s) => s.streak.best >= 3 },
  { id: 'streak7', icon: '⚡', name: 'Unstoppable', desc: '7-day streak', test: (s) => s.streak.best >= 7 },
  { id: 'streak30', icon: '💎', name: 'Diamond Habit', desc: '30-day streak', test: (s) => s.streak.best >= 30 },
  { id: 'quizace', icon: '🧠', name: 'Quiz Ace', desc: 'Perfect daily quiz', test: (s) => Object.values(s.quiz).some((q) => q.score === q.total && q.total > 0) },
  { id: 'kw25', icon: '🔑', name: 'Word Smith', desc: 'Learned 25 keywords', test: (s) => s.keywordsLearned.length >= 25 },
  { id: 'saver', icon: '💾', name: 'Collector', desc: 'Saved 5 prompts', test: (s) => s.saved.length >= 5 },
  { id: 'reader', icon: '📰', name: 'News Hound', desc: 'Read 25 AI stories', test: (s) => s.readNews.length >= 25 },
  { id: 'challenger', icon: '🎯', name: 'Challenger', desc: '5 daily challenges', test: (s) => Object.keys(s.challenges).length >= 5 },
  { id: 'notify', icon: '🔔', name: 'Always Informed', desc: 'Turned on notifications', test: (s) => s.push.enabled },
];

// Returns newly unlocked badges.
export function checkBadges() {
  const fresh = BADGES.filter((b) => !state.badges.includes(b.id) && b.test(state));
  if (fresh.length) store.set({ badges: [...state.badges, ...fresh.map((b) => b.id)] });
  return fresh;
}
