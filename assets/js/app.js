import { CONFIG } from './config.js';
import { LESSONS, LEVELS, KEYWORDS, KEYWORD_CATEGORIES, TEMPLATES, INTERESTS, AVATARS } from './content.js';
import { analyze, enhance, TYPES, TONES, LENGTHS, FORMATS } from './promptcheck.js';
import { dayKey, dailyKeywords, dailyChallenge, dailyQuiz, dailyLesson } from './daily.js';
import { store, addXP, levelFor, touchStreak, checkBadges, BADGES } from './store.js';
import { play, setSoundEnabled } from './sound.js';

// ============================================================================
// Helpers
// ============================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const S = () => store.get();
const today = () => dayKey();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

function timeAgo(iso) {
  const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Long texts (prompts) are kept in memory and referenced by key from buttons.
const TEXTS = new Map();
let textSeq = 0;
const keep = (text) => { const k = `t${++textSeq}`; TEXTS.set(k, text); return k; };

const fmtHour = (h) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ============================================================================
// Feedback: toasts, XP floats, confetti, ripples, modals
// ============================================================================
function toast(msg, type = 'info', icon) {
  const ico = icon || { info: '💡', success: '✅', error: '⚠️', news: '🔥', badge: '🏅' }[type] || '💡';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-ico">${ico}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3200);
}

function xpFloat(amount, anchor) {
  const r = anchor?.getBoundingClientRect?.();
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = `+${amount} XP`;
  el.style.left = `${r ? r.left + r.width / 2 : window.innerWidth / 2}px`;
  el.style.top = `${r ? r.top : window.innerHeight / 2}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function confetti(count = 140) {
  if (!S().settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#7C3AED', '#A855F7', '#22D3EE', '#F472B6', '#FBBF24', '#34D399'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    s: Math.random() * 7 + 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (++frame < 160) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height);
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  btn.appendChild(span);
  setTimeout(() => span.remove(), 600);
});

let activeModal = null;
function openModal(inner, { onClose, dismissible = true } = {}) {
  closeModal(true);
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="grabber"></div>${dismissible ? '<button class="icon-btn close-x" data-action="close-modal" aria-label="Close">✕</button>' : ''}<div class="modal-body">${inner}</div></div>`;
  if (dismissible) bd.addEventListener('click', (e) => { if (e.target === bd) closeModal(); });
  document.body.appendChild(bd);
  activeModal = { bd, onClose, dismissible };
  play('pop');
  return bd.querySelector('.modal');
}
function closeModal(silent = false) {
  if (!activeModal) return;
  const { bd, onClose } = activeModal;
  activeModal = null;
  if (!silent) play('close');
  bd.classList.add('closing');
  bd.querySelector('.modal').classList.add('closing');
  setTimeout(() => bd.remove(), 240);
  onClose?.();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && activeModal?.dismissible) closeModal(); });

// Award XP with all the bells and whistles.
function reward(amount, anchor, reason) {
  const res = addXP(amount);
  xpFloat(amount, anchor);
  play('success');
  if (reason) toast(`${reason} (+${amount} XP)`, 'success');
  updateTopbar();
  if (res.leveledUp) setTimeout(() => showLevelUp(res.level), 700);
  setTimeout(announceBadges, res.leveledUp ? 2600 : 900);
}

function announceBadges() {
  const fresh = checkBadges();
  fresh.forEach((b, i) => setTimeout(() => { play('levelup'); toast(`Badge unlocked: ${b.icon} ${b.name}`, 'badge', '🏅'); confetti(80); }, i * 1200));
}

function showLevelUp(lv) {
  play('levelup');
  confetti(220);
  openModal(`
    <div class="levelup">
      <div class="badge-big">🏆</div>
      <h2 style="padding:0;margin-top:8px">Level ${lv.level}!</h2>
      <p class="muted">You are now a <b style="color:var(--text)">${esc(lv.title)}</b>. Keep the pulse going.</p>
      <button class="btn primary block" style="margin-top:18px" data-action="close-modal">Let's go 🚀</button>
    </div>`);
}

async function copyText(text, anchor) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  play('copy');
  toast('Copied to clipboard', 'success', '📋');
  if (anchor) { anchor.classList.add('copied'); setTimeout(() => anchor.classList.remove('copied'), 800); }
}

const promptActions = (text, { save = true, title = 'Prompt' } = {}) => {
  const k = keep(text);
  return `<div class="row wrap" style="margin-top:12px">
    <button class="btn primary sm" data-action="copy" data-key="${k}">📋 Copy</button>
    <button class="btn ghost sm" data-action="open-ai" data-ai="claude" data-key="${k}">✳️ Open in Claude</button>
    <button class="btn ghost sm" data-action="open-ai" data-ai="chatgpt" data-key="${k}">💬 ChatGPT</button>
    ${save ? `<button class="btn ghost sm" data-action="save-prompt" data-key="${k}" data-title="${esc(title)}">💾 Save</button>` : ''}
  </div>`;
};

// ============================================================================
// News
// ============================================================================
const NEWS_CATS = ['All', 'LLMs', 'Agents', 'Image & Video', 'Coding', 'Research', 'Business', 'Policy', 'Chips', 'Saved'];
const news = { items: [], generatedAt: null, loaded: false, loading: false, liveLoaded: false, cat: 'All', q: '', limit: 30, prevSeen: null };

async function loadNews() {
  if (news.loading) return;
  news.loading = true;
  try {
    const res = await fetch(`${CONFIG.NEWS_URL}?t=${Math.floor(Date.now() / 600000)}`);
    if (res.ok) {
      const data = await res.json();
      news.items = data.items || [];
      news.generatedAt = data.generatedAt;
    }
  } catch { /* offline: SW may still have served a cached copy */ }
  news.loaded = true;
  news.loading = false;
  if (!news.items.length || Date.now() - Date.parse(news.generatedAt || 0) > 6 * 3600e3) await loadLiveNews();
}

// Live top-up from Hacker News (CORS-enabled) so news is fresh even before the first workflow run.
async function loadLiveNews() {
  try {
    const since = Math.floor(Date.now() / 1000) - 2 * 86400;
    const urls = CONFIG.LIVE_QUERIES.slice(0, 4).map((q) => `${CONFIG.LIVE_NEWS_URL}?tags=story&hitsPerPage=30&numericFilters=points%3E15,created_at_i%3E${since}&query=${encodeURIComponent(q)}`);
    const all = await Promise.allSettled(urls.map((u) => fetch(u).then((r) => r.json())));
    const hits = all.flatMap((r) => (r.status === 'fulfilled' ? r.value.hits || [] : []));
    const ai = /\b(ai|llm|gpt|claude|gemini|openai|anthropic|deepmind|model|agent|nvidia|copilot|mistral|llama|neural|chatbot|machine learning)\b/i;
    const have = new Set(news.items.map((i) => i.url));
    const fresh = hits
      .filter((h) => h.title && ai.test(h.title))
      .map((h) => ({
        id: `hn${h.objectID}`,
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'Hacker News',
        published: h.created_at,
        summary: `${h.points} points · ${h.num_comments ?? 0} comments on Hacker News`,
        image: null,
        tags: tagStory(h.title),
        discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      }))
      .filter((i) => !have.has(i.url) && have.add(i.url));
    news.items = [...news.items, ...fresh].sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
    news.liveLoaded = true;
  } catch { /* offline */ }
}

const TAG_RULES = {
  'LLMs': /\b(llm|gpt|claude|gemini|llama|mistral|chatgpt|language model|deepseek|qwen|grok)\b/i,
  'Agents': /\b(agents?|agentic|mcp|autonomous)\b/i,
  'Image & Video': /\b(image|video|sora|midjourney|diffusion|veo|voice|audio|music)\b/i,
  'Coding': /\b(code|coding|developer|programming|github|cursor)\b/i,
  'Research': /\b(research|paper|study|benchmark|arxiv|open[- ]source)\b/i,
  'Business': /\b(funding|raises|valuation|acquire|startup|revenue|billion|ipo)\b/i,
  'Policy': /\b(law|regulat|policy|government|lawsuit|copyright|safety|ban)\b/i,
  'Chips': /\b(nvidia|gpu|chip|tpu|data ?center|amd|tsmc)\b/i,
};
function tagStory(t) {
  const tags = Object.entries(TAG_RULES).filter(([, re]) => re.test(t)).map(([k]) => k);
  return tags.length ? tags.slice(0, 2) : ['General'];
}

function filteredNews() {
  const s = S();
  let list = news.cat === 'Saved' ? s.bookmarks : news.items;
  if (news.cat !== 'All' && news.cat !== 'Saved') list = list.filter((i) => i.tags?.includes(news.cat));
  if (news.q) {
    const q = news.q.toLowerCase();
    list = list.filter((i) => `${i.title} ${i.summary} ${i.source}`.toLowerCase().includes(q));
  }
  return list;
}

const findStory = (id) => news.items.find((i) => i.id === id) || S().bookmarks.find((i) => i.id === id);

function newsCard(item) {
  const s = S();
  const read = s.readNews.includes(item.id);
  const saved = s.bookmarks.some((b) => b.id === item.id);
  const isNew = news.prevSeen && Date.parse(item.published) > Date.parse(news.prevSeen);
  const tagColors = ['', 'cyan', 'pink'];
  return `<article class="card news-card ${read ? 'read' : ''}">
    ${item.image ? `<img class="thumb" src="${esc(safeUrl(item.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="meta">${isNew ? '<span class="new-badge">NEW</span>' : ''}<span class="src">${esc(item.source)}</span><span>·</span><span>${timeAgo(item.published)}</span>
      ${(item.tags || []).map((t, i) => `<span class="tag ${tagColors[i] || ''}">${esc(t)}</span>`).join('')}</div>
    <h3><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener" data-action="read-news" data-id="${esc(item.id)}" style="color:inherit">${esc(item.title)}</a></h3>
    ${item.summary ? `<p class="sum">${esc(item.summary)}</p>` : ''}
    <div class="actions">
      <a class="btn primary sm" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener" data-action="read-news" data-id="${esc(item.id)}">Read ↗</a>
      <button class="btn ghost sm" data-action="prompt-news" data-id="${esc(item.id)}">✨ Explain with AI</button>
      <button class="icon-btn ${saved ? 'on' : ''}" data-action="bookmark" data-id="${esc(item.id)}" aria-label="Save story">${saved ? '💖' : '🤍'}</button>
      <button class="icon-btn" data-action="share-news" data-id="${esc(item.id)}" aria-label="Share">📤</button>
      ${item.discussion ? `<a class="icon-btn" href="${esc(safeUrl(item.discussion))}" target="_blank" rel="noopener" aria-label="Discussion">💬</a>` : ''}
    </div>
  </article>`;
}

function newsSkeleton(n = 3) {
  return Array.from({ length: n }, () => `<div class="card"><div class="skeleton" style="height:140px"></div><div class="skeleton" style="height:18px;margin-top:12px;width:85%"></div><div class="skeleton" style="height:14px;margin-top:8px;width:60%"></div></div>`).join('');
}

// ============================================================================
// Daily content
// ============================================================================
function todaysLesson() {
  const s = S();
  const key = today();
  if (s.daily.day !== key || !LESSONS.find((l) => l.id === s.daily.lessonId)) {
    const l = dailyLesson(key, s.profile?.level, s.lessonsDone);
    store.set({ daily: { day: key, lessonId: l.id } });
    return l;
  }
  return LESSONS.find((l) => l.id === s.daily.lessonId);
}

// ============================================================================
// Views
// ============================================================================
const views = {
  home() {
    const s = S();
    const lv = levelFor(s.xp);
    const kws = dailyKeywords(today());
    const kw = kws[0];
    const lesson = todaysLesson();
    const ch = dailyChallenge(today());
    const chDone = !!s.challenges[today()];
    const quiz = s.quiz[today()];
    const top = news.items.slice(0, 4);
    const levelColor = { Beginner: 'green', Intermediate: 'cyan', Advanced: '', Expert: 'pink' };
    return `<div class="view stagger">
      <section class="hero">
        <div class="hello">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <h1>${greeting()}, ${esc(s.profile?.name || 'friend')} <span class="wave">👋</span></h1>
        <p class="muted small">Here's your AI briefing. ${s.streak.count > 1 ? `You're on a <b style="color:var(--amber)">${s.streak.count}-day streak</b>, keep it alive!` : 'Start a streak by learning something today.'}</p>
        <div class="hero-stats">
          <div class="ring" style="--p:${Math.round(lv.progress * 100)}"><div><b>${lv.level}</b><span>Level</span></div></div>
          <div class="stat-list">
            <div class="stat"><b>${s.streak.count}🔥</b><span>Streak</span></div>
            <div class="stat"><b>${s.xp}</b><span>XP</span></div>
            <div class="stat"><b>${s.lessonsDone.length}</b><span>Lessons</span></div>
          </div>
        </div>
      </section>

      <div class="section-title"><h2>🔑 Keyword of the day</h2><a class="link" href="#/learn/keywords">All keywords →</a></div>
      <div class="card kw-hero tap" data-action="kw-detail" data-kw="${esc(kw.kw)}">
        <div class="shine"></div>
        <div class="card-kicker">${esc(kw.cat)}</div>
        <div class="kw-word">“${esc(kw.kw)}”</div>
        <p>${esc(kw.meaning)}</p>
        <div class="example">${esc(kw.example)}</div>
      </div>

      <div class="section-title"><h2>📰 Top AI stories</h2><a class="link" href="#/news">See all →</a></div>
      <div class="card">
        ${top.length ? top.map((n, i) => `
          <a class="mini-news" href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener" data-action="read-news" data-id="${esc(n.id)}" style="color:inherit">
            <span class="num">${i + 1}</span>
            <div class="grow"><h4>${esc(n.title)}</h4><div class="faint small">${esc(n.source)} · ${timeAgo(n.published)}</div></div>
          </a>`).join('') : news.loaded ? '<div class="empty" style="padding:20px"><span class="e-ico">📡</span>No stories yet. Pull fresh news from the News tab.</div>' : '<div class="skeleton" style="height:120px"></div>'}
      </div>

      <div class="section-title"><h2>🎓 Today's lesson</h2><a class="link" href="#/learn/path">Learning path →</a></div>
      <div class="card glow tap" data-action="open-lesson" data-id="${lesson.id}">
        <div class="card-kicker">${esc(lesson.tag)} <span class="tag ${levelColor[lesson.level]}">${esc(lesson.level)}</span>${s.lessonsDone.includes(lesson.id) ? '<span class="tag green">✓ Done</span>' : ''}</div>
        <h3>${esc(lesson.title)}</h3>
        <p class="muted small">${esc(lesson.summary)}</p>
        <div class="row" style="margin-top:12px"><span class="btn primary sm">Start lesson · +25 XP</span><span class="faint small">~3 min</span></div>
      </div>

      <div class="grid-2" style="margin-top:12px">
        <div class="card tap" data-action="goto" data-route="learn/challenge">
          <div class="card-kicker">🎯 Challenge</div>
          <h3 style="font-size:15px">${esc(ch.title)}</h3>
          <p class="faint small">${chDone ? '✅ Completed today' : `+${ch.xp} XP`}</p>
        </div>
        <div class="card tap" data-action="goto" data-route="learn/quiz">
          <div class="card-kicker">🧠 Daily quiz</div>
          <h3 style="font-size:15px">3 quick questions</h3>
          <p class="faint small">${quiz?.done ? `✅ Score ${quiz.score}/${quiz.total}` : '+10 XP per correct answer'}</p>
        </div>
      </div>

      <div class="section-title"><h2>⚡ Today's power words</h2></div>
      <div class="chips">${kws.map((k) => `<button class="chip" data-action="kw-detail" data-kw="${esc(k.kw)}">${esc(k.kw)}</button>`).join('')}</div>

      ${!s.push.enabled ? `
      <div class="card gradient" style="margin-top:18px">
        <div class="row"><span style="font-size:30px">🔔</span><div class="grow"><b>Get your daily AI briefing on your phone</b><div class="muted small">A notification every day at ${fmtHour(s.settings.notifyHour)} with top news and your keyword.</div></div></div>
        <button class="btn primary block" style="margin-top:12px" data-action="goto" data-route="profile/notify">Turn on notifications</button>
      </div>` : ''}
    </div>`;
  },

  news() {
    const list = filteredNews();
    const shown = list.slice(0, news.limit);
    const updated = news.generatedAt ? `Updated ${timeAgo(news.generatedAt)}` : news.liveLoaded ? 'Live from Hacker News' : '';
    return `<div class="view">
      <div class="row" style="margin-bottom:12px"><div class="grow"><h1 style="font-size:24px">AI News</h1><div class="faint small">${esc(updated)} · ${news.items.length} stories</div></div>
        <button class="icon-btn" data-action="refresh-news" aria-label="Refresh news" id="refresh-btn">🔄</button></div>
      <label class="searchbar"><span>🔎</span><input id="news-search" type="search" placeholder="Search stories, companies, models…" value="${esc(news.q)}" autocomplete="off"></label>
      <div class="chips">${NEWS_CATS.map((c) => `<button class="chip ${news.cat === c ? 'active' : ''}" data-action="news-cat" data-cat="${esc(c)}">${c === 'Saved' ? '💖 ' : ''}${esc(c)}</button>`).join('')}</div>
      <div id="news-list" class="stagger">
        ${!news.loaded ? newsSkeleton() : shown.length ? shown.map(newsCard).join('') : `<div class="empty"><span class="e-ico">${news.cat === 'Saved' ? '💖' : '🛰️'}</span>${news.cat === 'Saved' ? 'No saved stories yet. Tap 🤍 on any story.' : 'No stories match. Try another filter or refresh.'}</div>`}
      </div>
      ${list.length > news.limit ? '<button class="btn ghost block" style="margin-top:14px" data-action="more-news">Load more</button>' : ''}
    </div>`;
  },

  learn(sub = 'today') {
    const tabs = [['today', '☀️ Today'], ['path', '🗺️ Path'], ['keywords', '🔑 Keywords'], ['quiz', '🧠 Quiz'], ['challenge', '🎯 Challenge']];
    return `<div class="view">
      <h1 style="font-size:24px;margin-bottom:12px">Learn prompting</h1>
      <div class="chips">${tabs.map(([id, label]) => `<button class="chip ${sub === id ? 'active' : ''}" data-action="goto" data-route="learn/${id}">${label}</button>`).join('')}</div>
      <div class="stagger" style="margin-top:8px">${(learnTabs[sub] || learnTabs.today)()}</div>
    </div>`;
  },

  lab() {
    const s = S();
    return `<div class="view stagger">
      <h1 style="font-size:24px;margin-bottom:4px">Prompt Lab 🧪</h1>
      <p class="muted small" style="margin:0 0 14px">Paste any prompt to see its <b>strength</b> and <b>accuracy</b>, then enhance it to 100% in one tap.</p>
      <div class="card glow">
        <div class="card-kicker">🩺 Prompt Checker</div>
        <div class="field"><label for="lab-input">Your prompt</label>
          <textarea id="lab-input" class="input" placeholder="e.g. write an instagram caption for my bakery">${esc(labState.text)}</textarea></div>
        <div id="lab-score"></div>
        <details class="lab-options" ${labState.optionsOpen ? 'open' : ''}>
          <summary>⚙️ Enhance options <span class="faint small">(optional)</span></summary>
          <div class="grid-2" style="margin-top:12px">
            <div class="field"><label for="lab-type">Type</label><select class="input" id="lab-type">${['Auto', ...TYPES].map((t) => `<option ${labState.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label for="lab-tone">Tone</label><select class="input" id="lab-tone">${TONES.map((t) => `<option ${labState.tone === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label for="lab-length">Length</label><select class="input" id="lab-length">${LENGTHS.map((t) => `<option ${labState.length === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label for="lab-format">Format</label><select class="input" id="lab-format">${FORMATS.map((t) => `<option ${labState.format === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label for="lab-audience">Who is it for?</label><input id="lab-audience" class="input" maxlength="120" placeholder="e.g. busy parents, beginner coders" value="${esc(labState.audience)}"></div>
          <div class="field"><label for="lab-goal">What should it achieve?</label><input id="lab-goal" class="input" maxlength="160" placeholder="e.g. get more customers to visit" value="${esc(labState.goal)}"></div>
        </details>
        <button class="btn primary block" style="margin-top:12px" data-action="enhance">⚡ Enhance to 100%</button>
        <div id="lab-out"></div>
      </div>

      <div class="section-title"><h2>📚 Pro templates</h2></div>
      <div class="grid-2">${TEMPLATES.map((t) => `<div class="card tap" data-action="use-template" data-id="${t.id}"><div style="font-size:26px">${t.icon}</div><h3 style="font-size:15px;margin-top:6px">${esc(t.name)}</h3><p class="faint small">${t.fields.map((f) => `{{${esc(f)}}}`).join(' ')}</p></div>`).join('')}</div>

      <div class="section-title"><h2>💾 Saved prompts</h2><span class="faint small">${s.saved.length}</span></div>
      ${s.saved.length ? s.saved.map((p) => `<div class="card">
        <div class="row"><b class="grow">${esc(p.title)}</b><span class="faint small">${new Date(p.createdAt).toLocaleDateString()}</span><button class="icon-btn" data-action="delete-saved" data-id="${p.id}" aria-label="Delete">🗑️</button></div>
        <div class="code-out" style="margin-top:10px;max-height:140px">${esc(p.text)}</div>
        ${promptActions(p.text, { save: false })}
      </div>`).join('') : '<div class="card empty"><span class="e-ico">💾</span>Your best prompts will live here. Save any prompt with 💾.</div>'}
    </div>`;
  },

  profile(sub) {
    const s = S();
    const p = s.profile || {};
    const lv = levelFor(s.xp);
    const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    const interests = INTERESTS.filter((i) => p.interests?.includes(i.id));
    return `<div class="view stagger">
      <div class="card profile-head">
        <div class="av">${esc(p.avatar || '🙂')}</div>
        <h1 style="font-size:24px">${esc(p.name || 'Guest')}</h1>
        <div class="muted small">${esc(lv.title)} · ${esc(p.level || 'Beginner')} prompter</div>
        <div class="row" style="justify-content:space-between;margin-top:14px;font-size:12px"><b>Level ${lv.level}</b><span class="faint">${s.xp - lv.start} / ${lv.next - lv.start} XP</span></div>
        <div class="xpbar"><i id="xpbar" data-w="${Math.round(lv.progress * 100)}"></i></div>
        ${interests.length ? `<div class="row wrap" style="justify-content:center;margin-top:14px;gap:6px">${interests.map((i) => `<span class="tag cyan">${i.icon} ${esc(i.label)}</span>`).join('')}</div>` : ''}
        <button class="btn ghost sm" style="margin-top:14px" data-action="edit-profile">✏️ Edit profile</button>
      </div>

      <div class="section-title"><h2>📊 Stats</h2></div>
      <div class="stat-list" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><b>${s.streak.count}🔥</b><span>Streak</span></div>
        <div class="stat"><b>${s.streak.best}</b><span>Best streak</span></div>
        <div class="stat"><b>${s.xp}</b><span>Total XP</span></div>
        <div class="stat"><b>${s.lessonsDone.length}/${LESSONS.length}</b><span>Lessons</span></div>
        <div class="stat"><b>${s.keywordsLearned.length}</b><span>Keywords</span></div>
        <div class="stat"><b>${s.readNews.length}</b><span>Stories read</span></div>
      </div>

      <div class="section-title"><h2>🏅 Badges</h2><span class="faint small">${s.badges.length}/${BADGES.length}</span></div>
      <div class="badges">${BADGES.map((b) => `<div class="badge ${s.badges.includes(b.id) ? 'unlocked' : 'locked'}" title="${esc(b.desc)}"><span class="b-ico">${b.icon}</span><b>${esc(b.name)}</b><div class="faint" style="font-size:10.5px">${esc(b.desc)}</div></div>`).join('')}</div>

      <div class="section-title" id="notify"><h2>🔔 Daily notifications</h2></div>
      <div class="card ${sub === 'notify' ? 'glow' : ''}">
        <div class="setting"><div class="grow"><b>Notification time</b><span>Your daily briefing arrives at this local time</span></div>
          <select class="input" id="set-hour" style="width:auto">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${s.settings.notifyHour === h ? 'selected' : ''}>${fmtHour(h)}</option>`).join('')}</select></div>
        <div class="setting"><div class="grow"><b>Status</b><span>${s.push.enabled ? '✅ This device is registered for push.' : pushSupported ? 'Not enabled on this device yet.' : isIOS() && !isStandalone() ? 'On iPhone: first add PromptPulse to your Home Screen (see below).' : 'This browser does not support push.'}</span></div></div>
        <div class="row wrap" style="margin-top:6px">
          <button class="btn primary" data-action="enable-push">${s.push.enabled ? '🔁 Re-register device' : '🔔 Enable notifications'}</button>
          <button class="btn ghost" data-action="test-notify">🧪 Test on this device</button>
          <button class="btn ghost" data-action="gen-keys">🔐 Generate keys</button>
          ${s.push.code ? '<button class="btn ghost" data-action="show-code">🔑 Device code</button>' : ''}
        </div>
      </div>

      <div class="section-title"><h2>📲 Install the app</h2></div>
      <div class="card install-banner">
        <img src="assets/icons/icon-192.png" alt="">
        <div class="grow"><b>${isStandalone() ? 'Installed ✓' : 'Add PromptPulse to your Home Screen'}</b><div class="muted small">${isStandalone() ? 'You are using the app version.' : 'Opens full-screen like a native app and enables notifications.'}</div></div>
        ${isStandalone() ? '' : '<button class="btn primary sm" data-action="install">Install</button>'}
      </div>

      <div class="section-title"><h2>⚙️ Settings</h2></div>
      <div class="card">
        <label class="setting"><div class="grow"><b>Sound effects</b><span>Clicks, chimes and level-up fanfare</span></div><span class="switch"><input type="checkbox" id="set-sound" ${s.settings.sound ? 'checked' : ''}><span></span></span></label>
        <label class="setting"><div class="grow"><b>Animations</b><span>Motion, confetti and transitions</span></div><span class="switch"><input type="checkbox" id="set-anim" ${s.settings.animations ? 'checked' : ''}><span></span></span></label>
        <div class="setting"><div class="grow"><b>Backup</b><span>Your profile lives on this device. Export it to move to another phone.</span></div></div>
        <div class="row wrap">
          <button class="btn ghost sm" data-action="export">⬇️ Export</button>
          <label class="btn ghost sm" style="cursor:pointer">⬆️ Import<input type="file" id="import-file" accept="application/json" hidden></label>
          <button class="btn danger sm" data-action="reset">🗑️ Reset everything</button>
        </div>
      </div>
      <p class="center faint small" style="margin-top:22px">PromptPulse v1.0 · Made with ⚡ for curious minds</p>
    </div>`;
  },
};

// ---------- Learn sub-tabs ----------
const learnTabs = {
  today() {
    const s = S();
    const l = todaysLesson();
    const kws = dailyKeywords(today());
    return `
      <div class="card glow tap" data-action="open-lesson" data-id="${l.id}">
        <div class="card-kicker">☀️ Lesson of the day · ${esc(l.level)}</div>
        <h3>${esc(l.title)}</h3><p class="muted small">${esc(l.summary)}</p>
        <div style="margin-top:10px"><span class="btn primary sm">${s.lessonsDone.includes(l.id) ? 'Review ✓' : 'Start · +25 XP'}</span></div>
      </div>
      <div class="section-title"><h2>🔑 Today's 5 keywords</h2><span class="faint small">Tap to flip</span></div>
      <div class="flip-grid">${kws.map(flipCard).join('')}</div>`;
  },

  path() {
    const s = S();
    const pct = Math.round((s.lessonsDone.length / LESSONS.length) * 100);
    return `<div class="card"><div class="row"><b class="grow">Your progress</b><span class="faint small">${s.lessonsDone.length}/${LESSONS.length} · ${pct}%</span></div>
        <div class="progress-line" style="margin-top:10px"><i style="width:${pct}%"></i></div></div>
      ${LEVELS.map((lvl) => {
        const ls = LESSONS.filter((l) => l.level === lvl);
        return `<div class="section-title"><h2>${{ Beginner: '🌱', Intermediate: '🌿', Advanced: '🌳', Expert: '🚀' }[lvl]} ${lvl}</h2><span class="faint small">${ls.filter((l) => s.lessonsDone.includes(l.id)).length}/${ls.length}</span></div>
        ${ls.map((l) => `<div class="card tap path-item ${s.lessonsDone.includes(l.id) ? 'done' : ''}" data-action="open-lesson" data-id="${l.id}">
          <div class="num">${s.lessonsDone.includes(l.id) ? '✓' : LESSONS.indexOf(l) + 1}</div>
          <div class="grow"><b>${esc(l.title)}</b><div class="faint small">${esc(l.tag)} · ${esc(l.summary)}</div></div></div>`).join('')}`;
      }).join('')}`;
  },

  keywords() {
    const s = S();
    const cat = learnState.kwCat;
    const q = learnState.kwQ.toLowerCase();
    const list = KEYWORDS.filter((k) => (cat === 'All' || k.cat === cat) && (!q || `${k.kw} ${k.meaning}`.toLowerCase().includes(q)));
    return `<div class="card gradient"><div class="row"><span style="font-size:28px">🔑</span><div class="grow"><b>${s.keywordsLearned.length} of ${KEYWORDS.length} keywords learned</b><div class="muted small">Flip a card, then tap ✓ Learned for +5 XP.</div></div></div></div>
      <label class="searchbar" style="margin-top:12px"><span>🔎</span><input id="kw-search" type="search" placeholder="Search keywords…" value="${esc(learnState.kwQ)}"></label>
      <div class="chips">${['All', ...KEYWORD_CATEGORIES].map((c) => `<button class="chip sm ${cat === c ? 'active' : ''}" data-action="kw-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="flip-grid" id="kw-grid">${list.map(flipCard).join('') || '<div class="empty">No keywords found.</div>'}</div>`;
  },

  quiz() {
    const s = S();
    const qs = dailyQuiz(today());
    const st = s.quiz[today()] || { answers: [], score: 0, total: qs.length };
    return `<div class="card gradient"><div class="row"><span style="font-size:28px">🧠</span><div class="grow"><b>Daily quiz</b><div class="muted small">${st.done ? `Finished: ${st.score}/${st.total}. New questions tomorrow!` : `${st.answers.length}/${qs.length} answered · +10 XP per correct answer`}</div></div></div></div>
      ${qs.map((q, qi) => {
        const ans = st.answers[qi];
        const answered = ans !== undefined;
        return `<div class="card"><div class="card-kicker">Question ${qi + 1}</div><h3 style="font-size:16px">${esc(q.q)}</h3>
          <div class="option-list" style="margin-top:10px">${q.options.map((o, oi) => {
            const cls = answered ? (oi === q.answer ? 'correct' : oi === ans ? 'wrong' : '') : '';
            return `<button class="option ${cls}" ${answered ? 'disabled' : ''} data-action="quiz-answer" data-q="${qi}" data-o="${oi}"><span class="big">${'ABCD'[oi]}</span><span style="font-size:14px;color:var(--text)">${esc(o)}</span></button>`;
          }).join('')}</div>
          ${answered ? `<div class="tipbox" style="margin-top:10px">${ans === q.answer ? '🎉 Correct! ' : '💡 '}${esc(q.explain)}</div>` : ''}</div>`;
      }).join('')}`;
  },

  challenge() {
    const s = S();
    const ch = dailyChallenge(today());
    const done = !!s.challenges[today()];
    return `<div class="card glow">
        <div class="card-kicker">🎯 Today's challenge · +${ch.xp} XP</div>
        <h3>${esc(ch.title)}</h3>
        <p style="margin-top:6px">${esc(ch.task)}</p>
        <div class="tipbox" style="margin-top:12px">💡 Hint: ${esc(ch.hint)}</div>
        <div class="row wrap" style="margin-top:14px">
          <button class="btn ghost" data-action="challenge-lab">🧪 Practise in Lab</button>
          <button class="btn primary" data-action="challenge-done" ${done ? 'disabled' : ''}>${done ? '✅ Completed' : '✓ I did it'}</button>
        </div>
      </div>
      <div class="card"><div class="card-kicker">How it works</div><p class="muted small">Write your prompt in the Lab, check the strength score, test it in Claude or ChatGPT, then tap “I did it” to claim your XP. A new challenge appears every day.</p></div>`;
  },
};

const learnState = { kwCat: 'All', kwQ: '' };

function flipCard(k) {
  const learned = S().keywordsLearned.includes(k.kw);
  return `<div class="flip" data-action="flip">
    <div class="flip-inner">
      <div class="flip-face flip-front">${learned ? '<span class="learned">✅</span>' : ''}<div class="kw">${esc(k.kw)}</div><div class="cat">${esc(k.cat)}</div></div>
      <div class="flip-face flip-back"><b>${esc(k.kw)}</b><span>${esc(k.meaning)}</span><span class="ex">“${esc(k.example)}”</span>
        ${learned ? '<span class="tag green" style="align-self:flex-start">✓ Learned</span>' : `<button class="btn primary sm" style="margin-top:auto" data-action="learn-kw" data-kw="${esc(k.kw)}">✓ Learned +5</button>`}</div>
    </div></div>`;
}

// ============================================================================
// Prompt Lab logic
// ============================================================================
const labState = { text: '', type: 'Auto', tone: 'Professional', length: 'Auto', format: 'Best fit', audience: '', goal: '', optionsOpen: false };
const labText = () => labState.text.replace(/^\/\/ Challenge:.*\n+/, '');

const scoreColor = (n) => (n >= 90 ? 'var(--green)' : n >= 60 ? 'var(--cyan)' : n >= 40 ? 'var(--amber)' : 'var(--pink)');
const scoreRing = (n, label) => `<div class="ring" style="--p:${n};background:conic-gradient(${scoreColor(n)} calc(var(--p)*1%), rgba(255,255,255,.08) 0)"><div><b>${n}</b><span>${label}</span></div></div>`;

function checkList(title, list) {
  return `<div class="check-col"><h4>${title}</h4>${list.map((c) => `<div class="check ${c.pass ? 'ok' : 'no'}">
      <span class="c-ico">${c.pass ? '✔' : c.points > 0 ? '◐' : '✖'}</span>
      <span class="grow"><b>${esc(c.label)}</b>${c.pass ? '' : `<span class="c-tip">${esc(c.tip)}</span>`}</span>
      <span class="c-pts">${c.points}/${c.weight}</span></div>`).join('')}</div>`;
}

function renderLabScore() {
  const box = $('#lab-score');
  if (!box) return;
  const text = labText();
  if (!text.trim()) {
    box.innerHTML = '<p class="faint small" style="margin:0">Start typing to see your prompt\'s strength and accuracy.</p>';
    return;
  }
  const r = analyze(text, { type: labState.type });
  const fixes = [...r.strengthChecks, ...r.accuracyChecks].filter((c) => !c.pass).sort((a, b) => b.weight - b.points - (a.weight - a.points));
  box.innerHTML = `
    <div class="score-head">
      ${scoreRing(r.strength, 'Strength')}
      ${scoreRing(r.accuracy, 'Accuracy')}
      <div class="grow">
        <div class="grade" style="color:${scoreColor(r.overall)}">${esc(r.grade)} · ${r.overall}%</div>
        <div class="faint small">Detected type: <span class="tag cyan">${esc(r.type)}</span> · ${r.words} words</div>
      </div>
    </div>
    ${fixes.length ? `<div class="tipbox" style="margin-top:12px"><b>Top fixes</b><br>${fixes.slice(0, 3).map((c) => `💡 ${esc(c.tip)}`).join('<br>')}</div>` : '<div class="tipbox" style="margin-top:12px">🏆 Perfect prompt: every check passes!</div>'}
    <details class="breakdown"><summary>See all ${r.strengthChecks.length + r.accuracyChecks.length} checks</summary>
      <div class="check-cols">${checkList('💪 Strength', r.strengthChecks)}${checkList('🎯 Accuracy', r.accuracyChecks)}</div>
    </details>`;
}

// ============================================================================
// Lesson modal
// ============================================================================
function openLesson(id) {
  const l = LESSONS.find((x) => x.id === id);
  if (!l) return;
  const done = S().lessonsDone.includes(id);
  const m = openModal(`
    <div class="card-kicker">${esc(l.tag)} · ${esc(l.level)}</div>
    <h2>${esc(l.title)}</h2>
    <p class="muted">${esc(l.summary)}</p>
    <div class="lesson-section"><h4>Why it works</h4><p>${esc(l.why)}</p></div>
    <div class="lesson-section"><h4>How to do it</h4><ol>${l.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <div class="lesson-section"><h4>Before → After</h4><div class="compare">
      <div class="bad"><b style="color:var(--red)">✗ Weak prompt</b>${esc(l.bad)}</div>
      <div class="good"><b style="color:var(--green)">✓ Strong prompt</b>${esc(l.good)}</div></div>
      ${promptActions(l.good, { title: l.title })}</div>
    <div class="lesson-section"><div class="tipbox">💡 <b>Pro tip:</b> ${esc(l.tip)}</div></div>
    <button class="btn primary block" style="margin-top:18px" data-action="complete-lesson" data-id="${l.id}" ${done ? 'disabled' : ''}>${done ? '✅ Completed' : '✓ Mark complete · +25 XP'}</button>`);
  m.scrollTop = 0;
}

// ============================================================================
// Onboarding / profile editor
// ============================================================================
function openOnboarding(edit = false) {
  const p = S().profile || {};
  const draft = { name: p.name || '', avatar: p.avatar || '🦊', level: p.level || 'Beginner', interests: p.interests ? [...p.interests] : ['llm'], hour: S().settings.notifyHour };
  let step = edit ? 1 : 0;
  const total = 5;
  const m = openModal('<div id="ob"></div>', { dismissible: edit });

  const renderStep = () => {
    const box = $('#ob', m);
    const dots = `<div class="steps-dots">${Array.from({ length: total }, (_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
    const nav = (next = 'Next', back = step > (edit ? 1 : 0)) => `<div class="row" style="margin-top:18px">${back ? '<button class="btn ghost" data-ob="back">Back</button>' : ''}<button class="btn primary grow" data-ob="next">${next}</button></div>`;
    const screens = [
      () => `<div class="center"><img src="assets/icons/logo.svg" alt="" style="width:96px;margin:6px auto 12px;animation:bounceIn .9s var(--spring) both;filter:drop-shadow(0 0 24px rgba(124,58,237,.6))">
          <h2 style="padding:0">Welcome to PromptPulse ⚡</h2><p class="muted">Your personal AI agent for staying ahead in AI.</p></div>
        <div class="option-list" style="margin-top:14px">
          <div class="option"><span class="big">📰</span><div><b>Daily AI news</b><span>From 14 top sources, refreshed every hour</span></div></div>
          <div class="option"><span class="big">🎓</span><div><b>Pro prompting skills</b><span>30 lessons from beginner to expert</span></div></div>
          <div class="option"><span class="big">🔑</span><div><b>Fresh keywords daily</b><span>Power words that level up every prompt</span></div></div>
          <div class="option"><span class="big">🔔</span><div><b>Phone notifications</b><span>Your briefing every morning</span></div></div>
        </div>${nav("Let's set up your profile →")}`,
      () => `<h2>Who's prompting? 🙌</h2><p class="muted">Pick a name and an avatar.</p>
        <div class="field" style="margin-top:12px"><label for="ob-name">Your name</label><input id="ob-name" class="input" maxlength="24" placeholder="e.g. Sam" value="${esc(draft.name)}"></div>
        <div class="field"><label>Avatar</label><div class="pick-grid">${AVATARS.map((a) => `<button class="pick ${draft.avatar === a ? 'active' : ''}" data-ob-avatar="${a}">${a}</button>`).join('')}</div></div>${nav()}`,
      () => `<h2>Your prompting level 📈</h2><p class="muted">We'll tailor your daily lessons.</p>
        <div class="option-list" style="margin-top:12px">${[
          ['Beginner', '🌱', 'I use ChatGPT/Claude casually'],
          ['Intermediate', '🌿', 'I write structured prompts sometimes'],
          ['Advanced', '🌳', 'I use few-shot, chaining, system prompts'],
          ['Expert', '🚀', 'I build agents and evaluate prompts'],
        ].map(([l, i, d]) => `<button class="option ${draft.level === l ? 'active' : ''}" data-ob-level="${l}"><span class="big">${i}</span><div><b>${l}</b><span>${d}</span></div></button>`).join('')}</div>${nav()}`,
      () => `<h2>What excites you? ✨</h2><p class="muted">Pick as many as you like.</p>
        <div class="row wrap" style="margin-top:12px;gap:8px">${INTERESTS.map((i) => `<button class="chip ${draft.interests.includes(i.id) ? 'active' : ''}" data-ob-interest="${i.id}">${i.icon} ${esc(i.label)}</button>`).join('')}</div>${nav()}`,
      () => `<h2>Daily briefing time 🔔</h2><p class="muted">When should your AI news notification arrive?</p>
        <div class="field" style="margin-top:12px"><label>Time</label><select id="ob-hour" class="input">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${draft.hour === h ? 'selected' : ''}>${fmtHour(h)}</option>`).join('')}</select></div>
        <p class="faint small">You can turn on phone notifications from your Profile after setup.</p>${nav(edit ? 'Save changes ✓' : 'Finish & start 🚀')}`,
    ];
    box.innerHTML = screens[step]() + dots;
    $('#ob-name', box)?.focus();
  };

  m.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ob],[data-ob-avatar],[data-ob-level],[data-ob-interest]');
    if (!t) return;
    if (t.dataset.obAvatar) { draft.avatar = t.dataset.obAvatar; play('tap'); renderStep(); return; }
    if (t.dataset.obLevel) { draft.level = t.dataset.obLevel; play('tap'); renderStep(); return; }
    if (t.dataset.obInterest) {
      const id = t.dataset.obInterest;
      draft.interests = draft.interests.includes(id) ? draft.interests.filter((x) => x !== id) : [...draft.interests, id];
      play('tap'); renderStep(); return;
    }
    if (t.dataset.ob === 'back') { step--; play('nav'); renderStep(); return; }
    if (t.dataset.ob === 'next') {
      if (step === 1) {
        draft.name = $('#ob-name', m).value.trim();
        if (!draft.name) { play('error'); toast('Please enter your name', 'error'); $('#ob-name', m).focus(); return; }
      }
      if (step === 4) {
        draft.hour = Number($('#ob-hour', m).value);
        finish();
        return;
      }
      step++; play('nav'); renderStep();
    }
  });
  m.addEventListener('input', (e) => { if (e.target.id === 'ob-name') draft.name = e.target.value; });

  function finish() {
    const first = !S().profile;
    store.set((s) => ({
      profile: { name: draft.name, avatar: draft.avatar, level: draft.level, interests: draft.interests, createdAt: s.profile?.createdAt || new Date().toISOString() },
      settings: { ...s.settings, notifyHour: draft.hour },
      daily: first ? s.daily : { day: null, lessonId: null },
    }));
    if (S().push.enabled) refreshDeviceCode().then((r) => { if (r?.changed) toast('Update your device code in GitHub (Profile → Device code)', 'info', '🔑'); });
    closeModal(true);
    if (first) {
      confetti(220);
      play('levelup');
      reward(50, null, `Welcome aboard, ${draft.name}!`);
    } else {
      play('save');
      toast('Profile updated', 'success');
    }
    render();
  }
  renderStep();
}

// ============================================================================
// Notifications
// ============================================================================
function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// The public key: one generated on this device (until the site is redeployed with it) or the deployed one.
const KEY_STORE = 'promptpulse:vapid-public';
function vapidKey() {
  try { return localStorage.getItem(KEY_STORE) || CONFIG.VAPID_PUBLIC_KEY; } catch { return CONFIG.VAPID_PUBLIC_KEY; }
}
const toB64Url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Generates a fresh Web Push (VAPID) key pair entirely in this browser. Nothing is sent anywhere.
async function generateKeys() {
  if (!crypto?.subtle) { toast('Open the app over https to generate keys', 'error'); return; }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = toB64Url(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  try { localStorage.setItem(KEY_STORE, publicKey); } catch { /* ignore */ }
  const kPriv = keep(privateKey);
  const kPub = keep(publicKey);
  play('success');
  const repo = esc(CONFIG.REPO);
  openModal(`
    <h2>🔐 Your notification keys</h2>
    <p class="muted">Created on this device just now. Add both to GitHub, then tap <b>Enable notifications</b>.</p>
    <div class="lesson-section"><h4>1 · Secret (keep private)</h4>
      <p class="small muted">New repository <b>secret</b> named <b>VAPID_PRIVATE_KEY</b></p>
      <div class="code-out" style="max-height:80px">${esc(privateKey)}</div>
      <div class="row wrap" style="margin-top:8px"><button class="btn primary sm" data-action="copy" data-key="${kPriv}">📋 Copy secret key</button>
      <a class="btn ghost sm" href="https://github.com/${repo}/settings/secrets/actions/new" target="_blank" rel="noopener">Open Secrets ↗</a></div></div>
    <div class="lesson-section"><h4>2 · Public key</h4>
      <p class="small muted">Variables tab → New repository <b>variable</b> named <b>VAPID_PUBLIC_KEY</b></p>
      <div class="code-out" style="max-height:80px">${esc(publicKey)}</div>
      <div class="row wrap" style="margin-top:8px"><button class="btn primary sm" data-action="copy" data-key="${kPub}">📋 Copy public key</button>
      <a class="btn ghost sm" href="https://github.com/${repo}/settings/variables/actions/new" target="_blank" rel="noopener">Open Variables ↗</a></div></div>
    <div class="tipbox" style="margin-top:14px">⚠️ This secret key is shown only once. Generating new keys later means re-registering every device.</div>
    <button class="btn primary block" style="margin-top:16px" data-action="enable-push">🔔 Next: enable notifications</button>`);
}

async function syncSwPrefs() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const meta = await caches.open('pp-meta');
    const s = S();
    await meta.put(new URL('__prefs', reg.scope).href, new Response(JSON.stringify({ hour: s.settings.notifyHour, localDaily: s.push.enabled })));
  } catch { /* no SW */ }
}

async function refreshDeviceCode() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    const s = S();
    const code = JSON.stringify({ name: s.profile?.name || 'Me', tz: Intl.DateTimeFormat().resolvedOptions().timeZone, hour: s.settings.notifyHour, sub: sub.toJSON() });
    const changed = code !== s.push.code;
    store.set({ push: { enabled: true, code } });
    syncSwPrefs();
    return { code, changed };
  } catch {
    return null;
  }
}

async function enablePush(anchor) {
  if (isIOS() && !isStandalone()) { showInstallHelp(true); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    play('error'); toast('This browser does not support push notifications. Try Chrome, Edge or Firefox.', 'error'); return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { play('error'); toast('Notifications are blocked. Allow them in your browser/site settings.', 'error'); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const key = vapidKey();
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options?.applicationServerKey && toB64Url(sub.options.applicationServerKey) !== key) {
      await sub.unsubscribe(); // registered with an old key: re-register with the current one
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    const wasEnabled = S().push.enabled;
    await refreshDeviceCode();
    try { await reg.periodicSync?.register('pp-daily', { minInterval: 12 * 3600 * 1000 }); } catch { /* optional */ }
    if (!wasEnabled) reward(30, anchor, 'Notifications enabled');
    showDeviceCode();
    render();
  } catch (e) {
    play('error');
    toast(`Could not subscribe: ${e.message}`, 'error');
  }
}

function showDeviceCode() {
  const code = S().push.code;
  if (!code) return;
  const k = keep(code);
  openModal(`
    <h2>🔑 Connect this phone</h2>
    <p class="muted">Last step! Your daily notifications are sent by your GitHub repo. Give it this device code once:</p>
    <div class="code-out" style="max-height:120px">${esc(code)}</div>
    <button class="btn primary block" style="margin-top:10px" data-action="copy" data-key="${k}">📋 Copy device code</button>
    <div class="lesson-section"><h4>Then, in GitHub</h4><ol>
      <li>Open <a href="https://github.com/${esc(CONFIG.REPO)}/settings/secrets/actions/new" target="_blank" rel="noopener">Repo → Settings → Secrets → Actions → New secret</a></li>
      <li>Name: <b>PUSH_SUBSCRIPTIONS</b></li>
      <li>Value: paste the code. For several devices, put one code per line.</li>
      <li>Save. Your briefing will arrive daily at <b>${fmtHour(S().settings.notifyHour)}</b> 🎉</li>
    </ol></div>
    <div class="tipbox">If you change your notification time, update this secret with the new code.</div>`);
}

async function testNotify() {
  if (!('Notification' in window)) { toast('Notifications not supported here', 'error'); return; }
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Please allow notifications first', 'error'); return; }
  }
  const kw = dailyKeywords(today())[0];
  const top = news.items[0];
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = {
    body: `${top ? `📰 ${top.title}\n` : ''}🔑 Keyword of the day: “${kw.kw}”`,
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/badge-96.png',
    tag: 'pp-test',
    vibrate: [120, 60, 120],
    data: { url: './#/home' },
  };
  play('notify');
  if (reg) reg.showNotification('⚡ Your AI briefing is ready', opts);
  else new Notification('⚡ Your AI briefing is ready', opts);
}

// ---------- Install ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { toast('PromptPulse installed!', 'success', '📲'); confetti(); });

async function install() {
  if (deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
  } else {
    showInstallHelp(false);
  }
}

function showInstallHelp(forPush) {
  const ios = isIOS();
  openModal(`
    <h2>📲 Install PromptPulse</h2>
    ${forPush ? '<p class="muted">On iPhone and iPad, notifications only work after installing the app to your Home Screen (iOS 16.4+).</p>' : ''}
    <div class="lesson-section"><h4>${ios ? 'iPhone / iPad (Safari)' : 'Android (Chrome)'}</h4><ol>
      ${ios
        ? '<li>Tap the <b>Share</b> button <span style="font-size:18px">⎋</span> at the bottom of Safari</li><li>Scroll and tap <b>Add to Home Screen</b> ➕</li><li>Open PromptPulse from your Home Screen</li><li>Go to Profile → <b>Enable notifications</b></li>'
        : '<li>Tap the <b>⋮</b> menu in Chrome</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b></li><li>Open PromptPulse from your home screen</li><li>Go to Profile → <b>Enable notifications</b></li>'}
    </ol></div>
    <button class="btn primary block" data-action="close-modal">Got it</button>`);
}

// ============================================================================
// Router & render
// ============================================================================
function route() {
  const [name = 'home', sub] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: views[name] ? name : 'home', sub };
}

function render() {
  const { name, sub } = route();
  $('#view').innerHTML = views[name](sub);
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.route === name));
  updateTopbar();
  afterRender(name, sub);
}

function afterRender(name, sub) {
  if (name === 'lab') renderLabScore();
  if (name === 'profile') {
    requestAnimationFrame(() => { const bar = $('#xpbar'); if (bar) bar.style.width = `${bar.dataset.w}%`; });
    if (sub === 'notify') $('#notify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (name === 'news') {
    $('#news-dot').classList.add('hidden');
    if (news.loaded) store.set({ lastNewsSeen: new Date().toISOString() });
  }
}

function updateTopbar() {
  const s = S();
  $('#streak-count').textContent = s.streak.count;
  $('#xp-count').textContent = s.xp;
  $('#avatar-btn').textContent = s.profile?.avatar || '🙂';
}

window.addEventListener('hashchange', () => {
  if (activeModal?.dismissible) closeModal(true);
  play('nav');
  render();
  window.scrollTo(0, 0);
});

// ============================================================================
// Event delegation
// ============================================================================
document.addEventListener('click', async (e) => {
  const navBtn = e.target.closest('.nav-btn');
  if (navBtn) { location.hash = `#/${navBtn.dataset.route}`; return; }
  if (e.target.closest('#avatar-btn')) { location.hash = '#/profile'; return; }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  const s = S();

  switch (action) {
    case 'close-modal': closeModal(); break;
    case 'goto':
      closeModal(true);
      location.hash = `#/${el.dataset.route}`;
      break;

    // ---- News ----
    case 'read-news': {
      if (!s.readNews.includes(id)) {
        const day = today();
        const counter = s.newsReadToday.day === day ? s.newsReadToday.count : 0;
        store.set({ readNews: [...s.readNews, id].slice(-800), newsReadToday: { day, count: counter + 1 } });
        if (counter < 10) setTimeout(() => reward(3, el), 50);
        el.closest('.news-card')?.classList.add('read');
      }
      break; // link opens normally
    }
    case 'bookmark': {
      const item = findStory(id);
      const has = s.bookmarks.some((b) => b.id === id);
      store.set({ bookmarks: has ? s.bookmarks.filter((b) => b.id !== id) : [item, ...s.bookmarks].slice(0, 200) });
      el.classList.toggle('on', !has);
      el.textContent = has ? '🤍' : '💖';
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      play(has ? 'close' : 'save');
      if (news.cat === 'Saved') render();
      break;
    }
    case 'share-news': {
      const item = findStory(id);
      if (navigator.share) { try { await navigator.share({ title: item.title, url: item.url }); } catch { /* cancelled */ } } else copyText(item.url);
      break;
    }
    case 'prompt-news': {
      const item = findStory(id);
      const p = `You are an AI industry analyst who explains things clearly.\n\nI just read this AI news story:\n<story>\nTitle: ${item.title}\nSource: ${item.source}\nLink: ${item.url}\nSummary: ${item.summary || 'n/a'}\n</story>\n\n1. Explain what happened in 3 simple sentences.\n2. Why does it matter? Give me the 3 biggest implications.\n3. How could I use this (as a ${s.profile?.level?.toLowerCase() || 'curious'} AI user interested in ${(INTERESTS.filter((i) => s.profile?.interests?.includes(i.id)).map((i) => i.label).join(', ') || 'AI')})?\n4. One prompt I could try today related to this.\nIf the link content isn't accessible to you, say so and work from the title and summary.`;
      openModal(`<h2>✨ Explain with AI</h2><p class="muted">A ready-made prompt to understand this story deeply.</p><div class="code-out">${esc(p)}</div>${promptActions(p, { title: `News: ${item.title.slice(0, 40)}` })}`);
      break;
    }
    case 'news-cat': news.cat = el.dataset.cat; news.limit = 30; play('tap'); render(); break;
    case 'more-news': news.limit += 30; play('tap'); render(); break;
    case 'refresh-news': {
      el.innerHTML = '<span class="spin">🔄</span>';
      const before = news.items.length;
      await loadNews();
      await loadLiveNews();
      const diff = news.items.length - before;
      play('notify');
      toast(diff > 0 ? `${diff} fresh stories loaded` : 'You are up to date', 'news', '📰');
      render();
      break;
    }

    // ---- Learn ----
    case 'open-lesson': openLesson(id); break;
    case 'complete-lesson':
      if (!s.lessonsDone.includes(id)) {
        store.set({ lessonsDone: [...s.lessonsDone, id] });
        el.disabled = true;
        el.textContent = '✅ Completed';
        confetti(120);
        reward(25, el, 'Lesson complete');
        setTimeout(render, 300);
      }
      break;
    case 'flip':
      if (e.target.closest('[data-action="learn-kw"]')) break;
      el.classList.toggle('flipped');
      play('whoosh');
      break;
    case 'learn-kw': {
      e.stopPropagation();
      const kw = el.dataset.kw;
      if (!s.keywordsLearned.includes(kw)) {
        store.set({ keywordsLearned: [...s.keywordsLearned, kw] });
        reward(5, el);
        el.outerHTML = '<span class="tag green" style="align-self:flex-start">✓ Learned</span>';
      }
      break;
    }
    case 'kw-cat': learnState.kwCat = el.dataset.cat; play('tap'); render(); break;
    case 'kw-detail': {
      const k = KEYWORDS.find((x) => x.kw === el.dataset.kw);
      const learned = s.keywordsLearned.includes(k.kw);
      const practice = `${k.example}\n\n(Practising the prompting technique: "${k.kw}". ${k.meaning})`;
      openModal(`<div class="card-kicker">🔑 ${esc(k.cat)}</div><h2>“${esc(k.kw)}”</h2><p>${esc(k.meaning)}</p>
        <div class="lesson-section"><h4>Use it like this</h4><div class="code-out">${esc(k.example)}</div>${promptActions(practice, { title: `Keyword: ${k.kw}` })}</div>
        <button class="btn primary block" style="margin-top:16px" data-action="learn-kw-modal" data-kw="${esc(k.kw)}" ${learned ? 'disabled' : ''}>${learned ? '✅ Learned' : '✓ Mark as learned · +5 XP'}</button>`);
      break;
    }
    case 'learn-kw-modal':
      if (!s.keywordsLearned.includes(el.dataset.kw)) {
        store.set({ keywordsLearned: [...s.keywordsLearned, el.dataset.kw] });
        el.disabled = true; el.textContent = '✅ Learned';
        reward(5, el);
      }
      break;
    case 'quiz-answer': {
      const qi = Number(el.dataset.q);
      const oi = Number(el.dataset.o);
      const qs = dailyQuiz(today());
      const st = s.quiz[today()] || { answers: [], score: 0, total: qs.length };
      if (st.answers[qi] !== undefined) break;
      const answers = [...st.answers];
      answers[qi] = oi;
      const correct = qs[qi].answer === oi;
      const score = st.score + (correct ? 1 : 0);
      const doneAll = answers.filter((a) => a !== undefined).length === qs.length;
      store.set({ quiz: { ...s.quiz, [today()]: { answers, score, total: qs.length, done: doneAll } } });
      if (correct) reward(10, el); else play('error');
      render();
      if (doneAll) setTimeout(() => {
        if (score === qs.length) { confetti(200); play('levelup'); toast('Perfect score! 🧠🔥', 'success', '🏆'); }
        else toast(`Quiz done: ${score}/${qs.length}`, 'info', '🧠');
        announceBadges();
      }, 500);
      break;
    }
    case 'challenge-done': {
      const ch = dailyChallenge(today());
      if (!s.challenges[today()]) {
        store.set({ challenges: { ...s.challenges, [today()]: true } });
        confetti(150);
        reward(ch.xp, el, 'Challenge complete');
        render();
      }
      break;
    }
    case 'challenge-lab': {
      const ch = dailyChallenge(today());
      labState.text = `// Challenge: ${ch.task}\n\n`;
      location.hash = '#/lab';
      setTimeout(() => { const t = $('#lab-input'); t?.focus(); t?.setSelectionRange(t.value.length, t.value.length); }, 400);
      break;
    }

    // ---- Lab ----
    case 'enhance': {
      const text = labText().trim();
      if (text.length < 2) { play('error'); toast('Write a prompt first', 'error'); $('#lab-input')?.focus(); break; }
      const before = analyze(text, { type: labState.type });
      const { text: out, type } = enhance(text, labState);
      const after = analyze(out, { type });
      $('#lab-out').innerHTML = `
        <div class="section-title" style="margin-top:20px"><h2 style="font-size:16px">⚡ Enhanced prompt</h2><span class="tag green">${after.overall}%</span></div>
        <div class="score-head">${scoreRing(after.strength, 'Strength')}${scoreRing(after.accuracy, 'Accuracy')}
          <div class="grow small"><div>💪 Strength <b>${before.strength} → ${after.strength}</b></div><div>🎯 Accuracy <b>${before.accuracy} → ${after.accuracy}</b></div><div class="faint">Type: ${esc(type)}</div></div></div>
        <div class="code-out" style="margin-top:12px">${esc(out)}</div>
        ${promptActions(out, { title: text.slice(0, 40) })}
        <button class="btn ghost sm" style="margin-top:8px" data-action="check-enhanced" data-key="${keep(out)}" data-type="${esc(type)}">🔁 Load into checker</button>
        <p class="faint small" style="margin-top:10px">Scores measure how complete and precise the prompt is. A perfect prompt gives the AI the best chance, but always double-check important facts in its answer.</p>`;
      $('#lab-out').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'ease-out' });
      play('levelup');
      if (after.overall === 100) confetti(90);
      const day = today();
      if (S().enhancedDay !== day) { store.set({ enhancedDay: day }); reward(10, el); }
      setTimeout(() => $('#lab-out')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      break;
    }
    case 'check-enhanced': {
      labState.text = TEXTS.get(el.dataset.key) || '';
      labState.type = el.dataset.type || 'Auto';
      render();
      setTimeout(() => $('#lab-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      play('whoosh');
      break;
    }
    case 'use-template': {
      const t = TEMPLATES.find((x) => x.id === id);
      const m = openModal(`<div style="font-size:34px">${t.icon}</div><h2>${esc(t.name)}</h2><p class="muted">Fill in the blanks and get a pro prompt.</p>
        ${t.fields.map((f, i) => `<div class="field"><label>${esc(f)}</label><input class="input" data-field="${esc(f)}" ${i === 0 ? 'autofocus' : ''} placeholder="${esc(f)}…"></div>`).join('')}
        <button class="btn primary block" data-action="fill-template" data-id="${t.id}">⚡ Generate prompt</button><div id="tpl-out"></div>`);
      setTimeout(() => $('input', m)?.focus(), 350);
      break;
    }
    case 'fill-template': {
      const t = TEMPLATES.find((x) => x.id === id);
      const m = el.closest('.modal');
      let text = t.template;
      $$('[data-field]', m).forEach((inp) => { text = text.replaceAll(`{{${inp.dataset.field}}}`, inp.value.trim() || `[${inp.dataset.field}]`); });
      $('#tpl-out', m).innerHTML = `<div class="code-out" style="margin-top:14px">${esc(text)}</div>${promptActions(text, { title: t.name })}`;
      play('whoosh');
      break;
    }
    case 'copy': copyText(TEXTS.get(el.dataset.key) || '', el); break;
    case 'open-ai': {
      const text = TEXTS.get(el.dataset.key) || '';
      const url = el.dataset.ai === 'claude' ? `https://claude.ai/new?q=${encodeURIComponent(text)}` : `https://chatgpt.com/?q=${encodeURIComponent(text)}`;
      play('whoosh');
      window.open(url, '_blank', 'noopener');
      break;
    }
    case 'save-prompt': {
      const text = TEXTS.get(el.dataset.key) || '';
      if (s.saved.some((p) => p.text === text)) { toast('Already saved', 'info', '💾'); break; }
      store.set({ saved: [{ id: `p${Date.now()}`, title: el.dataset.title || 'Prompt', text, createdAt: new Date().toISOString() }, ...s.saved] });
      play('save');
      toast('Saved to your Prompt Lab', 'success', '💾');
      el.disabled = true; el.textContent = '✅ Saved';
      announceBadges();
      break;
    }
    case 'delete-saved':
      store.set({ saved: s.saved.filter((p) => p.id !== id) });
      play('close');
      render();
      break;

    // ---- Profile ----
    case 'edit-profile': openOnboarding(true); break;
    case 'enable-push': closeModal(true); enablePush(el); break;
    case 'gen-keys':
      openModal(`<h2>🔐 Set up notification keys</h2><p class="muted">Notifications need a key pair. Your phone creates it here, so nobody else ever sees the secret half. Do this <b>once</b>, on one device.</p>
        <button class="btn primary block" style="margin-top:14px" data-action="gen-keys-go">✨ Generate my keys</button>`);
      break;
    case 'gen-keys-go': generateKeys(); break;
    case 'test-notify': testNotify(); break;
    case 'show-code': showDeviceCode(); break;
    case 'install': install(); break;
    case 'export': {
      const blob = new Blob([store.export()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `promptpulse-backup-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      play('save');
      break;
    }
    case 'reset':
      openModal(`<h2>Reset everything?</h2><p class="muted">This deletes your profile, XP, streak, saved prompts and bookmarks from this device. Export a backup first if you want to keep them.</p>
        <div class="row" style="margin-top:16px"><button class="btn ghost grow" data-action="close-modal">Cancel</button><button class="btn danger grow" data-action="confirm-reset">Yes, reset</button></div>`);
      break;
    case 'confirm-reset':
      store.reset();
      closeModal(true);
      location.hash = '#/home';
      render();
      openOnboarding();
      break;
  }
});

// Inputs (search, lab, settings)
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'news-search') {
    news.q = t.value;
    news.limit = 30;
    const list = filteredNews().slice(0, news.limit);
    $('#news-list').innerHTML = list.length ? list.map(newsCard).join('') : '<div class="empty"><span class="e-ico">🛰️</span>No stories match your search.</div>';
  }
  if (t.id === 'kw-search') {
    learnState.kwQ = t.value;
    const q = t.value.toLowerCase();
    const list = KEYWORDS.filter((k) => (learnState.kwCat === 'All' || k.cat === learnState.kwCat) && (!q || `${k.kw} ${k.meaning}`.toLowerCase().includes(q)));
    $('#kw-grid').innerHTML = list.map(flipCard).join('') || '<div class="empty">No keywords found.</div>';
  }
  if (t.id === 'lab-input') { labState.text = t.value; renderLabScore(); }
  if (t.id === 'lab-audience') labState.audience = t.value;
  if (t.id === 'lab-goal') labState.goal = t.value;
});

document.addEventListener('toggle', (e) => {
  if (e.target.classList?.contains('lab-options')) labState.optionsOpen = e.target.open;
}, true);

document.addEventListener('change', async (e) => {
  const t = e.target;
  const s = S();
  if (t.id === 'lab-type') { labState.type = t.value; renderLabScore(); }
  if (t.id === 'lab-tone') labState.tone = t.value;
  if (t.id === 'lab-length') labState.length = t.value;
  if (t.id === 'lab-format') labState.format = t.value;
  if (t.id === 'set-sound') {
    store.set({ settings: { ...s.settings, sound: t.checked } });
    setSoundEnabled(t.checked);
    play('success');
  }
  if (t.id === 'set-anim') {
    store.set({ settings: { ...s.settings, animations: t.checked } });
    document.body.classList.toggle('no-anim', !t.checked);
    play('tap');
  }
  if (t.id === 'set-hour') {
    store.set({ settings: { ...s.settings, notifyHour: Number(t.value) } });
    play('save');
    if (s.push.enabled) {
      const res = await refreshDeviceCode();
      if (res?.changed) { toast('Time changed: update the device code in GitHub', 'info', '🔑'); showDeviceCode(); }
    } else toast(`Briefing time set to ${fmtHour(Number(t.value))}`, 'success', '⏰');
  }
  if (t.id === 'import-file' && t.files[0]) {
    try {
      store.import(await t.files[0].text());
      play('success'); toast('Backup restored', 'success');
      render();
    } catch (err) { play('error'); toast(err.message, 'error'); }
  }
});

// ============================================================================
// Boot
// ============================================================================
async function boot() {
  const s = S();
  setSoundEnabled(s.settings.sound);
  document.body.classList.toggle('no-anim', !s.settings.animations);
  news.prevSeen = s.lastNewsSeen;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => { if (S().push.enabled) syncSwPrefs(); }).catch(() => {});
  }

  render();
  const newsPromise = loadNews().then(() => {
    const { name } = route();
    if (name === 'home' || name === 'news') render();
    const prev = news.prevSeen;
    const fresh = prev ? news.items.filter((i) => Date.parse(i.published) > Date.parse(prev)).length : 0;
    if (fresh > 0 && name !== 'news') {
      $('#news-dot').classList.remove('hidden');
      setTimeout(() => { play('notify'); toast(`${fresh} new AI ${fresh === 1 ? 'story' : 'stories'} since your last visit`, 'news', '🔥'); }, 1800);
    }
  });

  setTimeout(() => {
    $('#splash').classList.add('hide');
    if (!S().profile) {
      setTimeout(() => openOnboarding(), 350);
    } else {
      const grew = touchStreak();
      updateTopbar();
      if (grew && S().streak.count > 1) {
        setTimeout(() => { play('levelup'); toast(`${S().streak.count}-day streak! Keep it going`, 'success', '🔥'); }, 900);
      }
      if (route().name === 'home') render();
      setTimeout(announceBadges, 1500);
    }
  }, 1700);

  // Streak starts counting from the first day the profile exists.
  store.subscribe((st) => { if (st.profile && !st.streak.last) touchStreak(); });
  await newsPromise;
}

boot();
