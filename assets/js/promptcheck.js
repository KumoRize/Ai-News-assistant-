// Prompt Checker: scores a prompt for Strength (does it contain everything a great prompt needs?)
// and Accuracy (is it precise, unambiguous and safe from guessing?), and enhances it.
// enhance() is built so its output always passes every check, i.e. scores 100 / 100.
// Pure module (no DOM), shared by the app and the test suite.

export const TYPES = ['Writing', 'Code', 'Image', 'Research', 'Business', 'Learning'];
export const TONES = ['Professional', 'Friendly', 'Persuasive', 'Playful', 'Academic', 'Simple (ELI5)'];
export const LENGTHS = ['Auto', 'Concise', 'Medium', 'Detailed'];
export const FORMATS = ['Best fit', 'Bullet points', 'Step-by-step', 'Table', 'JSON', 'Paragraphs'];

const wordCount = (t) => (t.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

// ---------------------------------------------------------------------------
// Code protection: fenced blocks, inline `code` and code-looking lines are never
// rewritten and are left out of wording checks (variable names are not "vague words").
// ---------------------------------------------------------------------------
const CODE_LINE = [
  /^(?: {2,}|\t)\S/,
  /[;{}]\s*$/,
  /=>|==|!=|&&|\|\||::|->/,
  /^\s*(def|class|import|from|const|let|var|function|async|export|package|func|fn|public|private|protected|static|#include|#define)\s+[\w{*]/,
  /^\s*(if|for|while|elif|switch|return|print|console\.log|echo)\s*\(/,
  /^\s*(if|for|while|elif|else|try|except|finally|def|class|with)\b.*:\s*$/,
  /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/,
  /^\s*<\/?[a-zA-Z][\w-]*(\s[^>]*)?>\s*$/,
  /^\s*[\w.$]+\s*=\s*\S/,
];
const isCodeLine = (line) => CODE_LINE.some((re) => re.test(line));

function segments(text) {
  const out = [];
  for (const block of String(text).split(/(```[\s\S]*?(?:```|$))/)) {
    if (block.startsWith('```')) { out.push({ code: true, text: block }); continue; }
    for (const line of block.split(/(\n)/)) {
      if (line === '') continue;
      if (line === '\n' || isCodeLine(line)) { out.push({ code: line !== '\n', text: line }); continue; }
      for (const part of line.split(/(`[^`\n]+`)/)) {
        if (part) out.push({ code: /^`[^`\n]+`$/.test(part), text: part });
      }
    }
  }
  return out;
}
// Apply fn to prose only; code is returned byte-for-byte. Image prompts have no code.
const mapProse = (text, fn, protect = true) => (protect ? segments(text).map((s) => (s.code ? s.text : fn(s.text))).join('') : fn(text));
// The prose of a prompt, for wording checks.
const proseOf = (text, protect = true) => (protect ? segments(text).filter((s) => !s.code).map((s) => s.text).join('') : text);

// ---------------------------------------------------------------------------
// Vague words: detection and the precise replacement the enhancer uses.
// Order matters: longer phrases first.
// ---------------------------------------------------------------------------
const VAGUE = [
  [/\ba lot of\b/gi, 'many'],
  [/\blots of\b/gi, 'many'],
  [/\ba lot\b/gi, 'significantly'],
  [/\bsomething\b/gi, 'a specific piece'],
  [/\banything\b/gi, 'every relevant point'],
  [/\bwhatever\b/gi, 'the most relevant option'],
  [/\bsome\b/gi, 'specific'],
  [/\b(stuff|things)\b/gi, 'key points'],
  [/\bthing\b/gi, 'point'],
  [/\bgood\b/gi, 'high-quality'],
  [/\bnice\b/gi, 'polished'],
  [/\bbetter\b/gi, 'stronger'],
  [/\b(cool|interesting)\b/gi, 'engaging'],
  [/\bvarious\b/gi, 'several specific'],
  [/\b(very|really|basically|kind of|sort of|maybe)\b[ \t]*/gi, ''],
  [/,?[ \t]*\b(etc\b\.?|and so on)/gi, ''],
];

export function findVague(text) {
  const found = [];
  for (const [re] of VAGUE) for (const m of text.matchAll(re)) found.push(m[0].trim().replace(/^,\s*/, ''));
  return [...new Set(found.map((w) => w.toLowerCase()))];
}

function keepCase(src, rep) {
  if (!rep) return rep;
  return src[0] && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
}

function fixVague(text) {
  let out = text;
  for (const [re, rep] of VAGUE) out = out.replace(re, (m) => keepCase(m.replace(/^,?[ \t]*/, ''), rep));
  return tidy(out);
}
// Collapse doubled spaces and spaces before punctuation, never touching line breaks.
const tidy = (s) => s.replace(/(\S)[ \t]{2,}/g, '$1 ').replace(/[ \t]+([,.;:!?])/g, '$1').replace(/!{2,}/g, '!');

// ---------------------------------------------------------------------------
// Shouting (ALL CAPS words, "!!!"): models can over-react to it.
// ---------------------------------------------------------------------------
const ACRONYMS = new Set(['JSON', 'HTML', 'HTTP', 'HTTPS', 'AIDA', 'SWOT', 'OKRS', 'NASA', 'UNESCO', 'GDPR', 'YAML', 'REST', 'CRUD', 'UTF8', 'ASAP', 'FAQS', 'GPT4', 'GPT5', 'LLMS', 'RLHF', 'BLUF', 'ELI5', 'TLDR', 'PDF', 'CSV', 'SQL', 'API', 'SEO', 'NULL', 'TRUE', 'FALSE', 'UUID', 'AJAX', 'RGBA', 'CMYK', 'SAAS', 'NVIDIA', 'IEEE', 'OAUTH']);
function shoutedWords(text) {
  return (text.match(/\b[A-Z][A-Z0-9]{3,}\b/g) || []).filter((w) => !ACRONYMS.has(w) && /[A-Z]{4}/.test(w));
}
const isShouting = (text) => shoutedWords(text).length >= 2 || /!{2,}/.test(text);
function calmDown(text) {
  return text
    .replace(/\b[A-Z][A-Z0-9]{3,}\b/g, (w) => (ACRONYMS.has(w) || !/[A-Z]{4}/.test(w) ? w : w.toLowerCase()))
    .replace(/!{2,}/g, '!');
}

// ---------------------------------------------------------------------------
// Contradictions
// ---------------------------------------------------------------------------
const TEXT_CONFLICTS = [
  { a: /\b(short|brief|concise)\b(?!-)/gi, b: /\b(detailed|in-depth|comprehensive|lengthy|exhaustive)\b(?!-)/gi, msg: 'asks for both a short and a detailed answer' },
];
const IMAGE_CONFLICTS = [
  { a: /\b(photorealistic|realistic|real photo)\b/gi, b: /\b(cartoon|anime|cartoonish|chibi)\b/gi, msg: 'mixes realistic and cartoon styles' },
  { a: /\b(daytime|sunny|noon|midday)\b/gi, b: /\b(night|nighttime|midnight)\b/gi, msg: 'mixes day and night' },
];
function conflictsIn(text, list) {
  return list.filter((c) => new RegExp(c.a.source, 'i').test(text) && new RegExp(c.b.source, 'i').test(text)).map((c) => c.msg);
}
// Remove a conflicting word together with a connector left dangling before it ("short but detailed" → "short").
const dropWords = (text, re) => text.replace(new RegExp(`(?:,?[ \\t]*\\b(?:and|but|yet|or|also|while)\\b|,)?[ \\t]*${re.source}`, 'gi'), '');

function resolveConflicts(text, list) {
  let out = text;
  for (const c of list) {
    if (new RegExp(c.a.source, 'i').test(out) && new RegExp(c.b.source, 'i').test(out)) out = dropWords(out, c.b);
  }
  return tidy(out);
}

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------
export function detectType(text) {
  if (/\b(photo|image|picture|illustration|logo|render|wallpaper|drawing|painting|poster|thumbnail|midjourney|dall-?e|stable diffusion|portrait of)\b/i.test(text)) return 'Image';
  if (/\b(code|function|bug|python|javascript|typescript|api|sql|script|error|regex|react|html|css|app|program|debug)\b/i.test(text)) return 'Code';
  if (/\b(research|study|studies|evidence|analysis|sources?|data|statistics)\b/i.test(text)) return 'Research';
  if (/\b(business|startup|marketing|sales|customers?|pricing|strategy|brand|revenue|pitch|product)\b/i.test(text)) return 'Business';
  if (/\b(learn|teach|explain|understand|tutor|course|exam|quiz)\b/i.test(text)) return 'Learning';
  return 'Writing';
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
const TEXT_STRENGTH = [
  { id: 'role', label: 'Role / persona', re: /\b(you are|act as|acting as|role:|pretend you are|imagine you are)\b/i, tip: 'Start with a role: “You are a senior …”.' },
  { id: 'task', label: 'Clear action', re: /\b(write|explain|create|list|compare|analy[sz]e|summari[sz]e|generate|design|draft|plan|build|make|give|suggest|describe|translate|fix|debug|review|rewrite|edit|outline|teach|find|calculate|recommend|brainstorm|evaluate|research|prepare|develop|convert|classify|extract|answer|help|produce|tell|show|improve|optimi[sz]e|check|identify)\b/i, tip: 'Use a clear action verb: write, compare, explain, list…' },
  { id: 'context', label: 'Goal / context', re: /\b(goal|purpose|because|so that|in order to|context|background|i('|’)m|i am|we('|’)re|we are|my|our)\b/i, tip: 'Say why you need it or what it is for.' },
  { id: 'audience', label: 'Audience', re: /\b(audience|readers?|beginners?|students?|customers?|clients?|users?|kids|children|developers?|engineers?|executives?|managers?|teachers?|parents?|investors?|followers?|viewers?|non-?technical|for (a|an|my|the) \w+)/i, tip: 'Name who it is for (e.g. “for busy parents”).' },
  { id: 'format', label: 'Output format', re: /\b(table|bullets?|bullet points?|list|json|markdown|numbered|steps?|paragraphs?|headings?|format|outline|csv|code block|email|essay|tweet|thread|caption|script|report|slides?)\b/i, tip: 'Say the shape of the answer: table, bullets, JSON, email…' },
  { id: 'length', label: 'Length / quantity', re: /(\b\d+\s*(?:[-–]|to)?\s*\d*\s*(words?|sentences?|bullets?|points?|lines?|paragraphs?|items?|ideas?|examples?|tips?|steps?|options?|characters?|pages?|slides?|questions?|minutes?|variations?|versions?|hooks?|titles?|names?)\b|\b(under|max(imum)?|at most|no more than|up to)\s+\d+|\blength\s*:)/i, tip: 'Add a number: “under 150 words”, “5 ideas”.' },
  { id: 'tone', label: 'Tone / style', re: /\b(tone|style|voice|formal|informal|friendly|professional|casual|playful|persuasive|academic|humorous|witty|empathetic|conversational|simple language|plain language)\b/i, tip: 'Set the tone: professional, friendly, playful…' },
  { id: 'constraints', label: 'Constraints', re: /\b(avoid|without|must|only|do not|don('|’)t|never|limit|constraints?|exclude|include|no more than|must not)\b/i, tip: 'Add rules: what to include, avoid or limit.' },
  { id: 'examples', label: 'Example / reference', re: /(\bfor example\b|\be\.g\.|\bexamples?\b|\bsuch as\b|\blike this\b|<example>)/i, tip: 'Give an example of what you want.' },
  { id: 'quality', label: 'Reasoning & self-check', re: /\b(step by step|step-by-step|think|reason|verify|double-check|check your|review your|assumptions?)\b/i, tip: 'Ask it to think step by step and verify its answer.' },
];

const IMAGE_STRENGTH = [
  { id: 'subject', label: 'Clear subject', test: (t) => wordCount(t) >= 4, tip: 'Describe the main subject in a few words.' },
  { id: 'style', label: 'Style / medium', re: /\b(photo|photograph|photography|illustration|painting|watercolou?r|oil|3d|render|anime|cartoon|sketch|digital art|vector|isometric|pixel art|cinematic|minimalist|realistic|photorealistic|low-poly|flat design|line art|claymation)\b/i, tip: 'Add a style: photograph, watercolour, 3D render…' },
  { id: 'setting', label: 'Setting / background', re: /\b(background|setting|environment|scene|landscape|outdoors|indoors|city|forest|studio|street|beach|room|kitchen|office|space|ocean|mountains?|garden|desert|harbou?r|caf[eé])\b/i, tip: 'Say where it is: studio, forest, city street…' },
  { id: 'lighting', label: 'Lighting', re: /\b(lighting|lit|light|golden hour|sunset|sunrise|neon|backlit|rim light|shadows?|glow|moonlight|candlelight)\b/i, tip: 'Describe the light: golden hour, soft studio light…' },
  { id: 'camera', label: 'Camera / angle', re: /\b(close-?up|wide-?angle|wide shot|macro|aerial|low angle|high angle|\d+ ?mm|lens|depth of field|bokeh|shot on|top-?down|eye level|overhead|drone)\b/i, tip: 'Add a camera angle or lens: close-up, 35mm, aerial…' },
  { id: 'composition', label: 'Composition', re: /\b(composition|rule of thirds|rule-of-thirds|centered|centred|symmetr\w*|framing|foreground|negative space|leading lines)\b/i, tip: 'Add composition: rule of thirds, centered, symmetry…' },
  { id: 'mood', label: 'Mood / colours', re: /\b(mood|atmosphere|palette|colou?rs?|vibrant|muted|pastel|moody|dramatic|warm|cool tones|serene|cozy|cosy|dreamy|monochrome|neon colou?rs)\b/i, tip: 'Set mood and colours: warm, moody, pastel palette…' },
  { id: 'detail', label: 'Detail / quality', re: /\b(detailed|high detail|8k|4k|sharp|high resolution|intricate|crisp|ultra-detailed|sharp focus)\b/i, tip: 'Add quality words: highly detailed, sharp focus.' },
  { id: 'aspect', label: 'Aspect ratio', re: /(\baspect ratio\b|\b\d+:\d+\b|--ar\b|\b(square|vertical|horizontal|landscape orientation|portrait orientation)\b)/i, tip: 'Pick a frame: aspect ratio 16:9, 9:16, square…' },
  { id: 'negative', label: 'Negative prompt', re: /(\bnegative prompt\b|--no\b|\bno text\b|\bwithout\b|\bavoid\b)/i, tip: 'Say what to exclude: blurry, watermark, text…' },
];

// Pasted material or a long multi-part prompt benefits from tags; a single clear paragraph does not.
const needsStructure = (t) => t.length > 700 || /:\s*\n\s*\S/.test(t) || t.trim().split(/\n\s*\n/).length >= 3;

function textAccuracy(text) {
  const prose = proseOf(text);
  const words = wordCount(text);
  const vague = findVague(prose);
  const conflicts = conflictsIn(prose, TEXT_CONFLICTS);
  const shouted = shoutedWords(prose);
  const detailPts = words >= 25 ? 15 : words >= 15 ? 10 : words >= 8 ? 5 : 0;
  return [
    { id: 'vague', label: 'No vague words', weight: 20, points: Math.max(0, 20 - vague.length * 5), detail: vague, tip: vague.length ? `Replace vague words: ${vague.map((w) => `“${w}”`).join(', ')}.` : '' },
    { id: 'detail', label: 'Enough detail', weight: 15, points: detailPts, tip: 'Add more detail (aim for 25+ words).' },
    { id: 'numbers', label: 'Measurable targets', weight: 10, points: /\d/.test(text) ? 10 : 0, tip: 'Include at least one number (count, length, date…).' },
    { id: 'conflicts', label: 'No contradictions', weight: 15, points: conflicts.length ? 0 : 15, detail: conflicts, tip: conflicts.length ? `Your prompt ${conflicts.join(' and ')}.` : '' },
    { id: 'facts', label: 'Fact-check guard', weight: 15, points: /\b(if (you('|’)re|you are|unsure|not sure)|don('|’)t know|do not know|cite|sources?|verify|fact-check|uncertain|say so)\b/i.test(text) ? 15 : 0, tip: 'Add: “If you are unsure, say so instead of guessing.”' },
    { id: 'clarify', label: 'Room to ask questions', weight: 10, points: /\b(clarifying questions?|ask me|ask (up to )?\d+ questions?|questions? before)\b/i.test(text) ? 10 : 0, tip: 'Add: “Ask me up to 2 clarifying questions if needed.”' },
    { id: 'delimiters', label: 'Clear structure', weight: 5, points: !needsStructure(text) || /<\/?[a-z_]+>|"""|```|^---$|^#{1,3} /im.test(text) ? 5 : 0, tip: 'Long or pasted content: wrap sections in tags like <task>…</task>.' },
    { id: 'calm', label: 'Calm wording', weight: 10, points: isShouting(prose) ? 0 : 10, detail: shouted, tip: 'Avoid ALL CAPS and “!!!”: calm instructions work better.' },
  ];
}

function imageAccuracy(text) {
  const prose = text;
  const words = wordCount(text);
  const vague = findVague(prose);
  const conflicts = conflictsIn(prose, IMAGE_CONFLICTS);
  const chatter = /\b(please|can you|could you|i want|i need|make me|generate me|create me)\b/i.test(prose);
  return [
    { id: 'vague', label: 'No vague words', weight: 25, points: Math.max(0, 25 - vague.length * 6), detail: vague, tip: vague.length ? `Replace vague words: ${vague.map((w) => `“${w}”`).join(', ')}.` : '' },
    { id: 'detail', label: 'Rich description', weight: 30, points: words >= 15 ? 30 : words >= 8 ? 15 : words >= 4 ? 5 : 0, tip: 'Image models need 15+ descriptive words.' },
    { id: 'conflicts', label: 'No contradictions', weight: 20, points: conflicts.length ? 0 : 20, detail: conflicts, tip: conflicts.length ? `Your prompt ${conflicts.join(' and ')}.` : '' },
    { id: 'chatter', label: 'Descriptive, not chatty', weight: 15, points: chatter ? 0 : 15, tip: 'Image models prefer descriptions over requests: drop “please / can you / I want”.' },
    { id: 'calm', label: 'Calm wording', weight: 10, points: isShouting(prose) ? 0 : 10, tip: 'Avoid ALL CAPS and “!!!”.' },
  ];
}

export function analyze(text, { type = 'Auto' } = {}) {
  const t = String(text || '');
  const kind = type === 'Auto' || !TYPES.includes(type) ? detectType(t) : type;
  const empty = !t.trim();
  const strengthList = (kind === 'Image' ? IMAGE_STRENGTH : TEXT_STRENGTH).map((c) => {
    const pass = !empty && (c.test ? c.test(t) : c.re.test(t));
    return { id: c.id, label: c.label, pass, weight: 10, points: pass ? 10 : 0, tip: c.tip };
  });
  const accuracyList = (empty ? [] : kind === 'Image' ? imageAccuracy(t) : textAccuracy(t)).map((c) => ({ ...c, pass: c.points === c.weight }));
  const strength = strengthList.reduce((s, c) => s + c.points, 0);
  const accuracy = empty ? 0 : accuracyList.reduce((s, c) => s + c.points, 0);
  const overall = Math.round((strength + accuracy) / 2);
  const grade = overall >= 95 ? 'Perfect' : overall >= 80 ? 'Excellent' : overall >= 60 ? 'Strong' : overall >= 40 ? 'Fair' : 'Weak';
  return { type: kind, strength, accuracy, overall, grade, strengthChecks: strengthList, accuracyChecks: accuracyList, words: wordCount(t) };
}

// ---------------------------------------------------------------------------
// Enhancer
// ---------------------------------------------------------------------------
const ROLES = {
  Writing: 'a professional writer and editor with a sharp eye for clarity',
  Code: 'a senior software engineer who writes clean, well-tested, production-ready code',
  Research: 'a meticulous research analyst who separates evidence from opinion',
  Business: 'an experienced business strategist and marketer',
  Learning: 'a patient expert tutor who explains with analogies and checks understanding',
};
const AUDIENCES = {
  Writing: 'readers who want clear, engaging content they can use right away',
  Code: 'a developer who will run and maintain this code',
  Research: 'a decision-maker who needs reliable evidence',
  Business: 'a business owner who needs practical, actionable advice',
  Learning: 'a motivated learner who is new to this topic',
};
const GOALS = {
  Writing: 'produce a polished piece that achieves the request below',
  Code: 'produce working, correct code that fulfils the request below',
  Research: 'produce an evidence-based answer to the request below',
  Business: 'produce actionable recommendations for the request below',
  Learning: 'help me understand the topic in the request below',
};
const FORMAT_LINES = {
  'Best fit': 'Use the clearest structure for this task: headings, bullet points or a table where they help.',
  'Bullet points': 'Use bullet points grouped under short headings.',
  'Step-by-step': 'Use numbered steps, one action per step.',
  Table: 'Present the core information as a markdown table, followed by a one-line takeaway.',
  JSON: 'Return only valid JSON with clear, consistent keys and no extra text.',
  Paragraphs: 'Write in well-structured paragraphs of 2–4 sentences.',
};
const LENGTH_LINES = {
  Concise: 'under 150 words',
  Medium: 'about 200–400 words',
  Detailed: 'about 600–900 words, covering every important point',
};
const TYPE_EXTRA = {
  Writing: 'Open with a strong hook and end with a clear takeaway or call to action.',
  Code: 'State assumptions, handle edge cases, and include tests or a usage example.',
  Research: 'Separate consensus from open debate and flag every claim that may be outdated.',
  Business: 'Make every recommendation concrete, with numbers or examples where possible.',
  Learning: 'Use one vivid analogy and finish with 3 questions to check my understanding.',
};

function autoLength(text) {
  if (/\b(short|brief|concise|one-liner|tweet|caption|headline|slogan|tagline)\b(?!-)/i.test(text)) return 'Concise';
  if (/\b(detailed|in-depth|comprehensive|lengthy|exhaustive|guide|report|essay|article)\b(?!-)/i.test(text)) return 'Detailed';
  return 'Medium';
}

// Strip the noise a plain request often carries, keeping its meaning.
function cleanText(raw, protect = true) {
  return mapProse(String(raw).replace(/\r/g, ''), (p) => fixVague(calmDown(p)), protect).replace(/\n{3,}/g, '\n\n').trim();
}
const resolveProse = (text, list, protect = true) => mapProse(text, (p) => resolveConflicts(p, list), protect).trim();
// Final safety pass: remove any remaining conflicting words from the prose.
function settleConflicts(text, list, protect = true) {
  let out = text;
  for (const c of list) {
    if (conflictsIn(proseOf(out, protect), [c]).length) out = mapProse(out, (p) => tidy(dropWords(p, c.b)), protect);
  }
  return out;
}

function oneLine(s, max = 160) {
  const v = cleanText(String(s || '').replace(/[\s`]+/g, ' '), false).replace(/[.\s]+$/, '');
  return v.length > max ? v.slice(0, max).replace(/\s+\S*$/, '') : v;
}

function enhanceText(raw, type, opts) {
  const task = resolveProse(cleanText(raw), TEXT_CONFLICTS) || 'Help me with my request.';
  const length = opts.length && opts.length !== 'Auto' ? opts.length : autoLength(raw);
  const audience = oneLine(opts.audience) || AUDIENCES[type];
  const goal = oneLine(opts.goal) || GOALS[type];
  const format = FORMAT_LINES[opts.format] || FORMAT_LINES['Best fit'];
  const tone = (opts.tone || 'Professional').toLowerCase();
  return `You are ${ROLES[type]}.

<context>
Goal: ${goal}, so that the result is ready to use without further edits.
Audience: ${audience}.
</context>

<task>
${task}
</task>

<format>
${format}
</format>

<guidelines>
- Tone: ${tone}.
- Length: ${LENGTH_LINES[length]}.
- ${TYPE_EXTRA[type]}
- Constraints: avoid filler, clichés and jargon the audience would not know; include only information that serves the goal.
- For example, prefer a concrete fact, number or example over a general statement.
- Think step by step before answering, then verify your answer against these instructions.
- If any fact is uncertain, say so instead of guessing, and cite sources for important claims.
- If key information is missing, ask me up to 2 clarifying questions before you answer.
</guidelines>`;
}

const IMAGE_MOODS = {
  Professional: 'clean, premium mood with a refined colour palette',
  Friendly: 'warm, inviting mood with a soft colour palette',
  Persuasive: 'bold, dramatic mood with a vibrant colour palette',
  Playful: 'whimsical, vibrant mood with a bright colour palette',
  Academic: 'calm, precise mood with a neutral colour palette',
  'Simple (ELI5)': 'clear, friendly mood with a simple colour palette',
};

function enhanceImage(raw, opts) {
  let subject = String(raw)
    .replace(/\b(please|kindly)\b[,]?\s*/gi, '')
    .replace(/\b(can|could|would) you\s+/gi, '')
    .replace(/\bi (want|need|would like)( you)?( to)?\s*/gi, '')
    .replace(/\b(make|generate|create) me\b/gi, '$1')
    .replace(/^\s*(create|generate|make|draw|design|render|produce)\s+(an?\s+)?(image|picture|photo|illustration|drawing|painting|render)?\s*(of\s+)?/i, '')
    .replace(/[?]+/g, '')
    .replace(/\s*\n+\s*/g, ', ');
  subject = resolveProse(cleanText(subject, false), IMAGE_CONFLICTS, false)
    .replace(/\b(please|can you|could you|i want|i need|make me|generate me|create me)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
  if (wordCount(subject) < 2) subject = `a striking scene of ${subject || 'the main subject'}`;

  const has = (id) => {
    const c = IMAGE_STRENGTH.find((x) => x.id === id);
    return c.re ? c.re.test(subject) : c.test(subject);
  };
  const night = /\b(night|nighttime|midnight|dark)\b/i.test(subject);
  const parts = [subject];
  if (!has('style')) parts.push('cinematic photograph');
  if (!has('setting')) parts.push('set against a detailed, atmospheric background');
  if (!has('lighting')) parts.push(night ? 'moody neon and moonlight lighting' : 'soft golden-hour lighting');
  if (!has('camera')) parts.push('shot on a 35mm lens with shallow depth of field');
  if (!has('composition')) parts.push('rule-of-thirds composition');
  if (!has('mood')) parts.push(IMAGE_MOODS[opts.tone] || IMAGE_MOODS.Professional);
  parts.push('highly detailed, sharp focus');
  if (!has('aspect')) parts.push('aspect ratio 16:9');
  let out = parts.join(', ');
  if (!has('negative')) out += '\n\nNegative prompt: blurry, low quality, distorted anatomy, watermark, text artifacts';
  return out;
}

// Returns { text, type }. The result scores 100 / 100 with analyze(text, { type }).
export function enhance(raw, opts = {}) {
  const input = String(raw || '').trim();
  const type = !opts.type || opts.type === 'Auto' || !TYPES.includes(opts.type) ? detectType(input) : opts.type;
  const built = type === 'Image' ? enhanceImage(input, opts) : enhanceText(input, type, opts);
  return { text: finalize(built, type), type };
}

const CHATTER = /\b(please|can you|could you|i want|i need|make me|generate me|create me)\b/gi;

// Re-check the finished prompt with the same rules analyze() uses and clean again until
// nothing is left. Removing a word can create a new word boundary, so one pass is not enough.
function finalize(text, type) {
  const image = type === 'Image';
  const protect = !image;
  const list = image ? IMAGE_CONFLICTS : TEXT_CONFLICTS;
  let out = text;
  for (let i = 0; i < 8; i++) {
    const prose = proseOf(out, protect);
    const dirty = findVague(prose).length || isShouting(prose) || conflictsIn(prose, list).length || (image && new RegExp(CHATTER.source, 'i').test(prose));
    if (!dirty) break;
    out = mapProse(out, (p) => {
      let v = fixVague(calmDown(p));
      if (image) v = tidy(v.replace(CHATTER, ''));
      return v;
    }, protect);
    out = settleConflicts(out, list, protect);
  }
  return out;
}
