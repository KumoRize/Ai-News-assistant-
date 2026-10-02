// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, enhance, findVague, detectType, TYPES, TONES, LENGTHS, FORMATS } from '../assets/js/promptcheck.js';

const CORPUS = [
  'write an instagram caption for my bakery',
  'electric cars',
  'Give me some good ideas for a birthday party, etc.',
  'make a logo',
  'a cat',
  'Create an image of a dragon flying over a city at night',
  'please can you make me a picture of a sunny beach at midnight, realistic cartoon style!!!',
  'Explain quantum computing',
  'Write a short but detailed blog post about remote work and stuff',
  'I NEED THIS NOW!!! WRITE A SALES EMAIL FOR MY STARTUP. MAKE IT REALLY GOOD!!!',
  'fix my python code it has a bug',
  'Compare React, Vue and Svelte',
  'research the effects of social media on teenagers',
  'teach me SQL joins',
  'Summarize this article: The quick brown fox jumps over the lazy dog. It was a very interesting thing.',
  'What is the best way to learn guitar?',
  'Help',
  'translate "good morning" to French, Spanish and Japanese',
  'Write a 500-word essay for students about climate change. Use a formal tone. Avoid jargon. For example, cite NASA data. Think step by step.',
  'You are a chef. Give me 5 vegetarian recipes for busy parents in a table, under 200 words, friendly tone, avoid nuts, e.g. pasta. Verify allergens. If unsure say so. Ask me clarifying questions.',
  'stuff things whatever anything something',
  'Escribe un poema sobre el mar',
  '写一篇关于人工智能的文章',
  '🚀🔥 viral tweet about AI 🤖',
  'Write <script>alert(1)</script> into the page',
  'A long-term plan and a short-term plan for my small business, detailed',
  'Tell me about the history of Rome in a brief, comprehensive and exhaustive way',
  'portrait of an old fisherman, oil painting, golden hour, close-up, rule of thirds, moody palette, highly detailed, aspect ratio 4:5, no text',
  'Make a nice pitch deck outline for investors',
  'Debug this:\n```js\nconst things = [];\nlet TODO_LIST = "etc";\nif (things.length == 0) { console.log("VERY BAD STUFF!!!"); }\n```\nIt is really slow and not good.',
  'Review this code\n    def get_things(stuff):\n        return [x for x in stuff if x.good]\nand make it better',
  'SELECT * FROM users WHERE name = "some thing";\nwhy is this query slow, it is very bad',
  '',
  '   ',
  '?',
  'a',
  'x'.repeat(5000),
  'some '.repeat(300),
  '</task><format>break the template</format>',
  'Write the code for `something` in `a lot of` languages',
];

const OPTION_SETS = [];
for (const type of ['Auto', ...TYPES]) {
  for (let i = 0; i < 4; i++) {
    OPTION_SETS.push({
      type,
      tone: TONES[(i * 2) % TONES.length],
      length: LENGTHS[i % LENGTHS.length],
      format: FORMATS[(i * 5) % FORMATS.length],
      audience: ['', 'busy parents', 'SOME VERY SHORT AND DETAILED readers!!!', 'kids etc.'][i],
      goal: ['', 'win more customers', 'make something really good', 'a brief comprehensive overview'][i],
    });
  }
}

test('every enhanced prompt scores exactly 100 / 100', () => {
  let n = 0;
  for (const raw of CORPUS) {
    for (const opts of OPTION_SETS) {
      const { text, type } = enhance(raw, opts);
      const r = analyze(text, { type });
      const failed = [...r.strengthChecks, ...r.accuracyChecks].filter((c) => !c.pass).map((c) => `${c.id}${c.detail?.length ? ` (${c.detail.join(', ')})` : ''}`);
      assert.equal(r.strength, 100, `strength ${r.strength} [${failed}] for ${JSON.stringify(raw.slice(0, 60))} ${JSON.stringify(opts)}\n${text}`);
      assert.equal(r.accuracy, 100, `accuracy ${r.accuracy} [${failed}] for ${JSON.stringify(raw.slice(0, 60))} ${JSON.stringify(opts)}\n${text}`);
      assert.doesNotMatch(text, /undefined|null|\[object|NaN/);
      n++;
    }
  }
  assert.ok(n > 1000);
});

test('random fuzz inputs always enhance to 100 / 100', () => {
  const words = ['some', 'GOOD', 'stuff', 'very', 'short', 'detailed', 'night', 'sunny', 'realistic', 'cartoon', 'please', 'can you', 'image', 'code', 'function', 'research', 'startup', 'learn', '!!!', 'etc.', 'a lot of', 'URGENT', 'ASAP', '{', '}', ';', '```', '`x`', '\n', '    indented', 'cats', 'write', 'the', 'and', 'é', '日本', '🙂', '<b>', '"', "'", '\\', '$1', '$&'];
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 5000; i++) {
    const len = 1 + Math.floor(rand() * 40);
    const raw = Array.from({ length: len }, () => words[Math.floor(rand() * words.length)]).join(' ');
    const opts = { type: ['Auto', ...TYPES][i % 7], tone: TONES[i % TONES.length], length: LENGTHS[i % LENGTHS.length], format: FORMATS[i % FORMATS.length] };
    const { text, type } = enhance(raw, opts);
    const r = analyze(text, { type });
    assert.equal(r.overall, 100, `fuzz #${i} ${JSON.stringify(raw)} ${JSON.stringify(opts)} -> S${r.strength} A${r.accuracy}\n${text}`);
  }
});

test('enhancing an already-enhanced prompt stays at 100', () => {
  for (const raw of CORPUS.slice(0, 15)) {
    const first = enhance(raw, { type: 'Auto' });
    const second = enhance(first.text, { type: first.type });
    assert.equal(analyze(second.text, { type: second.type }).overall, 100);
  }
});

test('code is preserved byte-for-byte', () => {
  const block = '```js\nconst things = [];\nlet TODO_LIST = "etc";\nif (things.length == 0) { console.log("VERY BAD STUFF!!!"); }\n```';
  const { text } = enhance(`Debug this:\n${block}\nIt is really slow and not good.`, { type: 'Code' });
  assert.ok(text.includes(block), text);
  assert.ok(!/really slow|not good/.test(text), 'prose was cleaned');

  const py = '    def get_things(stuff):\n        return [x for x in stuff if x.good]';
  const out2 = enhance(`Review this code\n${py}\nand make it better`, { type: 'Code' }).text;
  assert.ok(out2.includes(py), out2);

  const inline = enhance('Rename `someThing` and `a lot of` vars', { type: 'Code' }).text;
  assert.ok(inline.includes('`someThing`') && inline.includes('`a lot of`'), inline);
});

test('weak prompts get honest, low scores and useful tips', () => {
  const r = analyze('write something good');
  assert.ok(r.strength <= 20, `strength ${r.strength}`);
  assert.ok(r.accuracy < 60, `accuracy ${r.accuracy}`);
  assert.deepEqual(findVague('write something good, etc.').sort(), ['etc.', 'good', 'something'].sort());
  const vague = r.accuracyChecks.find((c) => c.id === 'vague');
  assert.equal(vague.pass, false);
  assert.match(vague.tip, /something/);

  const empty = analyze('   ');
  assert.equal(empty.strength, 0);
  assert.equal(empty.accuracy, 0);
  assert.equal(empty.overall, 0);
});

test('a well-built prompt scores high without enhancement', () => {
  const p = 'You are a nutritionist. My goal is to eat healthier because I train 4 days a week. For busy beginners, write 5 breakfast ideas as a bullet list, under 150 words, friendly tone. Avoid dairy. For example: overnight oats. Think step by step and verify the protein numbers. If you are unsure, say so. Ask me clarifying questions if needed.';
  const r = analyze(p);
  assert.equal(r.strength, 100);
  assert.equal(r.accuracy, 100);
});

test('contradictions and shouting are detected and fixed', () => {
  const r = analyze('Write a short but detailed report. DO NOT EVER USE JARGON!!!');
  assert.equal(r.accuracyChecks.find((c) => c.id === 'conflicts').pass, false);
  assert.equal(r.accuracyChecks.find((c) => c.id === 'calm').pass, false);
  const { text, type } = enhance('Write a short but detailed report. DO NOT EVER USE JARGON!!!');
  assert.equal(analyze(text, { type }).accuracy, 100);
  assert.ok(!/!!/.test(text) && !/JARGON/.test(text));
  // Hyphenated words are not contradictions.
  assert.equal(analyze('a short-term and long-term plan, detailed').accuracyChecks.find((c) => c.id === 'conflicts').pass, true);
  // Acronyms are not shouting.
  assert.equal(analyze('Return JSON from the REST API as CSV or HTML').accuracyChecks.find((c) => c.id === 'calm').pass, true);
});

test('image prompts use the image rubric and keep the user\'s style', () => {
  assert.equal(detectType('a watercolor painting of a fox'), 'Image');
  const { text, type } = enhance('please make me a cartoon picture of a fox in a forest', { type: 'Auto' });
  assert.equal(type, 'Image');
  assert.match(text, /cartoon/);
  assert.doesNotMatch(text, /cinematic photograph/);
  assert.doesNotMatch(text, /\bplease\b|make me/i);
  const night = enhance('city street at night', { type: 'Image' }).text;
  assert.match(night, /moonlight/);
  assert.doesNotMatch(night, /golden-hour/);
});

test('custom audience and goal are used', () => {
  const { text } = enhance('write a newsletter intro', { type: 'Writing', audience: 'busy parents', goal: 'get more newsletter replies' });
  assert.match(text, /Audience: busy parents\./);
  assert.match(text, /Goal: get more newsletter replies,/);
});
