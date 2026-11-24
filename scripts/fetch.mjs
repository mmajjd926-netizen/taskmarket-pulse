// Fetches Taskmarket's public market data on the server and writes one snapshot.
// No keys, no browser calls: the page only ever reads the JSON this script writes.
// Usage: node scripts/fetch.mjs [outFile]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { derive } from './derive.mjs';
import { completedDetails } from './details.mjs';

export const API = process.env.TASKMARKET_API || 'https://api.taskmarket.dev';
export const CHAINS = [
  { id: 4217, key: 'tempo', name: 'Tempo', token: 'OUSD' },
  { id: 8453, key: 'base', name: 'Base', token: 'USDC' },
];
const RANGES = ['7d', '30d', '90d', 'all'];
const HEAT_RANGES = ['7d', '30d', '90d'];
const FEED_PAGES = 4; // 4 x 50 newest events per chain
const MAX_TASK_PAGES = 200; // safety stop, 100 tasks per page

async function get(path, tries = 4) {
  const url = API + path;
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'taskmarket-pulse (+github)' }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) {
        const wait = Math.min(60, Number(r.headers.get('retry-after')) || 5 * i);
        if (i >= tries + 2) throw new Error('429 Too Many Requests');
        await new Promise((res) => setTimeout(res, wait * 1000));
        continue;
      }
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw new Error(`GET ${path} failed: ${e.message}`);
      await new Promise((res) => setTimeout(res, 800 * i * i));
    }
  }
}

async function chainSnapshot(c) {
  const q = `chainId=${c.id}`;
  const [stats, breakdowns] = await Promise.all([
    get(`/api/market/stats?${q}`),
    get(`/api/stats/breakdowns?${q}`),
  ]);
  const series = {};
  for (const r of RANGES) {
    const bucket = r === 'all' ? 'week' : 'day';
    series[r] = { bucket, rows: await get(`/api/stats/platform-time-series?${q}&range=${r}&bucket=${bucket}`) };
  }
  const heatmap = { hourOfWeek: {}, mode: {} };
  for (const r of HEAT_RANGES) {
    heatmap.hourOfWeek[r] = await get(`/api/stats/activity-heatmap?${q}&range=${r}&dimension=hourOfWeek`);
    heatmap.mode[r] = await get(`/api/stats/activity-heatmap?${q}&range=${r}&dimension=mode`);
  }
  const feed = [];
  let cursor = null;
  for (let p = 0; p < FEED_PAGES; p++) {
    const d = await get(`/api/stats/activity-feed?${q}&limit=50` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    feed.push(...d.items);
    cursor = d.nextCursor;
    if (!cursor || !d.items.length) break;
  }
  const tasks = [];
  cursor = null;
  for (let p = 0; p < MAX_TASK_PAGES; p++) {
    const d = await get(`/api/tasks?${q}&sort=newest&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    tasks.push(...d.tasks);
    cursor = d.nextCursor;
    if (!cursor || !d.hasMore || !d.tasks.length) break;
  }
  // Keep only the task fields the page uses (smaller payload, nothing personal beyond public addresses).
  const slim = tasks.map((t) => ({
    id: t.id, ref: t.referenceCode, requester: (t.requester || '').toLowerCase(), requesterName: t.requesterDisplayName || null,
    requesterType: t.requesterActorType || null, reward: t.reward, createdAt: t.createdAt, expiryTime: t.expiryTime,
    status: t.status, mode: t.mode, subs: t.submissionCount || 0, awards: t.awardCount || 0,
    winner: t.primaryAward?.workerAddress ? t.primaryAward.workerAddress.toLowerCase() : null,
    claimedBy: t.claimedBy ? String(t.claimedBy).toLowerCase() : null,
    open: !!t.submissionWindowOpen, phase: t.phase || null,
    title: String(t.description || '').split('\n')[0].slice(0, 140),
  }));
  const det = await completedDetails(c.key, slim, get);
  console.log(`${c.name}: details for ${det.cached} of ${det.completed} completed tasks (${det.fetched} fetched now, ${det.failed} failed)`);
  return { ...c, stats, breakdowns, series, heatmap, feed: feed.filter((f) => !f.chainId || f.chainId === c.id), tasks: slim,
    details: det.details, detailsMeta: { cached: det.cached, completed: det.completed } };
}

export async function fetchSnapshot() {
  const startedAt = new Date().toISOString();
  const chains = [];
  for (const c of CHAINS) chains.push(await chainSnapshot(c));
  const asOf = new Date().toISOString();
  const snap = { asOf, startedAt, api: API, chains };
  snap.derived = Object.fromEntries(chains.map((c) => [c.key, derive(c, asOf)]));
  return snap;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || 'data/snapshot.json';
  const snap = await fetchSnapshot();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(snap));
  console.log(`snapshot ${snap.asOf}: ` + snap.chains.map((c) => `${c.name} ${c.tasks.length} tasks, ${c.feed.length} events`).join('; '));
}
