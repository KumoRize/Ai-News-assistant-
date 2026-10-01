// Collects the latest AI news from free RSS/Atom feeds + Hacker News and writes data/news.json.
// Runs in GitHub Actions (see .github/workflows/promptpulse.yml) or locally: `npm run news`.
import { XMLParser } from 'fast-xml-parser';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/news.json');

const FEEDS = [
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { name: 'Wired', url: 'https://www.wired.com/feed/tag/ai/latest/rss' },
  { name: 'Ars Technica', url: 'https://arstechnica.com/ai/feed/' },
  { name: 'The Decoder', url: 'https://the-decoder.com/feed/' },
  { name: 'AI News', url: 'https://www.artificialintelligence-news.com/feed/' },
  { name: 'MarkTechPost', url: 'https://www.marktechpost.com/feed/' },
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
];

const HN_QUERIES = ['AI', 'LLM', 'OpenAI', 'Anthropic', 'Claude', 'Gemini'];

// Keyword rules used to tag each story. First match order doesn't matter: a story can get several tags.
const CATEGORY_RULES = {
  'LLMs': /\b(llm|gpt|claude|gemini|llama|mistral|chatbot|chatgpt|language model|deepseek|qwen|grok|copilot|reasoning model)\b/i,
  'Agents': /\b(agent|agents|agentic|autonomous|mcp|computer use|operator|assistant)\b/i,
  'Image & Video': /\b(image|video|sora|midjourney|dall-?e|stable diffusion|veo|imagen|flux|runway|diffusion|3d|music|voice|audio|speech)\b/i,
  'Coding': /\b(cod(e|ing)|developer|programming|github|ide|cursor|software engineer|devin|claude code|codex)\b/i,
  'Research': /\b(research|papers?|stud(y|ies)|benchmarks?|arxiv|scientists?|breakthrough|dataset|open[- ]source|weights|training)\b/i,
  'Business': /\b(funding|raises?|valuation|acquir|ipo|startup|revenue|investment|investors?|deal|billion|million|market|earnings|layoffs?|hiring|partnership)\b/i,
  'Policy': /\b(law|regulat|policy|government|eu ai act|congress|senate|lawsuit|court|copyright|safety|ethic|privacy|ban|election|military)\b/i,
  'Chips': /\b(nvidia|gpu|chip|chips|tpu|semiconductor|data ?cent(er|re)|amd|intel|tsmc|compute)\b/i,
};

const AI_FILTER = /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llm|gpt|claude|gemini|openai|anthropic|deepmind|neural|chatbot|model|agent|nvidia|copilot|diffusion|transformer|mistral|llama|hugging ?face)\b/i;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  cdataPropName: '#cdata',
});

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  return text(v['#cdata'] ?? v['#text'] ?? '');
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function clean(html, max = 280) {
  const s = decode(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function firstImage(item, rawHtml) {
  const candidates = [
    ...asArray(item['media:content']).map((m) => m?.['@url']),
    ...asArray(item['media:thumbnail']).map((m) => m?.['@url']),
    ...asArray(item['media:group']?.['media:content']).map((m) => m?.['@url']),
    ...asArray(item.enclosure).filter((e) => /image/.test(e?.['@type'] || 'image')).map((e) => e?.['@url']),
  ];
  const fromHtml = /<img[^>]+src=["']([^"']+)["']/i.exec(rawHtml || '');
  if (fromHtml) candidates.push(decode(fromHtml[1]));
  return candidates.find((u) => typeof u === 'string' && /^https:\/\//.test(u)) || null;
}

function categorize(title, summary) {
  const hay = `${title} ${summary}`;
  const cats = Object.entries(CATEGORY_RULES).filter(([, re]) => re.test(hay)).map(([c]) => c);
  return cats.length ? cats.slice(0, 3) : ['General'];
}

async function get(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'PromptPulse/1.0 (+https://github.com) RSS reader', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function parseFeed(xml, source) {
  const doc = parser.parse(xml);
  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomItems = asArray(doc?.feed?.entry);
  const rdfItems = asArray(doc?.['rdf:RDF']?.item);
  const out = [];
  for (const it of [...rssItems, ...rdfItems]) {
    const raw = text(it['content:encoded']) || text(it.description);
    out.push({
      title: clean(text(it.title), 200),
      url: text(it.link) || it.guid?.['#text'] || text(it.guid),
      date: text(it.pubDate) || text(it['dc:date']),
      summary: clean(text(it.description) || raw),
      image: firstImage(it, raw),
      source,
    });
  }
  for (const it of atomItems) {
    const links = asArray(it.link);
    const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') || links[0];
    const raw = text(it.content) || text(it.summary);
    out.push({
      title: clean(text(it.title), 200),
      url: alt?.['@href'] || text(alt),
      date: text(it.published) || text(it.updated),
      summary: clean(text(it.summary) || raw),
      image: firstImage(it, raw),
      source,
    });
  }
  return out;
}

async function fromFeeds() {
  const results = await Promise.allSettled(FEEDS.map(async (f) => parseFeed(await get(f.url), f.name)));
  const sources = [];
  const items = [];
  results.forEach((r, i) => {
    const name = FEEDS[i].name;
    if (r.status === 'fulfilled') {
      sources.push({ name, ok: true, count: r.value.length });
      items.push(...r.value);
    } else {
      sources.push({ name, ok: false, error: String(r.reason?.message || r.reason) });
    }
  });
  return { items, sources };
}

async function fromHackerNews() {
  const since = Math.floor(Date.now() / 1000) - 2 * 86400;
  const results = await Promise.allSettled(
    HN_QUERIES.map(async (q) => {
      const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30&numericFilters=points>40,created_at_i>${since}&query=${encodeURIComponent(q)}`;
      return JSON.parse(await get(url)).hits || [];
    }),
  );
  const hits = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return {
    ok: results.some((r) => r.status === 'fulfilled'),
    items: hits
      .filter((h) => h.title)
      .map((h) => ({
        title: clean(h.title, 200),
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        date: h.created_at,
        summary: `${h.points} points · ${h.num_comments ?? 0} comments on Hacker News`,
        image: null,
        source: 'Hacker News',
        discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points,
      })),
  };
}

const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const normUrl = (u) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase();
  } catch {
    return u;
  }
};

async function main() {
  const [feeds, hn] = await Promise.all([fromFeeds(), fromHackerNews()]);
  const sources = [...feeds.sources, { name: 'Hacker News', ok: hn.ok, count: hn.items.length }];

  const seen = new Set();
  const now = Date.now();
  const items = [];
  for (const raw of [...feeds.items, ...hn.items]) {
    if (!raw.title || !raw.url || !/^https?:\/\//.test(raw.url)) continue;
    const ts = Date.parse(raw.date);
    const published = Number.isFinite(ts) && ts <= now + 3600e3 ? ts : now;
    if (now - published > 4 * 86400e3) continue; // keep the last 4 days
    // Feeds above are AI-specific; Hacker News search is broad, so it must actually mention AI.
    if (raw.source === 'Hacker News' && !AI_FILTER.test(raw.title)) continue;
    const kT = normTitle(raw.title);
    const kU = normUrl(raw.url);
    if (seen.has(kT) || seen.has(kU)) continue;
    seen.add(kT);
    seen.add(kU);
    items.push({
      id: Buffer.from(kU).toString('base64url').slice(-24),
      title: raw.title,
      url: raw.url,
      source: raw.source,
      published: new Date(published).toISOString(),
      summary: raw.summary,
      image: raw.image,
      tags: categorize(raw.title, raw.summary),
      ...(raw.discussion ? { discussion: raw.discussion, points: raw.points } : {}),
    });
  }
  items.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

  const data = { generatedAt: new Date().toISOString(), sources, items: items.slice(0, 150) };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 1));
  const okCount = sources.filter((s) => s.ok).length;
  console.log(`Wrote ${data.items.length} stories from ${okCount}/${sources.length} sources → data/news.json`);
  for (const s of sources) console.log(`  ${s.ok ? '✔' : '✘'} ${s.name}${s.ok ? ` (${s.count})` : ` - ${s.error}`}`);
  if (data.items.length === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
