// Per-task detail for completed tasks: awards (who was paid, how much, when) and entry times.
// A completed task no longer changes, so each one is fetched once and kept in data/cache/.
// Usage inside fetch.mjs: await completedDetails(chain, tasks, get)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_DIR = process.env.PULSE_CACHE || 'data/cache';
const MAX_NEW = Number(process.env.PULSE_MAX_NEW_DETAILS || 120); // politeness cap per build
const CONCURRENCY = 2;
const SEED_DIR = new URL('../seed/', import.meta.url).pathname; // committed snapshot of finished tasks, so a fresh deploy starts warm

export async function completedDetails(chainKey, tasks, get) {
  const file = join(CACHE_DIR, `details-${chainKey}.json`);
  let cache = {};
  try { cache = JSON.parse(await readFile(join(SEED_DIR, `details-${chainKey}.json`), 'utf8')); } catch { /* no seed */ }
  try { Object.assign(cache, JSON.parse(await readFile(file, 'utf8'))); } catch { /* first run */ }
  const done = tasks.filter((t) => t.status === 'completed').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todo = done.filter((t) => !cache[t.id]).slice(0, MAX_NEW);
  let i = 0, failed = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      try {
        const [d, subs] = await Promise.all([get(`/api/tasks/${t.id}`), get(`/api/tasks/${t.id}/submissions`)]);
        const created = new Date(d.createdAt).getTime();
        const subTimes = new Map(subs.map((s) => [s.id, new Date(s.submittedAt).getTime()]));
        const offsets = subs.map((s) => Math.round((new Date(s.submittedAt).getTime() - created) / 1000)).sort((a, b) => a - b);
        cache[t.id] = {
          c: d.createdAt,
          // [worker, payment (base units), settledAt, seconds from posting to the winning entry]
          a: (d.awards || []).map((a) => [String(a.workerAddress).toLowerCase(), a.workerPayment || a.grossAmount || '0', a.settledAt || null,
            subTimes.has(a.submissionId) ? Math.round((subTimes.get(a.submissionId) - created) / 1000) : null]),
          s: offsets, // seconds from posting to each entry
        };
      } catch { failed++; }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(cache));
  const out = {};
  for (const t of done) if (cache[t.id]) out[t.id] = cache[t.id];
  return { details: out, fetched: todo.length - failed, failed, cached: Object.keys(out).length, completed: done.length };
}
