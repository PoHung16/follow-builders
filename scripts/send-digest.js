#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const PROMPTS_BASE = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/prompts';

const TO_EMAIL = process.env.TO_EMAIL || 'pohung0413@gmail.com';
const LANGUAGE = process.env.LANGUAGE || 'bilingual';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }
if (!RESEND_API_KEY) { console.error('Missing RESEND_API_KEY'); process.exit(1); }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

async function main() {
  console.log('Fetching feeds...');
  const [feedX, feedPodcasts, promptTweets, promptPodcast, promptIntro, promptTranslate] = await Promise.all([
    fetchJSON(FEED_X_URL),
    fetchJSON(FEED_PODCASTS_URL),
    fetchText(`${PROMPTS_BASE}/summarize-tweets.md`),
    fetchText(`${PROMPTS_BASE}/summarize-podcast.md`),
    fetchText(`${PROMPTS_BASE}/digest-intro.md`),
    fetchText(`${PROMPTS_BASE}/translate.md`),
  ]);

  const xBuilders = feedX.x || [];
  const podcasts = feedPodcasts.podcasts || [];

  if (xBuilders.length === 0 && podcasts.length === 0) {
    console.log('No content today, skipping.');
    return;
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const systemPrompt = `You are an AI content curator assembling a daily digest of what top AI builders are saying and building.\n\n${promptIntro}\n\n${promptTweets}\n\n${promptPodcast}\n\n${LANGUAGE === 'bilingual' || LANGUAGE === 'zh' ? promptTranslate : ''}\n\nLanguage setting: ${LANGUAGE}\n- "en": entire digest in English\n- "zh": entire digest in Chinese\n- "bilingual": interleave English and Chinese paragraph by paragraph — after each builder's English summary, place the Chinese translation directly below, then move to the next builder. Do NOT output all English first.\n\nToday's date: ${today}`;

  const userPrompt = `Here is today's feed data. Remix it into a digest following all the instructions above.\n\nX/TWITTER BUILDERS:\n${JSON.stringify(xBuilders, null, 2)}\n\nPODCASTS:\n${JSON.stringify(podcasts, null, 2)}`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const digest = message.content[0].text;
  console.log('Digest generated. Sending email...');

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'AI Builders Digest <onboarding@resend.dev>',
      to: [TO_EMAIL],
      subject: `AI Builders Digest — ${today}`,
      text: digest,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  const result = await emailRes.json();
  console.log(`Email sent! ID: ${result.id}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
