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

  // ---------- Insights ----------
  $('#insights').innerHTML = D.insights.map((i) => `<li><div class="big">${esc(i.big)}</div><div class="t">${esc(i.text)}<small>${esc(i.source)}</small></div></li>`).join('');

  // ---------- Swarm ----------
  (function swarm() {
    let chain = 'tempo';
    const el = $('#swarm');
    function draw() {
      const d = chainByKey[chain].derived;
      const max = Math.max(...d.swarm.map((t) => t.subs), 1);
      el.innerHTML = d.swarm.slice(0, 24).map((t, i) => {
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
      $('#swarm-note').textContent = `${fmt(L.tasks)} open tasks in the ${chainByKey[chain].name} task list hold ${money(L.reward)} ${chainByKey[chain].token} and have drawn ${fmt(L.subs)} entries; ${fmt(L.zero)} have none yet. One square = one entry. Top 24 by entries.`;
    }
    seg($('#swarm-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
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
      $('#flow-note').innerHTML = `${fmt(f.tasks)} completed tasks in the ${c.name} task list moved <b class="mono">${money(f.total)} ${c.token}</b> from ${fmt(f.payers)} posters to ${fmt(f.winners)} winners. Each task's reward is credited to its primary award (<code>primaryAward.workerAddress</code>); bounties that split the pool among several winners are shown under the primary one. The top flow is highlighted. Names are the display names the API returns; winners are shown by address only.`;
      void avail;
    }
    seg($('#flow-chain'), D.chains.map((c) => [c.key, c.name]), chain, (v) => { chain = v; draw(); });
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
