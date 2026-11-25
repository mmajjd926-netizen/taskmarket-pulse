// Share cards (1200x630 PNG), one per view, drawn from the same snapshot as the page.
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = (f) => join(HERE, 'fonts', f);
const C = { ground: '#12100E', maroon: '#3A1420', panel: '#221E1A', line: '#453E37', cream: '#EFE9E2', paper: '#FFF6E8', muted: '#B0A79D', magenta: '#E74079', salmon: '#D9A097' };
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => (Math.abs(n) >= 100 ? fmt(n, 0) : fmt(n, 2));
const pct = (x) => fmt(x * 100, 0) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const u = (s) => Number(s || 0) / 1e6;

function frame(lockup, asOf, head, body) {
  // head: [plain, accent] — one magenta italic word per card.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="g" cx="1" cy="0" r="0.9"><stop offset="0" stop-color="${C.maroon}"/><stop offset="1" stop-color="${C.ground}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="630" fill="${C.ground}"/><rect width="1200" height="630" fill="url(#g)"/>
  <image x="56" y="48" width="372" height="67" xlink:href="data:image/png;base64,${lockup}"/>
  <text x="1144" y="88" text-anchor="end" font-family="Departure Mono" font-size="22" fill="${C.cream}">taskmarket.dev</text>
  <text x="56" y="205" font-family="Instrument Serif" font-size="74" fill="${C.cream}">${esc(head[0])} <tspan font-style="italic" fill="${C.magenta}">${esc(head[1])}</tspan></text>
  ${body}
  <text x="56" y="590" font-family="Inter Tight" font-weight="500" font-size="19" fill="${C.muted}">Taskmarket Pulse · data as of ${esc(asOf)} UTC · made for a paid Taskmarket bounty, not an official product</text>
</svg>`;
}

const stat = (x, y, v, l) => `<text x="${x}" y="${y}" font-family="Departure Mono" font-size="50" fill="${C.paper}">${esc(v)}</text>
  <text x="${x}" y="${y + 34}" font-family="Inter Tight" font-weight="500" font-size="21" fill="${C.muted}">${esc(l)}</text>`;

function bars(rows, key, isMoney, x, y, w, h) {
  const vals = rows.map((r) => (isMoney ? u(r[key]) : Number(r[key] || 0)));
  const max = Math.max(...vals, 1), bw = w / vals.length, pk = vals.indexOf(Math.max(...vals));
  return vals.map((v, i) => { const bh = (v / max) * h; return `<rect x="${x + i * bw + bw * 0.14}" y="${y + h - bh}" width="${bw * 0.72}" height="${bh}" rx="4" fill="${i === pk ? C.magenta : C.cream}" fill-opacity="${i === pk ? 1 : 0.8}"/>`; }).join('');
}

function mosaicSvg(M, x0, y0, w, h) {
  const COL = { completed: C.paper, open: C.salmon, claimed: C.muted, pending_approval: C.muted, worker_selected: C.muted, expired: C.line, cancelled: C.line };
  const per = 3, colW = w / Math.max(1, M.length), sz = (colW - 2) / per;
  const maxRows = Math.max(1, ...M.map((d) => Math.ceil(d.items.length / per)));
  const step = Math.min(sz, h / maxRows);
  let big = null; M.forEach((d) => d.items.forEach((it) => { if (!big || it[2] > big[2]) big = it; }));
  let g = '';
  M.forEach((d, i) => d.items.forEach((it, j) => {
    const x = x0 + i * colW + (j % per) * step, y = y0 + h - (Math.floor(j / per) + 1) * step;
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(step * 0.8).toFixed(1)}" height="${(step * 0.8).toFixed(1)}" rx="1.2" fill="${it === big ? C.magenta : COL[it[1]] || C.muted}"/>`;
  }));
  return g;
}

export async function renderCards(view, outDir, rp) {
  await mkdir(outDir, { recursive: true });
  const lockup = (await readFile(join(HERE, 'lockup-full.png'))).toString('base64');
  const asOf = view.asOf.replace('T', ' ').slice(0, 16);
  const [T, B] = view.chains;
  const dT = T.derived, dB = B.derived;
  const P = Object.values(view.platform.byChain)[0];
  const cards = {};
  const add = (id, head, body) => { cards[id] = frame(lockup, asOf, head, body); };

  // Pulse
  const g = dT.growth;
  const r30 = P.series['30d'].rows;
  add('pulse', ['The market, right', 'now.'],
    stat(56, 300, fmt(T.stats.openTasks), T.stats.openTasks === B.stats.openTasks ? 'open tasks, platform-wide' : 'open tasks on Tempo') +
    stat(56, 420, fmt(T.stats.activeAgents7d), 'active agents, last 7 days') +
    stat(350, 300, money(g.paidVolume.last), 'paid out, last 7 full days') +
    stat(350, 420, pct(dT.concentration.top5), 'Tempo rewards, top 5 posters') +
    mosaicSvg(view.mosaic || [], 716, 250, 428, 240) +
    `<text x="716" y="522" font-family="Inter Tight" font-weight="500" font-size="19" fill="${C.muted}">every task of the last 30 days, one tile each</text>`);

  // Swarm: tiles with entry squares
  const sw = dT.swarm.slice(0, 5);
  let sx = 56, sbody = '';
  for (const t of sw) {
    const n = Math.min(t.subs, 96);
    sbody += `<rect x="${sx}" y="250" width="206" height="270" rx="18" fill="${C.panel}" stroke="${t === sw[0] ? C.magenta : C.line}" stroke-width="2"/>
      <text x="${sx + 16}" y="286" font-family="Departure Mono" font-size="22" fill="${C.paper}">${money(t.reward)} OUSD</text>
      <text x="${sx + 16}" y="314" font-family="Inter Tight" font-weight="500" font-size="18" fill="${C.muted}">${fmt(t.subs)} entries</text>`;
    for (let i = 0; i < n; i++) sbody += `<rect x="${sx + 16 + (i % 12) * 15}" y="${336 + Math.floor(i / 12) * 15}" width="11" height="11" rx="2.5" fill="${C.paper}" fill-opacity=".85"/>`;
    sx += 220;
  }
  add('swarm-view', ['Where the', 'swarm is.'], sbody);

  // Flow: a compact sankey of the Base flow
  const f = dB.flow.total > dT.flow.total ? { ...dB.flow, tok: 'USDC', name: 'Base' } : { ...dT.flow, tok: 'OUSD', name: 'Tempo' };
  const H = 260, y0 = 250, gap = 6, tot = f.total || 1;
  const lay = (arr) => { let y = y0; const av = H - gap * (arr.length - 1); return arr.map((n) => { const h = Math.max(2, (n.value / tot) * av); const o = { ...n, y, h }; y += h + gap; return o; }); };
  const S = lay(f.sources), Tg = lay(f.targets);
  const so = Object.fromEntries(S.map((n) => [n.id, n.y])), to = Object.fromEntries(Tg.map((n) => [n.id, n.y]));
  let fb = '';
  const x0 = 470, x1 = 1130;
  for (const l of [...f.links].sort((a, b) => S.findIndex((n) => n.id === a.source) - S.findIndex((n) => n.id === b.source) || Tg.findIndex((n) => n.id === a.target) - Tg.findIndex((n) => n.id === b.target))) {
    const hs = (l.value / tot) * (H - gap * (S.length - 1)), ht = (l.value / tot) * (H - gap * (Tg.length - 1));
    const ys = so[l.source], yt = to[l.target]; so[l.source] += hs; to[l.target] += ht;
    const xm = (x0 + x1) / 2, hot = l.source === f.sources[0].id && l.target === f.targets[0].id;
    fb += `<path d="M${x0 + 12},${ys} C${xm},${ys} ${xm},${yt} ${x1},${yt} L${x1},${yt + ht} C${xm},${yt + ht} ${xm},${ys + hs} ${x0 + 12},${ys + hs} Z" fill="${hot ? C.magenta : C.salmon}" fill-opacity="${hot ? 0.6 : 0.25}"/>`;
  }
  fb += S.map((n) => `<rect x="${x0}" y="${n.y}" width="12" height="${n.h}" rx="3" fill="${C.paper}"/>`).join('') + Tg.map((n) => `<rect x="${x1}" y="${n.y}" width="12" height="${n.h}" rx="3" fill="${C.paper}"/>`).join('');
  add('flow-view', ['Where the money', 'goes.'], fb + stat(56, 300, money(f.total), `${f.tok} paid on ${f.name} tasks`) + stat(56, 420, `${fmt(f.payers)} → ${fmt(f.winners)}`, 'posters → winners'));

  // Decisions: race strips of the newest contested Tempo tasks
  const k = dT.decisions;
  if (k && k.n) {
    let rb = '';
    const L = 56, R = 1144;
    k.races.slice(0, 4).forEach((r, ri) => {
      const y = 330 + ri * 52, tMax = Math.max(r.payout, ...r.entries, 3600) * 1.15, tMin = 30;
      const X = (sec) => 520 + ((Math.log(Math.max(sec, tMin)) - Math.log(tMin)) / (Math.log(tMax) - Math.log(tMin))) * (R - 520);
      rb += `<line x1="520" x2="${R}" y1="${y}" y2="${y}" stroke="${C.line}"/>`;
      r.entries.forEach((e, i) => { rb += `<rect x="${(X(e) - 3).toFixed(1)}" y="${y - 10 + (i % 4) * 5}" width="6" height="6" rx="1.5" fill="${C.paper}" fill-opacity=".7"/>`; });
      r.wins.forEach((w) => { rb += `<rect x="${(X(w) - 5).toFixed(1)}" y="${y - 6}" width="11" height="11" rx="2.5" fill="${C.magenta}"/>`; });
      rb += `<line x1="${X(r.payout).toFixed(1)}" x2="${X(r.payout).toFixed(1)}" y1="${y - 18}" y2="${y + 18}" stroke="${C.salmon}" stroke-width="3"/>`;
    });
    const firstQ = k.withPos ? k.quartiles[0].n / k.withPos : 0;
    const dur = (h) => (h < 1 ? fmt(h * 60, 0) + ' min' : fmt(h, 1) + ' h');
    add('decide-view', ['How tasks get', 'decided.'], rb + stat(L, 300, dur(k.medianFirstEntryMin / 60), 'median wait for a first entry') + stat(L, 420, pct(firstQ), 'of winners entered in the first quarter') +
      `<text x="520" y="548" font-family="Inter Tight" font-weight="500" font-size="19" fill="${C.muted}">entries (cream), winners (magenta), first payout (line)</text>`);
  }

  // Stalled: unsettled tasks past their deadline, by age
  const sl = dB.stall?.limbo, slT = dT.stall?.limbo;
  if (sl && slT) {
    const bk = sl.buckets.map((b, i) => ({ ...b, nT: slT.buckets[i].n }));
    const mxs = Math.max(...bk.map((b) => b.n + b.nT), 1);
    let sb = '';
    bk.forEach((b, i) => { const x = 560 + i * 118, hB = (b.n / mxs) * 230, hT = (b.nT / mxs) * 230;
      sb += `<rect x="${x}" y="${480 - hB - hT}" width="86" height="${Math.max(hT, 0)}" rx="5" fill="${C.salmon}"/><rect x="${x}" y="${480 - hB}" width="86" height="${Math.max(hB, 0)}" rx="5" fill="${i >= 3 ? C.magenta : C.cream}"/>
        <text x="${x + 43}" y="512" text-anchor="middle" font-family="Inter Tight" font-weight="500" font-size="16" fill="${C.muted}">${esc(b.label.replace('under ', '<').replace(' to ', '–').replace('over ', '>'))}</text>`; });
    add('stall-view', ['Where tasks', 'stall.'], sb + stat(56, 300, fmt(sl.n + slT.n), 'tasks past deadline, not settled') + stat(56, 420, `${fmt(sl.oldestH / 24, 0)} days`, 'the longest wait on Base') +
      `<text x="560" y="548" font-family="Inter Tight" font-weight="500" font-size="17" fill="${C.muted}">time past the deadline: Base (cream, magenta) · Tempo (salmon)</text>`);
  }

  // Growing: slope of Tempo kinds of work, last 7 days vs the 7 before
  const gw = dT.growMix?.w7;
  if (gw) {
    const rows = gw.kind.filter((r) => r.last.tasks + r.prev.tasks > 0 && r.key !== 'Other tags');
    const mx = Math.max(1, ...rows.flatMap((r) => [r.last.tasks, r.prev.tasks]));
    const X1 = 600, X2 = 900, Y0 = 470, Y1 = 250;
    const yy = (v) => Y0 - Math.sqrt(v / mx) * (Y0 - Y1);
    const T = gw.total;
    let gb = `<line x1="${X1}" y1="${Y1 - 10}" x2="${X1}" y2="${Y0}" stroke="${C.line}" stroke-width="2"/><line x1="${X2}" y1="${Y1 - 10}" x2="${X2}" y2="${Y0}" stroke="${C.line}" stroke-width="2"/>`;
    const labs = [];
    rows.forEach((r) => {
      const d = r.last.tasks / Math.max(1, T.last.tasks) - r.prev.tasks / Math.max(1, T.prev.tasks);
      const col = d > 0.005 ? C.magenta : d < -0.005 ? C.salmon : C.cream;
      gb += `<line x1="${X1}" y1="${yy(r.prev.tasks)}" x2="${X2}" y2="${yy(r.last.tasks)}" stroke="${col}" stroke-width="5" stroke-linecap="round"/><circle cx="${X1}" cy="${yy(r.prev.tasks)}" r="7" fill="${col}"/><circle cx="${X2}" cy="${yy(r.last.tasks)}" r="7" fill="${col}"/>`;
      labs.push({ y: yy(r.last.tasks), t: r.key, col });
    });
    labs.sort((a, b) => a.y - b.y); for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 24) labs[i].y = labs[i - 1].y + 24;
    labs.forEach((l) => { gb += `<text x="${X2 + 18}" y="${l.y + 6}" font-family="Inter Tight" font-weight="500" font-size="18" fill="${l.col}">${esc(l.t)}</text>`; });
    const gate = gw.gate.find((x) => x.key === 'Verified identity required');
    const gs = gate && T.last.tasks ? gate.last.tasks / T.last.tasks : 0;
    const chg = T.prev.tasks ? (T.last.tasks - T.prev.tasks) / T.prev.tasks : 0;
    add('grow-view', ['What is', 'growing.'], gb + stat(56, 300, (chg >= 0 ? '+' : '−') + fmt(Math.abs(chg) * 100, 0) + '%', 'Tempo tasks posted, week on week') + stat(56, 420, pct(gs), 'of new tasks need a verified identity') +
      `<text x="${X1 - 10}" y="${Y0 + 42}" font-family="Inter Tight" font-weight="500" font-size="17" fill="${C.muted}">kinds of work, last week → this week (magenta gains share)</text>`);
  }

  // Trends
  add('trends-view', ['Taskmarket over', 'time.'],
    bars(r30, 'activeAgents', false, 56, 250, 520, 230) + bars(r30, 'rewardVolume', true, 624, 250, 520, 230) +
    `<text x="56" y="512" font-family="Inter Tight" font-weight="500" font-size="19" fill="${C.muted}">daily active agents, 30 days</text>
     <text x="624" y="512" font-family="Inter Tight" font-weight="500" font-size="19" fill="${C.muted}">rewards put up per day, 30 days</text>`);

  // Posters
  const w = view.all.postersPerWeek.slice(-12);
  const mx = Math.max(...w.map((x) => x.posters), 1);
  let pb = '';
  w.forEach((x, i) => { const bw = 600 / w.length, h = (x.posters / mx) * 220, hn = (x.newPosters / mx) * 220;
    pb += `<rect x="${544 + i * bw + bw * 0.14}" y="${480 - h}" width="${bw * 0.72}" height="${h - hn}" rx="4" fill="${C.cream}" fill-opacity=".85"/><rect x="${544 + i * bw + bw * 0.14}" y="${480 - hn}" width="${bw * 0.72}" height="${hn}" rx="4" fill="${C.salmon}"/>`; });
  add('posters-view', ['Who', 'posts.'], pb + stat(56, 300, pct(dT.concentration.top5), 'of Tempo rewards from the top 5 posters') + stat(56, 420, fmt(view.all.concentration.posters), 'distinct posters, both chains') +
    `<text x="544" y="512" font-family="Inter Tight" font-weight="500" font-size="19" fill="${C.muted}">distinct posters per week (first-time in salmon)</text>`);

  // Heatmap
  const hm = P.heatmap.hourOfWeek['30d'];
  const cm = new Map(hm.cells.map((c) => [c.row + '|' + c.col, c.count]));
  const hmax = Math.max(...hm.cells.map((c) => c.count), 1);
  const pk = hm.cells.reduce((m, c) => (c.count > (m?.count || 0) ? c : m), null);
  let hb = '';
  for (let r = 0; r < 7; r++) for (let c = 0; c < 24; c++) {
    const v = cm.get(String(r) + '|' + String(c)) || 0, isPk = pk && Number(pk.row) === r && Number(pk.col) === c;
    hb += `<rect x="${56 + c * 45.3}" y="${250 + r * 38}" width="40" height="33" rx="7" fill="${isPk ? C.magenta : C.paper}" fill-opacity="${isPk ? 1 : v ? 0.05 + 0.95 * Math.pow(v / hmax, 1.1) : 0.03}"/>`;
  }
  add('heat-view', ['When it', 'happens.'], hb);

  // Mix
  const modes = [...P.breakdowns.mode].sort((a, b) => b.count - a.count);
  const mtot = modes.reduce((s, m) => s + m.count, 0) || 1;
  let mb = '';
  modes.forEach((m, i) => { mb += `<text x="56" y="${288 + i * 50}" font-family="Inter Tight" font-weight="600" font-size="24" fill="${C.cream}">${esc(m.mode)}</text>
    <rect x="220" y="${268 + i * 50}" width="${Math.max(4, (m.count / modes[0].count) * 760)}" height="26" rx="6" fill="${i === 0 ? C.cream : C.salmon}" fill-opacity=".85"/>
    <text x="1144" y="${290 + i * 50}" text-anchor="end" font-family="Departure Mono" font-size="24" fill="${C.paper}">${pct(m.count / mtot)}</text>`; });
  add('mix-view', ['The', 'mix.'], mb);

  // Feed
  const items = P.feed.slice(0, 6);
  let fd = '';
  items.forEach((i, k) => { fd += `<text x="56" y="${285 + k * 44}" font-family="Departure Mono" font-size="20" fill="${C.muted}">${esc(i.type.replace('task_', ''))}</text>
    <text x="240" y="${285 + k * 44}" font-family="Inter Tight" font-weight="500" font-size="22" fill="${C.cream}">${esc(i.taskTitle.slice(0, 66))}${i.taskTitle.length > 66 ? '…' : ''}</text>`; });
  add('feed-view', ['Live', 'feed.'], fd);


  // Replay: the week as a spiral, one disc per task (oldest at the centre), sized by entries.
  if (rp && rp.tasks.length) {
    const ts = rp.tasks;
    const paid = ts.reduce((s, t) => s + t[5].reduce((a, p) => a + (t[0] === 0 ? p[1] : 0), 0), 0);
    const ents = ts.reduce((s, t) => s + t[6], 0);
    const cx = 880, cy = 335, R = 235, n = ts.length, k = R / Math.sqrt(n + 1);
    const maxE = Math.max(...ts.map((t) => t[6]), 1);
    let big = ts[0]; ts.forEach((t) => { if (t[6] > big[6]) big = t; });
    let g = `<circle cx="${cx}" cy="${cy}" r="${R + 18}" fill="${C.panel}" fill-opacity=".55"/>`;
    ts.forEach((t, i) => {
      const r = k * Math.sqrt(i + 0.5), a = i * 2.39996;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      const rad = 1.6 + 7.5 * Math.sqrt(t[6] / maxE);
      const col = t === big ? C.magenta : t[3] === 0 ? C.paper : t[3] === 1 ? C.salmon : C.line;
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${col}" fill-opacity="${t[3] === 0 ? 0.9 : 0.75}"/>`;
    });
    g += stat(56, 300, fmt(n), 'tasks posted in 7 days, both chains') + stat(56, 395, fmt(ents), 'entries, both chains') + stat(56, 490, money(paid), `${T.token} paid out on Tempo`);
    add('replay-view', ['A week in', 'a minute.'], g);
  }

  const fontFiles = ['InstrumentSerif-Regular.ttf', 'InstrumentSerif-Italic.ttf', 'InterTight-Variable.ttf', 'DepartureMono-Regular.otf'].map(F);
  const out = {};
  for (const [id, svg] of Object.entries(cards)) {
    const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter Tight' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
    const name = id.replace('-view', '') + '.png';
    await writeFile(join(outDir, name), png);
    out[id] = name;
  }
  return out;
}
