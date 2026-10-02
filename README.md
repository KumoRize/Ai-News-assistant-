<p align="center"><img src="assets/icons/icon-192.png" width="96" alt="PromptPulse logo"></p>

<h1 align="center">PromptPulse ⚡</h1>
<p align="center"><b>Your personal AI agent for daily AI news, pro prompting skills and fresh keywords, with notifications on your phone.</b></p>

---

## ✨ Features

| | |
|---|---|
| 📰 **Daily AI news** | 13 AI news sources (TechCrunch, The Verge, MIT Tech Review, Wired, Ars Technica, OpenAI, Google DeepMind, Hugging Face…) plus Hacker News. Refreshed every hour, auto-tagged (LLMs, Agents, Coding, Research, Business, Policy, Chips…), searchable, with bookmarks and sharing |
| ✨ **Explain with AI** | One tap turns any story into a ready-made prompt for Claude or ChatGPT |
| 🎓 **30 prompting lessons** | A learning path from Beginner to Expert: few-shot, chain-of-thought, XML tags, chaining, system prompts, agents, evals, prompt injection, context engineering… |
| 🔑 **Keyword of the day** | 5 new power words every day from a 90+ keyword bank, on flip cards |
| 🧠 **Daily quiz & 🎯 challenge** | New questions and a hands-on challenge every day |
| 🩺 **Prompt Checker** | Scores any prompt for **Strength** (10 checks: role, task, goal, audience, format, length, tone, constraints, example, self-check) and **Accuracy** (vague words, detail, numbers, contradictions, fact-check guard, clarifying questions, structure, calm wording), shows every check with a fix, and **⚡ Enhance to 100%** rewrites it. It has a separate rubric for image prompts and never alters pasted code |
| 🧪 **Prompt Lab** | 10 pro templates and saved prompts that open in Claude or ChatGPT |
| 👤 **Profile** | Name, avatar, skill level, interests, XP and levels, streaks and 13 badges. Stored privately on your device, with export and import |
| 🔔 **Phone notifications** | A daily briefing at your chosen time (top headline plus keyword of the day) |
| 🎨 **Neon Cyber design** | Animated splash, glass cards, confetti, pop-ups, level-ups and synthesised sound effects (toggle in Settings) |
| 📲 **Installable app (PWA)** | Add to Home Screen and it runs full-screen and works offline |

## 🚀 Setup (one time, ~10 minutes)

### 1. Put the site online (GitHub Pages)
1. Make sure the code is on the **`main`** branch and that `main` is the repo's default branch.
2. GitHub Pages is free for **public** repos. A private repo needs GitHub Pro. To switch, go to **Settings → General → Danger Zone → Change visibility**.
3. **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
4. **Actions** tab → *PromptPulse - news, deploy & notify* → **Run workflow**.
   Your site goes live at `https://<your-username>.github.io/<repo-name>/`.

### 2. Turn on phone notifications
1. Open the site on your phone and install it:
   - **Android (Chrome):** ⋮ menu → *Install app*.
   - **iPhone (Safari, iOS 16.4+):** Share → *Add to Home Screen*, then open it from the Home Screen.
2. In the app: **Profile → 🔐 Generate keys**. Your phone creates the key pair, so nobody else ever sees the secret.
   - Save the **secret key** as a repository **secret** named `VAPID_PRIVATE_KEY`.
   - Save the **public key** as a repository **variable** (Variables tab) named `VAPID_PUBLIC_KEY`.
3. Back in the app: **🔔 Enable notifications → Copy device code**. Save it as a secret named `PUSH_SUBSCRIPTIONS`. For several devices, put one code per line.
4. Test it: **Actions → Run workflow → tick "Send a test notification"**. 🎉

The workflow runs every hour. Each device gets its briefing once a day, in the hour you picked in the app.
If you change the notification time, copy the new device code into the secret.

Optional: add a repository **variable** `SITE_URL` (your Pages URL) so tapping a notification always opens the right page.

## 🛠️ Local development

```bash
npm install
npm run news    # fetch the latest news into data/news.json
npm start       # http://localhost:8080
npm test        # prompt checker test suite
```

## 📁 Structure

```
index.html              App shell (splash, nav, views)
manifest.webmanifest    PWA manifest
sw.js                   Service worker: offline cache, push, background sync
assets/css/style.css    Neon Cyber theme and animations
assets/js/app.js        Router, screens, pop-ups, Lab, notifications
assets/js/content.js    Lessons, keywords, quiz, challenges, templates
assets/js/promptcheck.js Prompt Checker: scoring and enhancing (pure, unit-tested)
assets/js/daily.js      Date-seeded "of the day" picks (shared with the push script)
assets/js/store.js      On-device profile, XP, streaks, badges
assets/js/sound.js      Web Audio sound effects
scripts/fetch-news.mjs  RSS/Atom and Hacker News collector
scripts/send-push.mjs   Daily Web Push sender
.github/workflows/      Hourly news → deploy → notify
```

Your profile and progress never leave your device. The repo only stores the push device code you add as a secret.
