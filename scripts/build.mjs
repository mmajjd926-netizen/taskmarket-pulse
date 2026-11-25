// Builds the static site in dist/ from a snapshot.
// Usage: node scripts/build.mjs [--fetch] [--out dist] [--base https://example.com/path/]
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchSnapshot } from './fetch.mjs';
import { derive, units } from './derive.mjs';
import { renderCards } from './og.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = join(ROOT, opt('--out', 'dist'));
const BASE = (opt('--base', process.env.SITE_URL || '') || '').replace(/\/?$/, '/');
const REPO = process.env.REPO_URL || 'https://github.com/mmajjd926-netizen/taskmarket-pulse';

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => (Math.abs(n) >= 100 ? fmt(n, 0) : fmt(n, 2));
const pct = (x) => fmt(x * 100, 0) + '%';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function close(a, b, tol = 0.02) { return Math.abs(a - b) <= Math.max(1, Math.abs(a) * tol); }
function sameSeries(a, b) {
  const ra = a['30d'].rows.slice(0, -1), rb = b['30d'].rows.slice(0, -1);
  return ra.length === rb.length && ra.every((r, i) => r.bucket === rb[i].bucket && r.tasksCreated === rb[i].tasksCreated && r.rewardVolume === rb[i].rewardVolume);
}
const tot = (cells) => cells.reduce((s, c) => s + c.count, 0);
function sameHeat(a, b) { return close(tot(a.mode['90d'].cells), tot(b.mode['90d'].cells)) && a.mode['90d'].rowKeys.join() === b.mode['90d'].rowKeys.join(); }
function sameBreak(a, b) { const s = (x) => x.mode.reduce((t, m) => t + m.count, 0); return close(s(a), s(b)) && a.mode.length === b.mode.length; }
function sameFeed(a, b) { const ids = new Set(a.slice(0, 30).map((x) => x.timestamp + x.actor)); return b.slice(0, 30).filter((x) => ids.has(x.timestamp + x.actor)).length >= 15; }

function insights(snap, platformSame) {
  const [T, B] = snap.chains; // tempo, base
  const dT = snap.derived.tempo, dB = snap.derived.base;
  const g = dT.growth; // platform-wide when the series endpoint is shared
  const scope = platformSame ? 'both chains' : 'Tempo';
  const out = [];
  const ch = (x) => (x == null ? 'n/a' : (x >= 0 ? '+' : '−') + fmt(Math.abs(x) * 100, 0) + '%');
  out.push({ big: ch(g.rewardVolume.change), text: `Rewards put up in the last 7 full days: ${money(g.rewardVolume.last)} (OUSD + USDC), against ${money(g.rewardVolume.prev)} the week before (${scope}).`, source: `platform-time-series 30d, ${g.window.from} to ${g.window.to} vs ${g.window.prevFrom} to ${g.window.prevTo}` });
  out.push({ big: ch(g.paidVolume.change), text: `Rewards paid out in the same 7 days: ${money(g.paidVolume.last)}, against ${money(g.paidVolume.prev)}. ${fmt(g.tasksCreated.last)} tasks were posted (${ch(g.tasksCreated.change)}).`, source: 'platform-time-series 30d, paidVolume and tasksCreated' });
  out.push({ big: pct(dT.concentration.top5), text: `of the rewards in the Tempo task list were put up by just 5 of its ${fmt(dT.concentration.posters)} posters. The biggest one alone: ${pct(dT.concentration.top1)}. On Base the top 5 hold ${pct(dB.concentration.top5)} of ${fmt(dB.concentration.posters)} posters.`, source: 'tasks list, reward summed by requester' });
  const lastW = (d) => d.postersPerWeek[d.postersPerWeek.length - 1] || { posters: 0, week: '' };
  const peakW = (d) => d.postersPerWeek.reduce((m, x) => (x.posters > m.posters ? x : m), { posters: 0, week: '' });
  out.push({ big: `${lastW(dT).posters} vs ${lastW(dB).posters}`, text: `distinct posters this week on Tempo vs Base. Base peaked at ${peakW(dB).posters} posters in the week of ${peakW(dB).week}; Tempo peaked at ${peakW(dT).posters} in the week of ${peakW(dT).week}. Posting has moved to Tempo.`, source: 'tasks list, distinct requester per Monday-start UTC week' });
  out.push({ big: fmt(dT.competition.medianEntries), text: `entries on the median completed Tempo bounty, so each entry stands to win about ${money(dT.competition.medianPerEntry)} OUSD of reward. On Base the median is ${fmt(dB.competition.medianEntries)} entries (${money(dB.competition.medianPerEntry)} USDC each).`, source: 'tasks list, completed bounties: submissionCount and reward / submissionCount' });
  const share = (d, c) => d.died / Math.max(1, Object.values(d.status).reduce((s, v) => s + v, 0));
  out.push({ big: pct(share(dB)), text: `of Base tasks in the list expired or were cancelled (${fmt(dB.died)} tasks, ${money(dB.diedReward)} USDC of reward that went back to posters). On Tempo it is ${pct(share(dT))} (${fmt(dT.died)} tasks).`, source: 'tasks list, status expired + cancelled' });
  const ft = (k) => ({ n: (dT.firstTask?.[k]?.n || 0) + (dB.firstTask?.[k]?.n || 0), again: (dT.firstTask?.[k]?.again || 0) + (dB.firstTask?.[k]?.again || 0) });
  const f0 = ft('died0'), fp = ft('paid');
  if (f0.n >= 20 && fp.n >= 20) out.push({ big: `${pct(f0.again / f0.n)} vs ${pct(fp.again / fp.n)}`, text: `of posters ever posted again when their first task died with no entries (${fmt(f0.again)} of ${fmt(f0.n)}), against those whose first task was paid (${fmt(fp.again)} of ${fmt(fp.n)}). A first task that gets no entries usually loses the poster for good.`, source: 'tasks list, both chains: each requester\'s first listed task (10+ days old), its status and entries, and any later task by the same requester' });
  out.push({ big: fmt(dT.flow.winners + dB.flow.winners), text: `distinct winners have been paid across both task lists (${fmt(dT.flow.winners)} on Tempo, ${fmt(dB.flow.winners)} on Base). The single biggest winner took ${pct(dT.flow.topWinnerShare)} of Tempo's paid rewards.`, source: 'tasks list, completed tasks by primaryAward.workerAddress' });
  const sT = dT.stall?.limbo, sB = dB.stall?.limbo;
  if (sT && sB && sT.n + sB.n) out.push({ big: fmt(sT.n + sB.n), text: `tasks are past their deadline and not settled: ${fmt(sB.n)} on Base holding ${money(sB.reward)} USDC and ${fmt(sB.subs)} entries (the oldest ${fmt(sB.oldestH / 24, 0)} days past), ${fmt(sT.n)} on Tempo holding ${money(sT.reward)} OUSD and ${fmt(sT.subs)} entries.`, source: 'tasks list, phase awaiting_settlement with expiryTime before the data-as-of time' });
  const mr = (d, m) => d.stall?.modeRates.find((x) => x.mode === m);
  const cB = mr(dB, 'claim'), bB = mr(dB, 'bounty');
  if (cB && bB && cB.n >= 20) out.push({ big: pct(cB.died / cB.n), text: `of ended claim tasks on Base died (expired or cancelled), against ${pct(bB.died / bB.n)} of bounties. A claim task waits for one worker to take it; a bounty lets anyone enter.${mr(dT, 'claim') ? ` On Tempo: ${pct(mr(dT, 'claim').died / mr(dT, 'claim').n)} vs ${pct(mr(dT, 'bounty').died / mr(dT, 'bounty').n)}.` : ''}`, source: 'tasks list, status by mode among completed, expired and cancelled tasks' });
  const kT = dT.decisions, kB = dB.decisions;
  const hrs = (h) => (h < 1 ? fmt(h * 60, 0) + ' min' : h < 48 ? fmt(h, 1) + ' h' : fmt(h / 24, 1) + ' days');
  if (kT?.n && kB?.n) out.push({ big: hrs(kT.medianPayoutH), text: `is the median time from posting to the first payout on Tempo. On Base it is ${hrs(kB.medianPayoutH)}. Tempo tasks draw their first entry in ${hrs(kT.medianFirstEntryMin / 60)} (Base: ${hrs(kB.medianFirstEntryMin / 60)}).`, source: `/api/tasks/<id> awards[].settledAt and /submissions, ${fmt(kT.n)} + ${fmt(kB.n)} completed tasks` });
  if (kT?.withPos) out.push({ big: pct(kT.quartiles[0].n / kT.withPos), text: `of Tempo winners entered in the first quarter of arrivals; by chance it would be 25%. Early entry pays, partly because some pools pay the first entrants${kT.single ? `; on single-winner tasks it is ${pct(kT.singleFirstQ)}` : ''}.`, source: 'winning submissionId matched to submittedAt order, tasks with 4+ entries' });
  const gm = dT.growMix?.w7;
  if (gm && gm.total.last.tasks >= 50) {
    const gate = (w) => { const r = gm.gate.find((x) => x.key === 'Verified identity required'); return r && gm.total[w].tasks ? r[w].tasks / gm.total[w].tasks : 0; };
    if (gate('last') - gate('prev') >= 0.1) out.push({ big: pct(gate('last')), text: `of the tasks posted on Tempo in the last 7 days require a verified identity, against ${pct(gate('prev'))} the week before. More and more of the market is closed to anonymous agents.`, source: 'tasks list, verifiedBy set, tasks by createdAt in the last 7 days vs the 7 before' });
    const sh = (r, w) => (gm.total[w].tasks ? r[w].tasks / gm.total[w].tasks : 0);
    const kinds = gm.kind.filter((r) => !['Untagged', 'Other tags'].includes(r.key) && r.last.tasks + r.prev.tasks >= 10).map((r) => ({ r, d: sh(r, 'last') - sh(r, 'prev') })).sort((a, b) => b.d - a.d);
    const up = kinds[0], dn = kinds[kinds.length - 1];
    if (up && dn && up.d > 0.02 && dn.d < -0.02) out.push({ big: `+${fmt(up.d * 100, 0)} pt`, text: `${up.r.key}: its share of Tempo tasks went from ${pct(sh(up.r, 'prev'))} to ${pct(sh(up.r, 'last'))} in a week (${fmt(up.r.prev.tasks)} → ${fmt(up.r.last.tasks)} tasks). ${dn.r.key} still leads but fell from ${pct(sh(dn.r, 'prev'))} to ${pct(sh(dn.r, 'last'))}.`, source: 'tasks list, kind of work from task tags, last 7 days vs the 7 before' });
  }
  if (dT.peak) out.push({ big: `${DAYS[dT.peak.day].slice(0, 3)} ${String(dT.peak.hour).padStart(2, '0')}h`, text: `is the busiest hour of the week over the last 30 days: ${fmt(dT.peak.count)} events, all in the same UTC hour on ${DAYS[dT.peak.day]}s.`, source: 'activity-heatmap, dimension=hourOfWeek, range=30d' });
  return out;
}

// Every task in the task lists from the last 30 days, grouped by the UTC day it was posted.
// Item: [chain index, status, reward (units), entries, reference code]
function mosaic(snap) {
  const end = new Date(snap.asOf); const start = new Date(end.getTime() - 29 * 86400e3);
  const startDay = start.toISOString().slice(0, 10);
  const days = new Map();
  for (let i = 0; i < 30; i++) days.set(new Date(start.getTime() + i * 86400e3).toISOString().slice(0, 10), []);
  snap.chains.forEach((c, ci) => c.tasks.forEach((t) => {
    const d = t.createdAt.slice(0, 10);
    if (d >= startDay && days.has(d)) days.get(d).push([ci, t.status, Math.round(units(t.reward) * 100) / 100, t.subs, t.ref]);
  }));
  return [...days.entries()].map(([d, items]) => ({ d, items: items.sort((a, b) => a[1].localeCompare(b[1])) }));
}

// Replay: every task posted in the last 7 days, with the arrival time of each entry and each payout.
// Entry and payout times come from /api/tasks/<id>/submissions and awards (fetched for completed tasks);
// tasks that are still open, expired or cancelled carry their entry count only (no arrival times).
// Task: [chain index, posted (s from window start), reward, outcome (0 paid, 1 open, 2 died), entry offsets (s after posting),
//        payouts [[s after posting, amount, winners]], entries, ref, title, ends (s from start, deadline for died tasks or -1)]
function replay(snap) {
  const end = new Date(snap.asOf).getTime(), W = 7 * 86400, start = end - W * 1000;
  const tasks = [];
  snap.chains.forEach((c, ci) => c.tasks.forEach((t) => {
    const p = new Date(t.createdAt).getTime();
    if (p < start || p > end) return;
    const d = c.details?.[t.id];
    const paid = t.status === 'completed' && d?.a?.length;
    const died = ['expired', 'cancelled'].includes(t.status);
    const pays = new Map();
    if (paid) for (const a of d.a) { const s = Math.round((new Date(a[2]).getTime() - p) / 1000); const r = pays.get(s) || [s, 0, 0]; r[1] += units(a[1]); r[2] += 1; pays.set(s, r); }
    const ends = died && t.expiryTime ? Math.round((new Date(t.expiryTime).getTime() - start) / 1000) : -1;
    tasks.push([ci, Math.round((p - start) / 1000), Math.round(units(t.reward) * 100) / 100, paid ? 0 : died ? 2 : 1,
      paid ? d.s : [], [...pays.values()].map((r) => [r[0], Math.round(r[1] * 100) / 100, r[2]]), t.subs || 0, t.ref, (t.title || '').slice(0, 90), ends]);
  }));
  tasks.sort((a, b) => a[1] - b[1]);
  return { asOf: snap.asOf, start: new Date(start).toISOString(), seconds: W, chains: snap.chains.map((c) => ({ key: c.key, name: c.name, token: c.token })), tasks };
}

const VIEWS = [
  { id: 'pulse', file: 'index.html', title: 'Taskmarket Pulse: the market, right now', desc: 'A live read of Taskmarket on Tempo and Base: who posts, who wins, where agents are piling in.' },
  { id: 'replay-view', file: 'replay.html', title: 'A week of Taskmarket in a minute · Taskmarket Pulse', desc: 'Replay every task posted in the last 7 days: agents swarming in, posters picking, money paid out.' },
  { id: 'swarm-view', file: 'swarm.html', title: 'Where the swarm is · Taskmarket Pulse', desc: 'Open Taskmarket tasks ranked by how many agents entered. One square per entry.' },
  { id: 'flow-view', file: 'flow.html', title: 'Where the money goes · Taskmarket Pulse', desc: 'Rewards of completed Taskmarket tasks, from posters to winners.' },
  { id: 'decide-view', file: 'decisions.html', title: 'How Taskmarket tasks get decided · Taskmarket Pulse', desc: 'Time to the first entry, time to payout, and whether early entries win.' },
  { id: 'stall-view', file: 'stalled.html', title: 'Where Taskmarket tasks stall · Taskmarket Pulse', desc: 'Tasks past their deadline that nobody has settled, and which tasks die.' },
  { id: 'grow-view', file: 'growing.html', title: 'What is growing on Taskmarket · Taskmarket Pulse', desc: 'This week against the week before: which kinds of work, modes and posters are gaining share.' },
  { id: 'trends-view', file: 'trends.html', title: 'Taskmarket over time · Taskmarket Pulse', desc: 'Daily active agents, tasks posted, rewards put up and paid.' },
  { id: 'posters-view', file: 'posters.html', title: 'Who posts on Taskmarket · Taskmarket Pulse', desc: 'Distinct task posters per week and how concentrated posting is.' },
  { id: 'heat-view', file: 'heatmap.html', title: 'When Taskmarket is busy · Taskmarket Pulse', desc: 'Activity by hour of the week and by task mode.' },
  { id: 'mix-view', file: 'mix.html', title: 'The Taskmarket mix · Taskmarket Pulse', desc: 'Tasks by mode and by status, on both chains.' },
  { id: 'feed-view', file: 'feed.html', title: 'Live feed · Taskmarket Pulse', desc: 'The newest Taskmarket events.' },
];

async function main() {
  let snap;
  const snapFile = join(ROOT, 'data/snapshot.json');
  if (args.includes('--fetch') || !existsSync(snapFile)) {
    snap = await fetchSnapshot();
    await mkdir(dirname(snapFile), { recursive: true });
    await writeFile(snapFile, JSON.stringify(snap));
  } else snap = JSON.parse(await readFile(snapFile, 'utf8'));
  // Recompute derived numbers so code changes apply to cached snapshots too.
  snap.derived = Object.fromEntries(snap.chains.map((c) => [c.key, derive(c, snap.asOf)]));

  const [A, Bc] = snap.chains;
  const sameAcrossChains = { series: sameSeries(A.series, Bc.series), heatmap: sameHeat(A.heatmap, Bc.heatmap), breakdowns: sameBreak(A.breakdowns, Bc.breakdowns), feed: sameFeed(A.feed, Bc.feed) };
  // The activity feed is filtered per chain at fetch time; when the endpoint is shared, merge both.
  const feed = [...A.feed, ...Bc.feed].sort((x, y) => y.timestamp.localeCompare(x.timestamp)).slice(0, 200);
  const plat = (c) => ({ series: c.series, heatmap: c.heatmap, breakdowns: c.breakdowns, feed: c.key === A.key ? feed : c.feed });
  const allSame = sameAcrossChains.series && sameAcrossChains.heatmap && sameAcrossChains.breakdowns;
  const platform = { sameAcrossChains, byChain: allSame ? { [A.key]: plat(A) } : { [A.key]: plat(A), [Bc.key]: plat(Bc) } };
  const all = derive({ tasks: snap.chains.flatMap((c) => c.tasks) }, snap.asOf);

  const view = {
    asOf: snap.asOf, api: snap.api, repo: REPO,
    chains: snap.chains.map((c) => ({ key: c.key, id: c.id, name: c.name, token: c.token, stats: c.stats, derived: snap.derived[c.key] })),
    all, platform, insights: insights(snap, sameAcrossChains.series), mosaic: mosaic(snap),
  };

  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'data'), { recursive: true });
  for (const d of ['fonts', 'img']) await cp(join(ROOT, 'web', d), join(OUT, d), { recursive: true });
  for (const f of ['style.css', 'app.js']) await cp(join(ROOT, 'web', f), join(OUT, f));
  await writeFile(join(OUT, 'data/snapshot.json'), JSON.stringify(snap));
  await writeFile(join(OUT, 'data/view.json'), JSON.stringify(view));
  const rp = replay(snap);
  await writeFile(join(OUT, 'data/replay.json'), JSON.stringify(rp));
  await writeFile(join(OUT, '.nojekyll'), '');

  const tpl = await readFile(join(ROOT, 'web/index.html'), 'utf8');
  const asOfTxt = snap.asOf.replace('T', ' ').slice(0, 16);
  const ver = snap.asOf.replace(/\D/g, '').slice(0, 12);
  const listed = snap.chains.reduce((s, c) => s + c.tasks.length, 0);
  const bdTotal = (A.breakdowns.status || []).reduce((s, x) => s + x.count, 0);
  const coverage = `${snap.chains.map((c) => `${fmt(c.tasks.length)} on ${c.name}`).join(' and ')}, ${fmt(listed)} in all` + (sameAcrossChains.breakdowns ? `, against ${fmt(bdTotal)} tasks counted by /api/stats/breakdowns. The task list does not return every task, so these views cover ${pct(listed / bdTotal)} of all tasks.` : '.');
  const seriesNote = sameAcrossChains.series ? 'The endpoint returns the same platform-wide series for chainId 4217 and 8453 (checked on every build), so the charts show both chains combined.' : 'Switch chains above.';
  const safeJSON = JSON.stringify(view).replace(/</g, '\\u003c');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  const cards = await renderCards(view, join(OUT, 'og'), rp);
  for (const v of VIEWS) {
    const url = BASE + (v.file === 'index.html' ? '' : v.file);
    const image = BASE + `og/${cards[v.id] || cards.pulse}`;
    const html = tpl.replaceAll('{{TITLE}}', esc(v.title)).replaceAll('{{DESC}}', esc(v.desc)).replaceAll('{{URL}}', esc(url)).replaceAll('{{IMAGE}}', esc(image))
      .replaceAll('{{VIEW}}', v.id).replaceAll('{{ASOF}}', asOfTxt).replaceAll('{{VER}}', ver).replaceAll('{{API}}', esc(snap.api)).replaceAll('{{REPO}}', esc(REPO))
      .replaceAll('{{COVERAGE}}', esc(coverage)).replaceAll('{{SERIESNOTE}}', esc(seriesNote)).replace('{{DATA}}', () => safeJSON);
    await writeFile(join(OUT, v.file), html);
  }
  console.log(`built ${OUT} as of ${snap.asOf}; same across chains: ${JSON.stringify(sameAcrossChains)}; html ${fmt(Buffer.byteLength(safeJSON) / 1024)} KB data`);
  void units;
}

main().catch((e) => { console.error(e); process.exit(1); });
