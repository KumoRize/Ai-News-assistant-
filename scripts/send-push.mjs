// Sends the daily PromptPulse notification to every registered device whose chosen
// local hour is "now". Runs hourly from GitHub Actions.
//
// Secrets / env:
//   VAPID_PRIVATE_KEY   - private half of the key pair whose public half is in assets/js/config.js
//   PUSH_SUBSCRIPTIONS  - one or more "device codes" copied from the app (Profile → Notifications).
//                         Paste them as a JSON array, or one per line.
//   FORCE_PUSH=true     - send to every device right now (used by the "test notification" button).
//   SITE_URL            - optional, absolute URL of the deployed app (used for the click-through link).
import webpush from 'web-push';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../assets/js/config.js';
import { dayKey, dailyKeywords } from '../assets/js/daily.js';

const { VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTIONS, FORCE_PUSH, SITE_URL, VAPID_SUBJECT } = process.env;

function parseDevices(raw) {
  const s = (raw || '').trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [v];
  } catch {
    // One JSON object per line.
    return s.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
  }
}

function localHour(tz) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

async function main() {
  if (!VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTIONS) {
    console.log('Push not configured yet (VAPID_PRIVATE_KEY / PUSH_SUBSCRIPTIONS secrets missing) - skipping.');
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:promptpulse@example.com', CONFIG.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const devices = parseDevices(PUSH_SUBSCRIPTIONS);
  const force = FORCE_PUSH === 'true';
  let news = { items: [] };
  try {
    news = JSON.parse(await readFile(new URL('../data/news.json', import.meta.url), 'utf8'));
  } catch { /* send keyword-only notification */ }

  const fresh = news.items.filter((i) => Date.now() - Date.parse(i.published) < 36 * 3600e3);
  const top = (fresh.length ? fresh : news.items).slice(0, 3);

  let sent = 0;
  for (const d of devices) {
    const tz = d.tz || 'UTC';
    const due = force || localHour(tz) === Number(d.hour ?? 8);
    if (!due || !d.sub?.endpoint) continue;

    const kw = dailyKeywords(dayKey(new Date(), tz))[0];
    const headline = top[0]?.title;
    const more = fresh.length > 1 ? ` (+${fresh.length - 1} more stories)` : '';
    const payload = {
      title: `⚡ ${d.name ? d.name + ', your' : 'Your'} AI briefing is ready`,
      body: headline
        ? `📰 ${headline}${more}\n🔑 Keyword of the day: “${kw.kw}”`
        : `🔑 Keyword of the day: “${kw.kw}”. Plus a new prompting lesson is waiting.`,
      url: (SITE_URL ? SITE_URL.replace(/\/$/, '') + '/' : './') + '#/home',
      tag: `daily-${dayKey(new Date(), tz)}`,
      image: top.find((t) => t.image)?.image,
    };
    try {
      await webpush.sendNotification(d.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' });
      sent++;
      console.log(`✔ sent to ${d.name || 'device'} (${tz})`);
    } catch (e) {
      const gone = e.statusCode === 404 || e.statusCode === 410;
      console.log(`✘ ${d.name || 'device'}: ${e.statusCode || ''} ${gone ? 'subscription expired - re-copy the device code from the app' : e.body || e.message}`);
    }
  }
  console.log(`Done. ${sent} notification(s) sent, ${devices.length} device(s) registered.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
