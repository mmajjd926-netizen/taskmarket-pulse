// Numbers computed from the raw API responses. Every value here can be recomputed
// from /api/tasks, /api/stats/platform-time-series and /api/stats/activity-heatmap.
export const units = (s) => Number(s || 0) / 1e6; // OUSD and USDC both use 6 decimals

export function isoWeek(ts) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function derive(c, asOf) {
  const now = new Date(asOf).getTime();
  const tasks = c.tasks;

  // Distinct task posters per week (Monday-start UTC weeks, by task createdAt).
  const weeks = new Map();
  const firstSeen = new Map();
  for (const t of [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!firstSeen.has(t.requester)) firstSeen.set(t.requester, isoWeek(t.createdAt));
  }
  for (const t of tasks) {
    const w = isoWeek(t.createdAt);
    if (!weeks.has(w)) weeks.set(w, { week: w, posters: new Set(), tasks: 0, reward: 0 });
    const e = weeks.get(w);
    e.posters.add(t.requester); e.tasks++; e.reward += units(t.reward);
  }
  const postersPerWeek = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).map((e) => ({
    week: e.week, posters: e.posters.size, newPosters: [...e.posters].filter((p) => firstSeen.get(p) === e.week).length,
    tasks: e.tasks, reward: round(e.reward),
  }));

  // How concentrated posting is.
  const byPoster = new Map();
  for (const t of tasks) {
    if (!byPoster.has(t.requester)) byPoster.set(t.requester, { addr: t.requester, name: t.requesterName, type: t.requesterType, tasks: 0, reward: 0, paid: 0 });
    const p = byPoster.get(t.requester);
    p.tasks++; p.reward += units(t.reward);
    if (t.status === 'completed') p.paid += units(t.reward);
  }
  const posters = [...byPoster.values()].sort((a, b) => b.reward - a.reward);
  const totalPosted = posters.reduce((s, p) => s + p.reward, 0);
  const share = (n) => (totalPosted ? posters.slice(0, n).reduce((s, p) => s + p.reward, 0) / totalPosted : 0);
  const lorenz = [];
  for (let i = 0; i <= 20; i++) {
    const k = Math.round((posters.length * i) / 20);
    lorenz.push({ posters: i / 20, reward: totalPosted ? posters.slice(0, k).reduce((s, p) => s + p.reward, 0) / totalPosted : 0 });
  }
  const concentration = {
    posters: posters.length, totalPosted: round(totalPosted), top1: share(1), top5: share(5), top10: share(10),
    oneTaskPosters: posters.filter((p) => p.tasks === 1).length,
    lorenz, top: posters.slice(0, 10).map((p) => ({ ...p, reward: round(p.reward), paid: round(p.paid) })),
  };

  // Money flow: what completed tasks paid, from the poster to each winner. Uses the task's awards
  // (/api/tasks/<id>: awards[].workerPayment) when fetched, else the reward credited to primaryAward.
  const det = c.details || {};
  const done = tasks.filter((t) => t.status === 'completed' && (t.winner || det[t.id]?.a?.length));
  const pays = []; // [poster, winner, amount, taskId]
  for (const t of done) {
    const d = det[t.id];
    if (d && d.a.length) for (const [w, pay] of d.a) pays.push([t.requester, w, units(pay), t.id]);
    else pays.push([t.requester, t.winner, units(t.reward), t.id]);
  }
  const posterPaid = new Map(), winnerGot = new Map(), winnerTasks = new Map();
  for (const [p, w, v] of pays) {
    posterPaid.set(p, (posterPaid.get(p) || 0) + v);
    winnerGot.set(w, (winnerGot.get(w) || 0) + v);
    winnerTasks.set(w, (winnerTasks.get(w) || 0) + 1);
  }
  const topP = [...posterPaid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map((e) => e[0]);
  const topW = [...winnerGot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map((e) => e[0]);
  const linkMap = new Map();
  for (const [p, w, v] of pays) {
    const k = (topP.includes(p) ? p : 'others') + '>' + (topW.includes(w) ? w : 'others');
    linkMap.set(k, (linkMap.get(k) || 0) + v);
  }
  const flowTotal = pays.reduce((s, x) => s + x[2], 0);
  const flow = {
    total: round(flowTotal), tasks: done.length, awards: pays.length, fromAwards: done.filter((t) => det[t.id]?.a?.length).length,
    winners: winnerGot.size, payers: posterPaid.size,
    sources: [...topP.map((a) => ({ id: a, name: byPoster.get(a)?.name || null, value: round(posterPaid.get(a)) })),
      { id: 'others', name: null, value: round(flowTotal - topP.reduce((s, a) => s + posterPaid.get(a), 0)) }],
    targets: [...topW.map((a) => ({ id: a, value: round(winnerGot.get(a)), tasks: winnerTasks.get(a) })),
      { id: 'others', value: round(flowTotal - topW.reduce((s, a) => s + winnerGot.get(a), 0)), tasks: pays.filter((x) => !topW.includes(x[1])).length }],
    links: [...linkMap.entries()].map(([k, v]) => ({ source: k.split('>')[0], target: k.split('>')[1], value: round(v) })),
    topWinnerShare: flowTotal ? winnerGot.get(topW[0]) / flowTotal : 0,
  };

  // Decisions: how fast entries arrive, how long posters take to pay, whether early entries win.
  const dec = [];
  for (const t of done) {
    const d = det[t.id];
    if (!d || !d.a.length) continue;
    const settled = d.a.map((a) => a[2]).filter(Boolean).map((x) => new Date(x).getTime());
    if (!settled.length) continue;
    const payout = (Math.min(...settled) - new Date(d.c).getTime()) / 1000;
    const pos = d.a[0][3] != null && d.s.length >= 4 ? d.s.findIndex((x) => x >= d.a[0][3]) / d.s.length : null;
    dec.push({ t, d, payout, first: d.s.length ? d.s[0] : null, atDecision: d.s.filter((x) => x <= payout).length, pos });
  }
  const H = 3600;
  const payoutBuckets = [['< 1 h', 0, H], ['1–6 h', H, 6 * H], ['6–24 h', 6 * H, 24 * H], ['1–3 days', 24 * H, 72 * H], ['3–7 days', 72 * H, 168 * H], ['> 7 days', 168 * H, Infinity]]
    .map(([l, lo, hi]) => ({ label: l, n: dec.filter((x) => x.payout >= lo && x.payout < hi).length }));
  const withPos = dec.filter((x) => x.pos != null);
  const quart = [0, 1, 2, 3].map((q) => ({ q, n: withPos.filter((x) => Math.min(3, Math.floor(x.pos * 4)) === q).length }));
  const single = withPos.filter((x) => x.d.a.length === 1);
  const singleFirstQ = single.length ? single.filter((x) => x.pos < 0.25).length / single.length : null;
  const races = dec.filter((x) => x.d.s.length >= 12).sort((a, b) => b.t.createdAt.localeCompare(a.t.createdAt)).slice(0, 6)
    .map((x) => ({ ref: x.t.ref, id: x.t.id, title: x.t.title, reward: units(x.t.reward), entries: x.d.s.slice(0, 400), n: x.d.s.length,
      wins: x.d.a.map((a) => a[3]).filter((v) => v != null), payout: Math.round(x.payout), winners: x.d.a.length }));
  const decisions = {
    n: dec.length, completed: done.length,
    medianFirstEntryMin: round(median(dec.filter((x) => x.first != null).map((x) => x.first)) / 60, 1),
    medianPayoutH: round(median(dec.map((x) => x.payout)) / H, 1),
    medianAtDecision: median(dec.map((x) => x.atDecision)),
    payoutBuckets, quartiles: quart, withPos: withPos.length, single: single.length, singleFirstQ, races,
  };

  // Where the swarm is: open tasks by number of entries.
  const live = tasks.filter((t) => t.status === 'open' && t.open);
  const pick = (t) => ({ id: t.id, ref: t.ref, title: t.title, mode: t.mode, reward: units(t.reward), subs: t.subs, createdAt: t.createdAt, expiryTime: t.expiryTime });
  const swarm = [...live].sort((a, b) => b.subs - a.subs || units(b.reward) - units(a.reward)).slice(0, 30).map(pick);
  // Best odds for a worker: reward per entry if you entered now, reward / (entries + 1).
  const odds = [...live].sort((a, b) => units(b.reward) / (b.subs + 1) - units(a.reward) / (a.subs + 1)).slice(0, 30).map(pick);
  const liveTotals = { tasks: live.length, reward: round(live.reduce((s, t) => s + units(t.reward), 0)), subs: live.reduce((s, t) => s + t.subs, 0),
    zero: live.filter((t) => t.subs === 0).length };

  // Tasks that died, and tasks nobody touched.
  const status = {};
  for (const t of tasks) status[t.status] = (status[t.status] || 0) + 1;
  const died = (status.expired || 0) + (status.cancelled || 0);
  const ignored = tasks.filter((t) => t.status === 'open' && t.subs === 0 && now - new Date(t.createdAt).getTime() > 72 * 3600e3).length;
  const diedReward = round(tasks.filter((t) => t.status === 'expired' || t.status === 'cancelled').reduce((s, t) => s + units(t.reward), 0));

  // First task outcome vs coming back: posters whose first listed task is 10+ days old, grouped by how that first task ended
  // (died with no entries / died with entries / paid), and whether they posted another task more than an hour later.
  const postersFirst = new Map();
  for (const t of tasks) { if (!postersFirst.has(t.requester)) postersFirst.set(t.requester, []); postersFirst.get(t.requester).push(t) }
  const firstTask = { died0: { n: 0, again: 0 }, diedEntries: { n: 0, again: 0 }, paid: { n: 0, again: 0 } };
  for (const list of postersFirst.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const f = list[0], ft = new Date(f.createdAt).getTime();
    if (now - ft < 10 * 86400e3) continue;
    const g = f.status === 'completed' ? 'paid' : (f.status === 'expired' || f.status === 'cancelled') ? (f.subs ? 'diedEntries' : 'died0') : null;
    if (!g) continue;
    firstTask[g].n++;
    if (list.slice(1).some((t) => new Date(t.createdAt).getTime() > ft + 3600e3)) firstTask[g].again++;
  }

  // Competition: entries per completed bounty and reward per entry.
  const doneBounty = tasks.filter((t) => t.status === 'completed' && t.mode === 'bounty' && t.subs > 0);
  const competition = {
    bounties: doneBounty.length,
    medianEntries: median(doneBounty.map((t) => t.subs)),
    medianPerEntry: round(median(doneBounty.map((t) => units(t.reward) / t.subs)), 3),
    multiWinner: doneBounty.filter((t) => t.awards > 1).length,
    buckets: [[1, 1], [2, 5], [6, 15], [16, 30], [31, 1e9]].map(([lo, hi]) => ({ lo, hi, n: doneBounty.filter((t) => t.subs >= lo && t.subs <= hi).length })),
  };

  // Growth: last 7 days vs the 7 before, from the 30d daily series (the current day is partial and excluded).
  const rows = (c.series?.['30d']?.rows || []).slice(0, -1);
  const sum = (arr, k) => arr.reduce((s, r) => s + (k.endsWith('Volume') ? units(r[k]) : Number(r[k] || 0)), 0);
  const last = rows.slice(-7), prev = rows.slice(-14, -7);
  const growth = {};
  for (const k of ['tasksCreated', 'rewardVolume', 'paidVolume', 'activeAgents', 'newAgents', 'settlements']) {
    const a = sum(last, k), b = sum(prev, k);
    growth[k] = { last: round(a), prev: round(b), change: b ? (a - b) / b : null };
  }
  growth.window = { from: last[0]?.bucket, to: last[last.length - 1]?.bucket, prevFrom: prev[0]?.bucket, prevTo: prev[prev.length - 1]?.bucket };

  // Busiest hour of the week (30d heatmap, UTC).
  const cells = c.heatmap?.hourOfWeek?.['30d']?.cells || [];
  const peak = cells.reduce((m, x) => (x.count > (m?.count || 0) ? x : m), null);

  const bdTotal = (c.breakdowns?.status || []).reduce((s, x) => s + x.count, 0);
  return {
    postersPerWeek, concentration, flow, decisions, swarm, odds, liveTotals, status, died, diedReward, ignored, competition, growth, firstTask,
    peak: peak ? { day: Number(peak.row), hour: Number(peak.col), count: peak.count } : null,
    coverage: { listed: tasks.length, breakdownTotal: bdTotal },
  };
}
