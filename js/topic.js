// Topic of the week: data/topic.json lives in this repo (Claude updates it when a new topic is
// picked). The fact of the day rotates by date; "watched" ticks are saved in this browser only.
import { fetchJson } from './http.js';
import { esc } from './ui.js';

export const TOPIC_URL = 'data/topic.json';
const WATCHED_KEY = 'topicWatched';
const DAY_MS = 86400000;

export function parseTopic(json) {
  const { topic, start, facts, videos } = json ?? {};
  if (typeof topic !== 'string' || !topic) throw new Error('topic.json: "topic" missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '')) throw new Error('topic.json: "start" must be YYYY-MM-DD');
  if (!Array.isArray(facts) || facts.length === 0) throw new Error('topic.json: "facts" must be a non-empty list');
  if (!Array.isArray(videos) || videos.some((v) => !v.title || !/^https:\/\//.test(v.url ?? ''))) {
    throw new Error('topic.json: every video needs a title and an https url');
  }
  return { topic, start: new Date(`${start}T00:00:00Z`), facts, videos };
}

export async function loadTopic() {
  return parseTopic(await fetchJson(TOPIC_URL));
}

// Day 1 of the topic shows fact 1, day 2 fact 2, ... and wraps around.
export function dayOfTopic(start, now) {
  return Math.floor((now - start) / DAY_MS) + 1;
}

export function factOfDay(t, now) {
  const day = Math.max(1, dayOfTopic(t.start, now));
  return t.facts[(day - 1) % t.facts.length];
}

// Watched videos are stored per topic as a list of urls.
export function readWatched(topic) {
  const all = JSON.parse(localStorage.getItem(WATCHED_KEY) ?? '{}');
  return new Set(all[topic] ?? []);
}

export function toggleWatched(topic, url) {
  const all = JSON.parse(localStorage.getItem(WATCHED_KEY) ?? '{}');
  const set = new Set(all[topic] ?? []);
  if (set.has(url)) set.delete(url); else set.add(url);
  all[topic] = [...set];
  localStorage.setItem(WATCHED_KEY, JSON.stringify(all));
}

export function renderTopic(t, watched, now) {
  const done = t.videos.filter((v) => watched.has(v.url)).length;
  const pct = Math.round((done / t.videos.length) * 100);
  const day = dayOfTopic(t.start, now);
  return `
    <div class="topic-title">${esc(t.topic)}</div>
    <div class="dim">day ${Math.max(1, day)} of 7</div>
    <h3>FACT OF THE DAY</h3>
    <p class="fact">${esc(factOfDay(t, now))}</p>
    <h3>WATCH LIST · ${done}/${t.videos.length}</h3>
    <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
    <ul class="videos">${t.videos.map((v) => `
      <li><label><input type="checkbox" data-url="${esc(v.url)}"${watched.has(v.url) ? ' checked' : ''}>
        <a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a> <span class="dim">${esc(v.by ?? '')}</span></label></li>`).join('')}
    </ul>`;
}
