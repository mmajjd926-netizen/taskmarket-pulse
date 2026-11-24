// Taskmarket Pulse: renders the server-built snapshot. No network calls to the API from the browser.
(() => {
  const D = JSON.parse(document.getElementById('snapshot').textContent);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const u = (s) => Number(s || 0) / 1e6;
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n) => (Math.abs(n) >= 100 || Number.isInteger(n) ? fmt(n, Math.abs(n) >= 100 ? 0 : 0) : fmt(n, 2));
  const per = (n) => (n >= 0.1 ? fmt(n, 2) : fmt(n, 3));
  const pct = (x, d = 0) => fmt(x * 100, d) + '%';
  const short = (a) => (a && a.startsWith('0x') ? a.slice(0, 6) + '…' + a.slice(-4) : a);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const C = { cream: '#EFE9E2', paper: '#FFF6E8', muted: '#B0A79D', line: '#453E37', panel: '#221E1A', salmon: '#D9A097', magenta: '#E74079', ground: '#12100E' };
  const asOf = new Date(D.asOf);
  const ago = (ts) => {
    const s = Math.max(0, (asOf - new Date(ts)) / 1000);
    if (s < 60) return Math.round(s) + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  };

  // Tooltip
  const tip = $('#tip');
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.style.opacity = 0; return; }
    tip.innerHTML = el.getAttribute('data-tip');
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px'; tip.style.opacity = 1;
  });

  // Share buttons: copy the per-view URL (each view has its own page and share card).
  const toast = $('.toast');
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.share');
    if (!b) return;
    const url = new URL(b.dataset.page, location.href).href;
    try {
      if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); toast.textContent = 'Link copied: ' + url; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 2200); }
    } catch { /* user cancelled */ }
  });

  // Segmented controls
  function seg(el, options, value, onChange) {
    el.innerHTML = options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === value}">${l}</button>`).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      onChange(b.dataset.v);
    });
  }

  const P = D.platform;
  const chainByKey = Object.fromEntries(D.chains.map((c) => [c.key, c]));

  // ---------- Headline numbers ----------
  (function headline() {
    const el = $('#headline');
    const keys = [['openTasks', 'Open tasks'], ['activeAgents7d', 'Active agents, 7d'], ['activeWorkers7d', 'Active workers, 7d'], ['paidWorkers', 'Paid workers'], ['activeWallets', 'Active wallets'], ['registeredWorkers', 'Registered workers']];
    let h = '';
    for (const c of D.chains) {
      h += `<div class="chaincard"><div class="c">${c.name} <span class="tag ${c.key}">${c.token} · chainId ${c.id}</span></div><div class="kgrid">` +
        keys.map(([k, l]) => `<div class="kpi" data-tip="<b>${fmt(c.stats[k])}</b> · ${k}<br>/api/market/stats?chainId=${c.id}"><div class="v">${fmt(c.stats[k])}</div><div class="l">${l}</div></div>`).join('') + '</div></div>';
    }
    el.innerHTML = h;
    const same = keys.filter(([k]) => D.chains.every((c) => c.stats[k] === D.chains[0].stats[k])).map(([, l]) => l.toLowerCase());
    $('#headline-note').textContent = same.length ? `Same value for both chains (the API counts these platform-wide): ${same.join(', ')}.` : '';
  })();

  // ---------- Hero mosaic: every task of the last 30 days, one tile each ----------
  (function mosaic() {
    const M = D.mosaic || [];
    const COL = { completed: C.paper, open: C.salmon, claimed: C.muted, pending_approval: C.muted, worker_selected: C.muted, expired: C.line, cancelled: C.line };
    const per = 4, s = 6, gap = 1.6; // 4 tiles across per day
    const maxRows = Math.max(1, ...M.map((d) => Math.ceil(d.items.length / per)));
    const colW = per * (s + gap) + 3;
    const W = M.length * colW, H = maxRows * (s + gap) + 16;
    let big = null;
    M.forEach((d) => d.items.forEach((it) => { if (!big || it[2] > big[2]) big = it; }));
    let g = '';
    M.forEach((d, i) => {
      const cnt = {}; d.items.forEach((it) => (cnt[it[1]] = (cnt[it[1]] || 0) + 1));
      const tipTxt = `<b>${d.d}</b> · ${fmt(d.items.length)} tasks posted<br>` + Object.entries(cnt).map(([k, v]) => `${fmt(v)} ${k.replace('_', ' ')}`).join(' · ');
      d.items.forEach((it, j) => {
        const x = i * colW + (j % per) * (s + gap), y = H - 16 - (Math.floor(j / per) + 1) * (s + gap);
        const hot = it === big;
        g += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.6" fill="${hot ? C.magenta : COL[it[1]] || C.muted}"/>`;
      });
      g += `<rect x="${i * colW - 1}" y="0" width="${colW}" height="${H}" fill="transparent" data-tip="${tipTxt}"/>`;
      if (i % 7 === 0 || i === M.length - 1) g += `<text class="mono" x="${i * colW}" y="${H - 2}" style="font-size:9px">${d.d.slice(5)}</text>`;
    });
    $('#mosaic').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Every task posted in the last 30 days, one tile each, coloured by outcome">${g}</svg>`;
    const all = M.flatMap((d) => d.items); const n = (st) => all.filter((x) => st.includes(x[1])).length;
    $('#mosaic-cap').innerHTML = `<b>Every task of the last 30 days, one tile each</b> (${fmt(all.length)} in the task lists), stacked by the day it was posted.
      <span class="legend" style="display:inline-flex;margin:4px 0 0"><span><i style="background:${C.paper}"></i>completed ${fmt(n(['completed']))}</span><span><i style="background:${C.salmon}"></i>open ${fmt(n(['open']))}</span><span><i style="background:${C.muted}"></i>in progress ${fmt(n(['claimed', 'pending_approval', 'worker_selected']))}</span><span><i style="background:${C.line}"></i>expired or cancelled ${fmt(n(['expired', 'cancelled']))}</span>${big ? `<span><i style="background:${C.magenta}"></i>largest reward: ${esc(big[4])}, ${money(big[2])} ${D.chains[big[0]].token}</span>` : ''}</span>`;
  })();

  // ---------- Insights ----------
  $('#insights').innerHTML = D.insights.map((i) => `<li><div class="big">${esc(i.big)}</div><div class="t">${esc(i.text)}<small>${esc(i.source)}</small></div></li>`).join('');

  // ---------- Swarm ----------
  (function swarm() {
    let chain = 'tempo', sort = 'swarm';
    const el = $('#swarm');
    function draw() {
      const d = chainByKey[chain].derived;
      const list = sort === 'odds' ? (d.odds || []) : d.swarm;
      const max = Math.max(...list.map((t) => t.subs), 1);
      el.innerHTML = list.slice(0, 24).map((t, i) => {
        const n = Math.min(t.subs, 120);
        const dots = Array.from({ length: n }, () => '<i></i>').join('') + (t.subs > 120 ? `<i class="more" title="+${t.subs - 120}"></i>` : '');
        const pe = t.subs ? t.reward / t.subs : t.reward;
        return `<a class="task ${i === 0 ? 'top' : ''}" href="https://taskmarket.dev/tasks/${esc(t.id)}?chain=${chainByKey[chain].id}" target="_blank" rel="noopener"
          data-tip="<b>${esc(t.ref)}</b> · ${esc(t.mode)}<br>${fmt(t.subs)} entries for ${money(t.reward)} ${chainByKey[chain].token}<br>${per(pe)} per entry · posted ${ago(t.createdAt)} ago">
          <div class="meta"><b class="rw">${money(t.reward)} ${chainByKey[chain].token}</b><span>${esc(t.mode)}</span></div>
          <div class="tt">${esc(t.title)}</div>
          <div class="meta"><span>${fmt(t.subs)} entries</span><span>${per(pe)}/entry</span></div>
          <div class="pix" style="--m:${max}">${dots}</div></a>`;
      }).join('') || '<p class="note">No open tasks in the task list right now.</p>';
      const L = d.liveTotals;
      $('#swarm-note').textContent = `${fmt(L.tasks)} open tasks in the ${chainByKey[chain].name} task list hold ${money(L.reward)} ${chainByKey[chain].token} and have drawn ${fmt(L.subs)} entries; ${fmt(L.zero)} have none yet. One square = one entry. ${sort === 'odds' ? 'Sorted by reward per entry if you entered now: reward / (entries + 1).' : 'Top 24 by entries.'}`;
    }
    seg($('#swarm-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
    seg($('#swarm-sort'), [['swarm', 'Most entries'], ['odds', 'Best odds']], sort, (v) => { sort = v; draw(); });
    draw();
  })();

  // ---------- Money flow (Sankey) ----------
  (function flow() {
    let chain = 'base';
    const el = $('#flow');
    function draw() {
      const c = chainByKey[chain], f = c.derived.flow;
      const W = 1000, H = 520, nodeW = 14, gap = 8, top = 24;
      const total = f.total || 1;
      const layout = (arr) => {
        const avail = H - top - gap * (arr.length - 1);
        let y = top;
        return arr.map((n) => { const h = Math.max(2, (n.value / total) * avail); const o = { ...n, y, h }; y += h + gap; return o; });
      };
      const S = layout(f.sources), T = layout(f.targets);
      const sOff = Object.fromEntries(S.map((n) => [n.id, n.y])), tOff = Object.fromEntries(T.map((n) => [n.id, n.y]));
      const x0 = 230, x1 = W - 250;
      const sorted = [...f.links].sort((a, b) => S.findIndex((n) => n.id === a.source) - S.findIndex((n) => n.id === b.source) || T.findIndex((n) => n.id === a.target) - T.findIndex((n) => n.id === b.target));
      const avail = H - top - gap * (Math.max(S.length, T.length) - 1);
      let paths = '';
      for (const l of sorted) {
        const s = S.find((n) => n.id === l.source), t = T.find((n) => n.id === l.target);
        if (!s || !t) continue;
        const hs = (l.value / total) * (H - top - gap * (S.length - 1));
        const ht = (l.value / total) * (H - top - gap * (T.length - 1));
        const ys = sOff[l.source], yt = tOff[l.target];
        sOff[l.source] += hs; tOff[l.target] += ht;
        const xm = (x0 + nodeW + x1) / 2;
        const d = `M${x0 + nodeW},${ys} C${xm},${ys} ${xm},${yt} ${x1},${yt} L${x1},${yt + ht} C${xm},${yt + ht} ${xm},${ys + hs} ${x0 + nodeW},${ys + hs} Z`;
        const hot = s.id === f.sources[0].id && t.id === f.targets[0].id;
        paths += `<path d="${d}" fill="${hot ? C.magenta : (s.id === 'others' ? C.muted : C.salmon)}" fill-opacity="${hot ? 0.55 : 0.22}" data-tip="<b>${money(l.value)} ${c.token}</b><br>${esc(s.name || short(s.id))} → ${esc(short(t.id))}"/>`;
      }
      // Labels: full (name, address, value) when the node is tall, one line when short, none when tiny or crowded.
      const placed = { l: -1e9, r: -1e9 };
      const label = (n, side) => {
        const nm = n.id === 'others' ? (side === 'l' ? 'All other posters' : 'All other winners') : (side === 'l' ? (n.name || short(n.id)) : short(n.id));
        const tx = side === 'l' ? x0 - 10 : x1 + nodeW + 10, anchor = side === 'l' ? 'end' : 'start';
        const yc = n.y + n.h / 2;
        const val = `${money(n.value)}${side === 'r' && n.tasks ? ' · ' + n.tasks + (n.tasks === 1 ? ' win' : ' wins') : ''}`;
        if (yc - placed[side] < 16) return '';
        if (n.h >= 40 || yc - placed[side] >= 40) {
          placed[side] = yc + 14;
          return `<text x="${tx}" y="${yc - 2}" text-anchor="${anchor}" fill="${C.cream}" style="font-size:13px">${esc(nm)}</text>
            <text class="mono" x="${tx}" y="${yc + 13}" text-anchor="${anchor}" style="font-size:11px;fill:${C.paper}">${val}</text>`;
        }
        placed[side] = yc;
        return `<text x="${tx}" y="${yc + 4}" text-anchor="${anchor}" fill="${C.cream}" style="font-size:12px">${esc(nm)} <tspan class="mono" style="font-size:11px;fill:${C.paper}">${val}</tspan></text>`;
      };
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="Reward flow from posters to winners on ${c.name}">
        <text x="${x0 + nodeW}" y="12" style="font-size:12px">POSTERS (who paid)</text>
        <text x="${x1}" y="12" text-anchor="end" style="font-size:12px">WINNERS (who got paid)</text>
        ${paths}
        ${S.map((n) => `<rect x="${x0}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${C.paper}" data-tip="<b>${money(n.value)} ${c.token}</b><br>${esc(n.name || short(n.id))}"/>${label(n, 'l')}`).join('')}
        ${T.map((n) => `<rect x="${x1}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${C.paper}" data-tip="<b>${money(n.value)} ${c.token}</b><br>${esc(short(n.id))} · ${n.tasks} wins"/>${label(n, 'r')}`).join('')}
      </svg>`;
      $('#flow-note').innerHTML = `${fmt(f.tasks)} completed tasks in the ${c.name} task list moved <b class="mono">${money(f.total)} ${c.token}</b> from ${fmt(f.payers)} posters to ${fmt(f.winners)} winners. Amounts are what each winner was paid (<code>awards[].workerPayment</code> from <code>/api/tasks/&lt;id&gt;</code>, ${fmt(f.fromAwards)} of ${fmt(f.tasks)} tasks; the rest by <code>primaryAward</code> and the task reward), so pools split among several winners show every winner. The top flow is highlighted. Names are the display names the API returns; winners are shown by address only.`;
      void avail;
    }
    seg($('#flow-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
    draw();
  })();

  // ---------- Decisions ----------
  (function decisions() {
    let chain = 'tempo';
    const dur = (sec) => (sec < 3600 ? fmt(sec / 60, 0) + ' min' : sec < 172800 ? fmt(sec / 3600, 1) + ' h' : fmt(sec / 86400, 1) + ' days');
    function draw() {
      const c = chainByKey[chain], k = c.derived.decisions;
      if (!k || !k.n) { $('#decide-kpis').innerHTML = '<p class="note">Not enough completed tasks with award data yet.</p>'; return; }
      const firstQ = k.withPos ? k.quartiles[0].n / k.withPos : 0;
      $('#decide-kpis').innerHTML = [
        [dur(k.medianFirstEntryMin * 60), 'median wait for the first entry'],
        [dur(k.medianPayoutH * 3600), 'median time from posting to the first payout'],
        [fmt(k.medianAtDecision), 'median entries in by the time of the payout'],
        [pct(firstQ), 'of winning entries came in the first quarter of arrivals'],
      ].map(([v, l], i) => `<div class="panel kpi"><div class="v" ${i === 3 ? 'style="color:var(--magenta)"' : ''}>${v}</div><div class="l">${l}</div></div>`).join('');
      const maxB = Math.max(...k.payoutBuckets.map((b) => b.n), 1);
      $('#decide-payout').innerHTML = k.payoutBuckets.map((b) => `<div style="display:grid;grid-template-columns:80px 1fr 50px;gap:10px;align-items:center;margin:8px 0" data-tip="<b>${fmt(b.n)}</b> tasks paid ${b.label} after posting">
        <span style="font-size:13px">${b.label}</span><span style="height:14px;border-radius:4px;background:${C.cream};opacity:.85;width:${(b.n / maxB) * 100}%"></span><span style="font-family:var(--mono);text-align:right;font-size:13px">${fmt(b.n)}</span></div>`).join('');
      const labels = ['First quarter', 'Second quarter', 'Third quarter', 'Last quarter'];
      $('#decide-early').innerHTML = k.quartiles.map((q, i) => `<div style="display:grid;grid-template-columns:110px 1fr 50px;gap:10px;align-items:center;margin:8px 0" data-tip="<b>${fmt(q.n)}</b> of ${fmt(k.withPos)} winning entries">
        <span style="font-size:13px">${labels[i]}</span><span style="position:relative;height:14px;border-radius:4px;background:${i === 0 ? C.magenta : C.salmon};opacity:${i === 0 ? 1 : 0.75};width:${k.withPos ? (q.n / k.withPos) * 100 : 0}%"></span><span style="font-family:var(--mono);text-align:right;font-size:13px">${pct(k.withPos ? q.n / k.withPos : 0)}</span></div>`).join('') +
        `<p class="note">Where the primary winning entry sat in the order of arrival, for ${fmt(k.withPos)} completed tasks with at least 4 entries. If order did not matter, each quarter would hold about 25%.${k.single ? ` Pools that pay many entrants lift this; on the ${fmt(k.single)} tasks with a single winner, ${pct(k.singleFirstQ)} of winners entered in the first quarter.` : ''}</p>`;
      // Race strips (log time axis)
      const W = 1000, Hs = 54, L = 300;
      $('#decide-races').innerHTML = k.races.map((r) => {
        const tMax = Math.max(r.payout, ...r.entries, 3600) * 1.15, tMin = 30;
        const X = (sec) => L + ((Math.log(Math.max(sec, tMin)) - Math.log(tMin)) / (Math.log(tMax) - Math.log(tMin))) * (W - L - 10);
        let g = `<line x1="${L}" x2="${W - 10}" y1="${Hs / 2}" y2="${Hs / 2}" stroke="${C.line}"/>`;
        const dl = (x) => (((x - L) / (W - L)) * 2.4).toFixed(2); // replay: dots appear in order of arrival
        r.entries.forEach((e, i) => { g += `<rect class="ar" style="animation-delay:${dl(X(e))}s" x="${X(e) - 2.5}" y="${Hs / 2 - 9 + (i % 4) * 4.5}" width="5" height="5" rx="1.2" fill="${C.paper}" fill-opacity=".7"/>`; });
        r.wins.forEach((w) => { g += `<rect class="ar" style="animation-delay:${dl(X(w))}s" x="${X(w) - 4}" y="${Hs / 2 - 6}" width="9" height="9" rx="2" fill="${C.magenta}" data-tip="winning entry, ${dur(w)} after posting"/>`; });
        g += `<line x1="${X(r.payout)}" x2="${X(r.payout)}" y1="6" y2="${Hs - 6}" stroke="${C.salmon}" stroke-width="2"/><text class="mono" x="${X(r.payout) - 6}" y="12" text-anchor="end" style="font-size:10px;fill:${C.salmon}">paid after ${dur(r.payout)}</text>`;
        g += `<text x="0" y="${Hs / 2 - 3}" style="font-size:12.5px;fill:${C.cream}">${esc(r.title.slice(0, 44))}${r.title.length > 44 ? '…' : ''}</text>
          <text class="mono" x="0" y="${Hs / 2 + 13}" style="font-size:10.5px">${esc(r.ref)} · ${money(r.reward)} ${c.token} · ${fmt(r.n)} entries · ${r.winners} paid</text>`;
        return `<a href="https://taskmarket.dev/tasks/${esc(r.id)}?chain=${c.id}" target="_blank" rel="noopener" style="display:block;text-decoration:none"><svg viewBox="0 0 ${W} ${Hs}" style="min-width:560px">${g}</svg></a>`;
      }).join('<div style="height:6px"></div>') + `<div style="display:flex;justify-content:space-between;padding-left:30%;font-family:var(--mono);font-size:10.5px;color:var(--muted)"><span>1 min</span><span>→ later</span></div>`;
      $('#decide-races').style.overflowX = 'auto';
      const box = $('#decide-races');
      box.classList.remove('play');
      new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { box.classList.add('play'); o.disconnect(); } }), { threshold: 0.3 }).observe(box);
      $('#decide-note').innerHTML = `Computed from ${fmt(k.n)} of ${fmt(k.completed)} completed ${c.name} tasks, using <code>/api/tasks/&lt;id&gt;</code> (<code>awards[].settledAt</code>, <code>workerPayment</code>, <code>submissionId</code>) and <code>/api/tasks/&lt;id&gt;/submissions</code> (<code>submittedAt</code>). A completed task never changes, so each is fetched once and cached; new ones are added on every build. The race strips are the 6 newest completed tasks with at least 12 entries.`;
    }
    seg($('#decide-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
    draw();
  })();

  // ---------- Where tasks stall ----------
  (function stall() {
    let chain = 'base';
    const wait = (h) => (h < 48 ? fmt(h, 0) + ' h' : fmt(h / 24, 0) + ' days');
    const row = (label, w, val, tip, color, op = 0.85) => `<div style="display:grid;grid-template-columns:96px 1fr 92px;gap:10px;align-items:center;margin:8px 0" data-tip="${tip}">
      <span style="font-size:13px">${label}</span><span style="height:14px;border-radius:4px;background:${color};opacity:${op};width:${Math.max(w, 0.6)}%"></span><span style="font-family:var(--mono);text-align:right;font-size:12.5px">${val}</span></div>`;
    const link = (t, c) => `<a href="https://taskmarket.dev/tasks/${esc(t.id)}?chain=${c.id}" target="_blank" rel="noopener" style="color:var(--cream);text-decoration:none">${esc(t.title.slice(0, 54))}${t.title.length > 54 ? '…' : ''}</a><div class="mono" style="font-size:10.5px;color:var(--muted)">${esc(t.ref)} · ${esc(t.mode)}</div>`;
    function draw() {
      const c = chainByKey[chain], s = c.derived.stall;
      if (!s) return;
      const L = s.limbo, br = (m) => s.modeRates.find((x) => x.mode === m);
      const cl = br('claim'), bo = br('bounty');
      $('#stall-kpis').innerHTML = [
        [fmt(L.n), 'tasks past their deadline and not settled', `${money(L.reward)} ${c.token} held · ${fmt(L.subs)} entries waiting`],
        [wait(L.oldestH), 'the longest any of them has waited', `${fmt(L.week)} have waited over a week`],
        [pct(s.died / Math.max(1, s.ended)), 'of ended tasks died (expired or cancelled)', `${fmt(s.died)} of ${fmt(s.ended)} ended tasks`],
        [cl && bo ? `${pct(cl.died / cl.n)} vs ${pct(bo.died / bo.n)}` : '–', 'of claim tasks died, against bounties', cl && bo ? `${fmt(cl.n)} claim, ${fmt(bo.n)} bounty tasks ended` : ''],
      ].map(([v, l, sub], i) => `<div class="panel kpi"><div class="v" ${i === 0 ? 'style="color:var(--magenta)"' : ''}>${v}</div><div class="l">${l}</div><div class="s">${sub}</div></div>`).join('');
      const mxL = Math.max(...L.buckets.map((b) => b.n), 1);
      $('#stall-limbo').innerHTML = L.buckets.map((b, i) => row(b.label, (b.n / mxL) * 100, `${fmt(b.n)} · ${money(b.reward)}`, `<b>${fmt(b.n)}</b> tasks, ${money(b.reward)} ${c.token}, ${fmt(b.subs)} entries waiting`, i >= 3 ? C.magenta : C.salmon, i >= 3 ? 1 : 0.8)).join('') +
        `<p class="note">How long past the deadline each unsettled task is: count · reward held (${c.token}). Recent ones are normal (pools pay by rule after the close); weeks-old ones hold entrants' work and the poster's money in escrow.</p>`;
      $('#stall-rates').innerHTML = `<div class="l" style="font-size:12px;color:var(--muted);margin-bottom:2px">by reward size (${c.token})</div>` +
        s.rewardRates.filter((r) => r.n).map((r) => row(r.label, (r.died / r.n) * 100, `${pct(r.died / r.n)} of ${fmt(r.n)}`, `<b>${fmt(r.died)}</b> of ${fmt(r.n)} ended tasks died`, C.cream, 0.8)).join('') +
        `<div class="l" style="font-size:12px;color:var(--muted);margin:12px 0 2px">by mode</div>` +
        s.modeRates.filter((r) => r.n >= 3).map((r) => row(r.mode, (r.died / r.n) * 100, `${pct(r.died / r.n)} of ${fmt(r.n)}`, `<b>${fmt(r.died)}</b> of ${fmt(r.n)} ended ${esc(r.mode)} tasks died`, r.died / r.n > 0.5 ? C.magenta : C.cream, r.died / r.n > 0.5 ? 1 : 0.8)).join('');
      const tbl = (rows, cols) => rows.length ? `<table class="t"><thead><tr><th>Task</th>${cols.map((x) => `<th style="text-align:right">${x[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((t) => `<tr><td>${link(t, c)}</td>${cols.map((x) => `<td class="n">${x[1](t)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="note">None in the task list.</p>';
      $('#stall-oldest').innerHTML = tbl(L.top.slice(0, 6), [['Reward', (t) => money(t.reward)], ['Entries', (t) => fmt(t.subs)], ['Past deadline', (t) => wait(t.pastH)]]);
      $('#stall-entered').innerHTML = tbl(s.diedEntered.top, [['Reward', (t) => money(t.reward)], ['Entries', (t) => fmt(t.subs)], ['Ended', (t) => esc(t.status)]]) +
        `<p class="note">${fmt(s.diedEntered.n)} ${c.name} tasks expired or were cancelled after drawing ${fmt(s.diedEntered.subs)} entries in all; their ${money(s.diedEntered.reward)} ${c.token} went back to the posters.</p>`;
      $('#stall-note').innerHTML = `From <code>/api/tasks</code> (${c.name} task list): <code>status</code>, <code>phase</code>, <code>expiryTime</code>, <code>submissionCount</code>, <code>reward</code>, <code>mode</code>. "Past the deadline, not settled" is <code>phase = awaiting_settlement</code> with <code>expiryTime</code> before the data-as-of time. "Died" is status <code>expired</code> or <code>cancelled</code>; "ended" adds <code>completed</code>.`;
    }
    seg($('#stall-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
    draw();
  })();

  // ---------- What is growing ----------
  (function grow() {
    let chain = 'tempo', dim = 'kind', metric = 'tasks', win = 'w7';
    if (!D.chains.every((c) => c.derived.growMix)) return;
    const DIMS = [['kind', 'Kind of work'], ['mode', 'Mode'], ['gate', 'Identity'], ['poster', 'Poster']];
    const METRICS = [['tasks', 'Tasks'], ['reward', 'Rewards'], ['posters', 'Posters']];
    const chg = (a, b) => (b ? (a - b) / b : null);
    const chs = (x) => (x == null ? 'new' : (x >= 0 ? '+' : '−') + fmt(Math.abs(x) * 100, 0) + '%');
    const day = (iso) => new Date(iso).toISOString().slice(5, 10).replace('-', '/');
    function draw() {
      const c = chainByKey[chain], G = c.derived.growMix, g = G[win];
      const unit = metric === 'reward' ? ' ' + c.token : '';
      const val = (x) => (metric === 'reward' ? money(x) : fmt(x));
      const rows = g[dim].filter((r) => r.last[metric] + r.prev[metric] > 0);
      const T = g.total;
      // KPIs
      const kinds = g.kind.filter((r) => r.key !== 'Untagged' && r.key !== 'Other tags' && r.last.tasks + r.prev.tasks >= 6);
      const shareOf = (r, w) => (T[w].tasks ? r[w].tasks / T[w].tasks : 0);
      const mover = kinds.map((r) => ({ r, d: shareOf(r, 'last') - shareOf(r, 'prev') })).sort((a, b) => b.d - a.d);
      const up = mover[0], down = mover[mover.length - 1];
      const gate = g.gate.find((r) => r.key === 'Verified identity required');
      const gs = (w) => (gate && T[w].tasks ? gate[w].tasks / T[w].tasks : 0);
      $('#grow-kpis').innerHTML = [
        [chs(chg(T.last.tasks, T.prev.tasks)), `tasks posted: ${fmt(T.last.tasks)} in the last ${g.days} days`, `against ${fmt(T.prev.tasks)} in the ${g.days} before · rewards ${chs(chg(T.last.reward, T.prev.reward))}`],
        [up && up.d > 0 ? up.r.key : '–', 'gained the most share of tasks', up && up.d > 0 ? `${pct(shareOf(up.r, 'prev'))} → ${pct(shareOf(up.r, 'last'))} of all tasks posted` : 'no kind gained share'],
        [down && down.d < 0 ? down.r.key : '–', 'lost the most share', down && down.d < 0 ? `${pct(shareOf(down.r, 'prev'))} → ${pct(shareOf(down.r, 'last'))} of all tasks posted` : 'no kind lost share'],
        [pct(gs('last')), 'of new tasks require a verified identity', `${pct(gs('prev'))} in the ${g.days} days before`],
      ].map(([v, l, sub], i) => `<div class="panel kpi"><div class="v" style="${i === 1 ? 'color:var(--magenta);' : ''}${String(v).length > 8 ? 'font-size:clamp(18px,2.4vw,26px);line-height:1.15;overflow-wrap:anywhere' : ''}">${esc(v)}</div><div class="l">${l}</div><div class="s">${sub}</div></div>`).join('');
      // Slope chart (square-root scale so small groups stay visible)
      const narrow = ($('#grow-slope').clientWidth || 600) < 520;
      const W = narrow ? 400 : 620, H = narrow ? 380 : 356, xl = narrow ? 52 : 150, xr = narrow ? 200 : 410, top = 34, bot = H - 40;
      const mx = Math.max(1, ...rows.flatMap((r) => [r.last[metric], r.prev[metric]]));
      const y = (v) => bot - Math.sqrt(v / mx) * (bot - top);
      const place = (arr) => { const a = arr.map((o) => ({ ...o })).sort((p, q) => p.y - q.y); for (let i = 1; i < a.length; i++) if (a[i].y - a[i - 1].y < 17) a[i].y = a[i - 1].y + 17; const over = a.length ? a[a.length - 1].y - (bot + 8) : 0; if (over > 0) a.forEach((o) => (o.y -= over)); return a; };
      const L = place(rows.map((r) => ({ k: r.key, y: y(r.prev[metric]), v: r.prev[metric] })));
      const R = place(rows.map((r) => ({ k: r.key, y: y(r.last[metric]), v: r.last[metric], c: chg(r.last[metric], r.prev[metric]) })));
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Slope chart, previous 28 days to last 28 days">`;
      svg += `<text x="${xl}" y="16" text-anchor="middle" font-family="var(--mono)" font-size="11" fill="${C.muted}">${day(g.window.prevFrom)}–${day(g.window.lastFrom)}</text><text x="${xr}" y="16" text-anchor="middle" font-family="var(--mono)" font-size="11" fill="${C.muted}">${day(g.window.lastFrom)}–${day(g.window.to)}</text>`;
      svg += `<line x1="${xl}" y1="${top - 8}" x2="${xl}" y2="${bot}" stroke="${C.line}"/><line x1="${xr}" y1="${top - 8}" x2="${xr}" y2="${bot}" stroke="${C.line}"/>`;
      rows.forEach((r) => {
        const a = r.prev[metric], b = r.last[metric], c2 = chg(b, a);
        const dsh = b / Math.max(1e-9, T.last[metric] || 0) - a / Math.max(1e-9, T.prev[metric] || 0);
        const col = dsh > 0.005 ? C.magenta : dsh < -0.005 ? C.salmon : C.cream;
        const lab = R.find((o) => o.k === r.key), lal = L.find((o) => o.k === r.key);
        const tipx = `<b>${esc(r.key)}</b><br>${val(a)}${unit} → ${val(b)}${unit} (${chs(c2)})<br>${fmt(r.prev.posters)} → ${fmt(r.last.posters)} posters`;
        svg += `<g data-tip="${esc(tipx)}"><line x1="${xl}" y1="${y(a)}" x2="${xr}" y2="${y(b)}" stroke="${col}" stroke-width="${Math.abs(dsh) > 0.02 ? 3.2 : 1.6}" opacity=".9" stroke-linecap="round"/>
          <circle cx="${xl}" cy="${y(a)}" r="4.5" fill="${col}"/><circle cx="${xr}" cy="${y(b)}" r="4.5" fill="${col}"/>
          <line x1="${xr + 6}" y1="${y(b)}" x2="${xr + 14}" y2="${lab.y}" stroke="${C.line}"/><line x1="${xl - 6}" y1="${y(a)}" x2="${xl - 14}" y2="${lal.y}" stroke="${C.line}"/>
          <text x="${xr + 18}" y="${lab.y + 4}" font-size="${narrow ? 13 : 12.5}" fill="${C.cream}">${esc(r.key)} <tspan font-family="var(--mono)" fill="${col}">${chs(c2)}</tspan></text>
          <text x="${xl - 18}" y="${lal.y + 4}" text-anchor="end" font-family="var(--mono)" font-size="11.5" fill="${C.muted}">${val(a)}</text></g>`;
      });
      svg += `<text x="0" y="${H - 4}" font-size="11" fill="${C.muted}"><tspan fill="${C.magenta}">●</tspan> gaining share  <tspan fill="${C.salmon}">●</tspan> losing share  <tspan fill="${C.cream}">●</tspan> same${narrow ? '' : ' · square-root scale'}</text>`;
      svg += '</svg>';
      $('#grow-slope').innerHTML = rows.length ? svg : '<p class="note">No tasks in these windows.</p>';
      $('#grow-slope-h').textContent = `${METRICS.find((m) => m[0] === metric)[1]} by ${DIMS.find((d) => d[0] === dim)[1].toLowerCase()}, before and after`;
      // Movers table: share of the whole market in each window
      const tm = (w) => Math.max(1e-9, T[w][metric] || 0);
      const tr = [...rows].sort((a, b) => (b.last[metric] / tm('last') - b.prev[metric] / tm('prev')) - (a.last[metric] / tm('last') - a.prev[metric] / tm('prev')));
      $('#grow-table').innerHTML = `<table class="t"><thead><tr><th>${DIMS.find((d) => d[0] === dim)[1]}</th><th style="text-align:right">Before</th><th style="text-align:right">Now</th><th style="text-align:right">Change</th><th style="text-align:right">Share</th></tr></thead><tbody>` +
        tr.map((r) => { const d = r.last[metric] / tm('last') - r.prev[metric] / tm('prev'); return `<tr><td>${esc(r.key)}</td><td class="n">${val(r.prev[metric])}</td><td class="n">${val(r.last[metric])}</td><td class="n">${chs(chg(r.last[metric], r.prev[metric]))}</td><td class="n" style="color:${d > 0.005 ? C.magenta : d < -0.005 ? C.salmon : C.muted}">${d >= 0 ? '+' : '−'}${fmt(Math.abs(d) * 100, 1)} pt</td></tr>`; }).join('') + '</tbody></table>' +
        `<p class="note">Share = the group's part of all ${metric === 'reward' ? 'rewards put up' : metric === 'posters' ? 'posters (a poster can be in several groups)' : 'tasks posted'} on ${c.name} in each window; the column shows how many percentage points it moved.</p>`;
      $('#grow-note').innerHTML = `From <code>/api/tasks</code> (${c.name} task list), grouped by <code>createdAt</code> into two back-to-back rolling windows of ${g.days} days ending at the data-as-of time (the current one, and the one before it). Kind of work comes from each task's <code>tags</code> (${fmt(G.tagged)} of ${fmt(G.listed)} listed tasks have tags; <code>tap:*</code> tags are ignored; tasks without tags are "Untagged"). Mode is <code>mode</code>; identity is whether <code>verifiedBy</code> is set; poster is <code>requesterActorType</code>. Posters are distinct <code>requester</code> addresses.`;
    }
    seg($('#grow-win'), [['w7', '7 d'], ['w28', '28 d']], win, (v) => { win = v; draw(); });
    seg($('#grow-dim'), DIMS, dim, (v) => { dim = v; draw(); });
    seg($('#grow-metric'), METRICS, metric, (v) => { metric = v; draw(); });
    seg($('#grow-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
    draw();
  })();

  // ---------- Trends (small multiples) ----------
  (function trends() {
    let range = '30d', chain = D.chains[0].key;
    const metrics = [['activeAgents', 'Daily active agents', false], ['tasksCreated', 'Tasks posted', false], ['rewardVolume', 'Rewards put up (USD stablecoin)', true], ['paidVolume', 'Rewards paid (USD stablecoin)', true]];
    const el = $('#trends');
    function bars(rows, key, isMoney, bucket) {
      const W = 520, H = 170, padL = 4, padB = 22;
      const vals = rows.map((r) => (isMoney ? u(r[key]) : Number(r[key] || 0)));
      const max = Math.max(...vals, 1);
      const bw = (W - padL) / rows.length;
      const total = vals.reduce((s, v) => s + v, 0);
      const peakI = vals.indexOf(Math.max(...vals));
      let g = '';
      rows.forEach((r, i) => {
        const h = (vals[i] / max) * (H - padB - 10);
        g += `<rect x="${padL + i * bw + bw * 0.12}" y="${H - padB - h}" width="${Math.max(1, bw * 0.76)}" height="${Math.max(h, vals[i] ? 1 : 0)}" rx="${Math.min(3, bw / 4)}" fill="${i === peakI ? C.magenta : C.cream}" fill-opacity="${i === peakI ? 1 : 0.8}"
          data-tip="<b>${isMoney ? money(vals[i]) : fmt(vals[i])}</b><br>${bucket === 'week' ? 'week of ' : ''}${r.bucket}"/>
          <rect x="${padL + i * bw}" y="0" width="${bw}" height="${H - padB}" fill="transparent" data-tip="<b>${isMoney ? money(vals[i]) : fmt(vals[i])}</b><br>${bucket === 'week' ? 'week of ' : ''}${r.bucket}"/>`;
      });
      const first = rows[0]?.bucket || '', last = rows[rows.length - 1]?.bucket || '';
      return { svg: `<svg viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="${C.line}"/>${g}
        <text class="mono" x="0" y="${H - 6}">${first}</text><text class="mono" x="${W}" y="${H - 6}" text-anchor="end">${last}</text>
        <text class="mono" x="${W}" y="10" text-anchor="end">max ${isMoney ? money(max) : fmt(max)}</text></svg>`, total, peak: rows[peakI] };
    }
    function draw() {
      const s = (P.byChain[chain] || P.byChain[D.chains[0].key]).series[range];
      const rows = s.rows.filter((r, i, a) => range !== 'all' || a.slice(0, i + 1).some((x) => Number(x.tasksCreated) > 0 || Number(x.activeAgents) > 0));
      el.innerHTML = metrics.map(([k, l, m]) => {
        const b = bars(rows, k, m, s.bucket);
        const tot = k === 'activeAgents' ? `peak ${fmt(Math.max(...rows.map((r) => Number(r[k]))))}` : `total ${m ? money(b.total) : fmt(b.total)}`;
        return `<div class="panel"><h3>${l}</h3><div class="kpi"><div class="s">${tot} · by ${s.bucket}</div></div>${b.svg}</div>`;
      }).join('');
    }
    seg($('#trend-range'), [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']], range, (v) => { range = v; draw(); });
    if (!P.sameAcrossChains.series) seg($('#trend-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
    else $('#trend-chain').outerHTML = `<span class="tag">Tempo + Base combined</span>`;
    draw();
  })();

  // ---------- Mix: modes and status ----------
  (function mix() {
    const bd = (P.byChain[D.chains[0].key]).breakdowns;
    const hbar = (rows, labelKey) => {
      const tot = rows.reduce((s, r) => s + r.count, 0); const max = Math.max(...rows.map((r) => r.count), 1);
      return rows.sort((a, b) => b.count - a.count).map((r, i) => `<div style="display:grid;grid-template-columns:120px 1fr 70px;gap:10px;align-items:center;margin:7px 0" data-tip="<b>${fmt(r.count)}</b> tasks · ${pct(r.count / tot, 1)}">
        <span style="font-size:13px">${esc(r[labelKey].replace('_', ' '))}</span>
        <span style="height:12px;border-radius:4px;background:${i === 0 ? C.cream : C.salmon};opacity:${i === 0 ? 0.9 : 0.75};width:${(r.count / max) * 100}%"></span>
        <span class="mono" style="font-family:var(--mono);text-align:right;font-size:13px">${fmt(r.count)}</span></div>`).join('');
    };
    $('#mix-mode').innerHTML = hbar([...bd.mode], 'mode');
    $('#mix-status').innerHTML = hbar([...bd.status], 'status');
    const actor = bd.actorType || [];
    $('#mix-note').innerHTML = `From <code>/api/stats/breakdowns</code> (all tasks, both chains${P.sameAcrossChains.breakdowns ? '; the endpoint returns the same totals for either chainId' : ''}). Registered actors: ${actor.map((a) => `${fmt(a.count)} ${esc(a.actorType)}`).join(', ')}.`;
    // Per chain status from the task list
    const order = ['completed', 'open', 'claimed', 'pending_approval', 'worker_selected', 'expired', 'cancelled'];
    const col = { completed: C.cream, open: C.salmon, claimed: C.muted, pending_approval: C.muted, worker_selected: C.muted, expired: C.line, cancelled: '#2f2925' };
    $('#mix-chain').innerHTML = D.chains.map((c) => {
      const st = c.derived.status; const tot = Object.values(st).reduce((s, v) => s + v, 0) || 1;
      return `<div style="margin:10px 0 14px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${c.name} task list</span><span style="font-family:var(--mono)">${fmt(tot)} tasks</span></div>
        <div style="display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid ${C.line}">${order.filter((k) => st[k]).map((k) => `<span style="width:${(st[k] / tot) * 100}%;background:${col[k]}" data-tip="<b>${fmt(st[k])}</b> ${k.replace('_', ' ')} · ${pct(st[k] / tot, 1)}"></span>`).join('')}</div></div>`;
    }).join('') + `<div class="legend">${order.slice(0, 7).map((k) => `<span><i style="background:${col[k]};border:1px solid ${C.line}"></i>${k.replace('_', ' ')}</span>`).join('')}</div>`;
  })();

  // ---------- Heatmap ----------
  (function heat() {
    let dim = 'hourOfWeek', range = '30d';
    const el = $('#heat');
    function draw() {
      const h = (P.byChain[D.chains[0].key]).heatmap[dim][range];
      const rows = h.rowKeys, cols = h.colKeys;
      const map = new Map(h.cells.map((c) => [c.row + '|' + c.col, c]));
      const max = Math.max(...h.cells.map((c) => c.count), 1);
      const peak = h.cells.reduce((m, c) => (c.count > (m?.count || 0) ? c : m), null);
      const cw = dim === 'hourOfWeek' ? 34 : Math.max(10, Math.min(34, 860 / cols.length)), ch = 26, lx = 80, ty = 18;
      const W = lx + cols.length * cw, H = ty + rows.length * ch + 4;
      let g = '';
      rows.forEach((r, i) => {
        g += `<text x="${lx - 10}" y="${ty + i * ch + ch / 2 + 4}" text-anchor="end" style="font-size:12px">${dim === 'hourOfWeek' ? DAYS[Number(r)] : esc(r)}</text>`;
        cols.forEach((c, j) => {
          const cell = map.get(r + '|' + c); const v = cell?.count || 0;
          const isPeak = cell && cell === peak;
          const op = v ? 0.05 + 0.95 * Math.pow(v / max, 1.1) : 0;
          const lbl = dim === 'hourOfWeek' ? `${DAYS[Number(r)]} ${String(c).padStart(2, '0')}:00 UTC` : `${esc(r)}, ${c}`;
          const vol = cell && Number(cell.volume) ? `<br>${money(u(cell.volume))} reward` : '';
          g += `<rect x="${lx + j * cw + 1.5}" y="${ty + i * ch + 1.5}" width="${cw - 3}" height="${ch - 3}" rx="5" fill="${isPeak ? C.magenta : C.paper}" fill-opacity="${isPeak ? 1 : op}" stroke="${C.line}" stroke-opacity="${v ? 0 : 0.8}" data-tip="<b>${fmt(v)}</b> events<br>${lbl}${vol}"/>`;
        });
      });
      const step = dim === 'hourOfWeek' ? 3 : Math.ceil(cols.length / 8);
      cols.forEach((c, j) => { if (j % step === 0) g += `<text class="mono" x="${lx + j * cw + 2}" y="12" style="font-size:10px">${dim === 'hourOfWeek' ? String(c).padStart(2, '0') : String(c).slice(5)}</text>`; });
      el.innerHTML = `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px">${g}</svg></div>`;
      $('#heat-note').innerHTML = peak ? `Busiest cell: <b class="hl">${dim === 'hourOfWeek' ? `${DAYS[Number(peak.row)]} ${String(peak.col).padStart(2, '0')}:00 UTC` : `${esc(peak.row)} on ${peak.col}`}</b>, ${fmt(peak.count)} events. ${dim === 'hourOfWeek' ? 'Rows are days (UTC, Sunday = 0 as returned by the API), columns are hours.' : 'Rows are task modes, columns are days.'} Source: <code>/api/stats/activity-heatmap?dimension=${dim}&amp;range=${range}</code>.` : '';
    }
    seg($('#heat-dim'), [['hourOfWeek', 'Hour of week'], ['mode', 'By mode']], dim, (v) => { dim = v; draw(); });
    seg($('#heat-range'), [['7d', '7d'], ['30d', '30d'], ['90d', '90d']], range, (v) => { range = v; draw(); });
    draw();
  })();

  // ---------- Posters ----------
  (function posters() {
    let chain = 'all';
    function draw() {
      const d = chain === 'all' ? D.all : chainByKey[chain].derived;
      const w = d.postersPerWeek;
      const W = 620, H = 220, padB = 24, max = Math.max(...w.map((x) => x.posters), 1), bw = W / Math.max(w.length, 1);
      let g = '';
      w.forEach((x, i) => {
        const h = (x.posters / max) * (H - padB - 16), hn = (x.newPosters / max) * (H - padB - 16);
        const tipTxt = `<b>${x.posters}</b> distinct posters, week of ${x.week}<br>${x.newPosters} posting for the first time<br>${fmt(x.tasks)} tasks · ${money(x.reward)} put up`;
        g += `<rect x="${i * bw + bw * 0.12}" y="${H - padB - h}" width="${bw * 0.76}" height="${h - hn}" rx="3" fill="${C.cream}" fill-opacity=".85" data-tip="${tipTxt}"/>
          <rect x="${i * bw + bw * 0.12}" y="${H - padB - hn}" width="${bw * 0.76}" height="${hn}" rx="3" fill="${C.salmon}" data-tip="${tipTxt}"/>
          ${bw > 26 ? `<text class="mono" x="${i * bw + bw / 2}" y="${H - padB - h - 5}" text-anchor="middle" style="fill:${C.paper}">${x.posters}</text>` : ''}`;
        if (i % Math.ceil(w.length / 7) === 0) g += `<text class="mono" x="${i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" style="font-size:10px">${x.week.slice(5)}</text>`;
      });
      $('#posters-week').innerHTML = `<svg viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="${C.line}"/>${g}</svg>
        <div class="legend"><span><i style="background:${C.cream}"></i>returning posters</span><span><i style="background:${C.salmon}"></i>first-time posters</span><span>weeks start Monday, UTC</span></div>`;
      // Lorenz
      const c = d.concentration, L = c.lorenz, S = 220;
      const pts = L.map((p) => `${p.posters * S},${S - p.reward * S}`).join(' ');
      $('#posters-lorenz').innerHTML = `<svg viewBox="-30 -10 ${S + 40} ${S + 36}">
        <rect x="0" y="0" width="${S}" height="${S}" fill="none" stroke="${C.line}" rx="4"/>
        <line x1="0" y1="${S}" x2="${S}" y2="0" stroke="${C.muted}" stroke-dasharray="3 4"/>
        <polyline points="0,${S} ${pts}" fill="none" stroke="${C.salmon}" stroke-width="2.5"/>
        ${L.map((p) => `<circle cx="${p.posters * S}" cy="${S - p.reward * S}" r="7" fill="transparent" data-tip="Top <b>${pct(p.posters)}</b> of posters put up <b>${pct(p.reward)}</b> of rewards"/>`).join('')}
        <text x="0" y="${S + 18}">share of posters, biggest first →</text>
        <text x="-10" y="0" transform="rotate(-90 -10 0)" text-anchor="end">share of rewards</text></svg>`;
      $('#posters-kpi').innerHTML = `<div class="kpi"><div class="v">${pct(c.top5)}</div><div class="l">of all rewards in the list came from the top 5 of ${fmt(c.posters)} posters</div></div>
        <div class="kpi" style="margin-top:14px"><div class="v">${pct(c.top1)}</div><div class="l">from the single biggest poster</div></div>
        <div class="kpi" style="margin-top:14px"><div class="v">${fmt(c.oneTaskPosters)}</div><div class="l">posters have posted exactly one task</div></div>`;
      $('#posters-top').innerHTML = `<table class="t"><thead><tr><th>#</th><th>Poster</th><th style="text-align:right">Tasks</th><th style="text-align:right">Put up</th><th style="text-align:right">Paid out</th></tr></thead><tbody>
        ${c.top.map((p, i) => `<tr><td class="mono" style="font-family:var(--mono)">${i + 1}</td><td>${esc(p.name || '')} <span class="addr">${short(p.addr)}</span></td><td class="n">${fmt(p.tasks)}</td><td class="n">${money(p.reward)}</td><td class="n">${money(p.paid)}</td></tr>`).join('')}</tbody></table>
        <p class="note">"Paid out" is the reward of the poster's tasks with status <code>completed</code>. Names are the display names the API returns, nothing else is attached to addresses.</p>`;
    }
    seg($('#posters-chain'), [['all', 'Both chains'], ...D.chains.map((c) => [c.key, c.name])], chain, (v) => { chain = v; draw(); });
    draw();
  })();

  // ---------- Feed ----------
  (function feed() {
    const TY = { task_submitted: ['submitted', C.cream], task_created: ['posted', C.salmon], task_claimed: ['claimed', C.muted], task_rated: ['rated', C.paper], task_accepted: ['accepted', C.magenta] };
    const items = P.byChain[D.chains[0].key].feed;
    const byId = Object.fromEntries(D.chains.map((c) => [c.id, c]));
    $('#feed').innerHTML = items.map((i) => {
      const [label, color] = TY[i.type] || [i.type.replace('task_', ''), C.muted];
      const ch = byId[i.chainId];
      const amt = i.amount && Number(i.amount) ? ` · ${money(u(i.amount))} ${ch?.token || ''}` : (i.rating != null ? ` · rating ${i.rating}` : '');
      return `<li><span class="ago">${ago(i.timestamp)} ago</span><span class="ty" style="color:${color}">${label}${ch ? ` <span class="tag ${ch.key}">${ch.name}</span>` : ''}</span>
        <a class="ti" href="https://taskmarket.dev/tasks/${esc(i.taskId)}?chain=${i.chainId}" target="_blank" rel="noopener" style="color:var(--cream);text-decoration:none">${esc(i.taskTitle)}${esc(amt)}</a>
        <span class="ac">${short(i.actor)}</span></li>`;
    }).join('');
    const counts = {}; items.forEach((i) => (counts[i.type] = (counts[i.type] || 0) + 1));
    const span = items.length ? ago(items[items.length - 1].timestamp) : '0m';
    $('#feed-note').innerHTML = `The newest ${fmt(items.length)} events, covering the last ${span} before the snapshot: ${Object.entries(counts).map(([k, v]) => `${fmt(v)} ${esc((TY[k] || [k])[0])}`).join(', ')}. Source: <code>/api/stats/activity-feed?limit=50</code>, four pages.`;
  })();

  // Highlight the current view in the nav and jump to it on per-view pages.
  const view = document.body.dataset.view;
  if (view && view !== 'pulse') { const t = document.getElementById(view); if (t) requestAnimationFrame(() => t.scrollIntoView()); }
  const links = [...document.querySelectorAll('nav.views a')];
  const obs = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.toggleAttribute('aria-current', a.hash === '#' + e.target.id)); }), { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('section.view').forEach((s) => obs.observe(s));
  $('#asof-local').textContent = asOf.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
})();
