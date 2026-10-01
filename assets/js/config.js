// PromptPulse configuration.
// VAPID_PUBLIC_KEY is the *public* half of the Web Push key pair. It is safe to publish.
// Easiest setup: in the app, Profile → Generate keys. Save the secret half as the GitHub secret
// VAPID_PRIVATE_KEY and the public half as the repo variable VAPID_PUBLIC_KEY; the workflow
// then injects it here at deploy time.
export const CONFIG = {
  APP_NAME: 'PromptPulse',
  // GitHub repo that runs the daily news + notification workflow (used for setup links).
  REPO: 'KumoRize/Ai-News-assistant-',
  VAPID_PUBLIC_KEY: 'BBcblpfQTcw7ShKuFYFAm7vsfw19My-ZpILmaF0QqCII_TOqpsZrdhvqBdyVNiuiPQa9jIII9AlhaIduvxEVOOQ',
  NEWS_URL: 'data/news.json',
  // Live fallback/extra source that allows browser requests (CORS-enabled).
  LIVE_NEWS_URL: 'https://hn.algolia.com/api/v1/search',
  LIVE_QUERIES: ['AI', 'LLM', 'OpenAI', 'Anthropic', 'Claude', 'Gemini', 'GPT'],
};
