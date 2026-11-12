/* Desk app (plan B). Reads JSON the desk publishes every 60s under d/{DATA_PATH}/.
   Read-only: settings, pause and mode change through Telegram commands.
   Every FOMO link shown here is the exact `link` string the desk wrote (links.py); none is built here. */
(function () {
  const POLL_MS = 60000;
  const h = location.hash.match(/[#&]d=([A-Za-z0-9_-]{32,})/);
  if (h) { localStorage.setItem("desk_dp", h[1]); history.replaceState(null, "", location.pathname); }
  const DP = localStorage.getItem("desk_dp");
  const view = document.getElementById("view");
  let tab = "home", sub = null, cache = {};

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = v => v == null ? "–" : (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2);
  const pct = v => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  const cls = v => v == null ? "" : (v >= 0 ? "up" : "down");
  const time = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const fomo = (link, label, sell) => link ? `<a class="btn${sell ? " sell" : ""}" href="${esc(link)}" target="_blank" rel="noopener">${esc(label)}</a>` : "";

  async function get(path) {
    const r = await fetch(`d/${DP}/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }

  async function refresh() {
    if (!DP) return;
    try {
      const [state, chart, activity, account] = await Promise.all([get("state.json"), get("chart.json"), get("activity.json"), get("account.json")]);
      Object.assign(cache, { state, chart, activity, account });
      const m = document.getElementById("mode");
      m.textContent = state.mode + (state.paused && state.paused.length ? " · paused: " + state.paused.join(", ") : ""); m.className = "pill " + state.mode.toLowerCase();
      document.getElementById("updated").textContent = "updated " + time(state.generated);
    } catch (e) { document.getElementById("updated").textContent = "offline · " + e.message; }
    render();
  }

  const RANGES = { LIVE: 0.5, "1H": 1, "4H": 4, "1D": 24, "1W": 168, ALL: 1e9 };
  let range = "1D";
  function odometer(v) {
    const txt = usd(v);
    return `<span class="odo">${[...txt].map(ch => /\d/.test(ch)
      ? `<span class="col" data-d="${ch}">${[0,1,2,3,4,5,6,7,8,9].map(d => `<span>${d}</span>`).join("")}</span>` : `<span>${esc(ch)}</span>`).join("")}</span>`;
  }
  function rollOdometer() {
    requestAnimationFrame(() => document.querySelectorAll(".odo .col").forEach(c => c.style.transform = `translateY(-${c.dataset.d * 1.15}em)`));
  }
  function actRow(r) {
    return `<div class="item" ${r.mint ? `data-coin="${r.mint}"` : ""}><div><div class="t">${esc(r.title)}</div>
      <div class="s">${esc(r.subtitle)} · ${time(r.ts)}</div></div><div class="v ${/^-/.test(r.value) ? "down" : (/^\+/.test(r.value) ? "up" : "")}">${esc(r.value)}</div></div>`;
  }
  function agentCard(c) {
    return `<div class="card agent" data-agent="${c.agent}"><h3><span class="dot ${c.alive ? "ok" : ""}"></span>${esc(c.title)}</h3>
      <div class="st">${esc(c.status)}</div><div class="muted small">${esc(c.line)}</div>
      ${(c.pills || []).map(p => `<span class="pill ${p.color}">${esc(p.text)}</span>`).join("")}</div>`;
  }
  function home() {
    const s = cache.state; if (!s) return `<div class="empty">Loading…</div>`;
    const rows = ((cache.activity || {}).rows || []).slice(0, 5);
    return `<div class="card"><div class="muted small">Balance · ${s.mode}</div><div class="big">${odometer(s.balance)}</div>
      <div><span class="${cls(s.todayPct)}">${pct(s.todayPct)} today</span>${s.multiplier ? ` <span class="pill">${s.multiplier}×</span>` : ""}</div>
      <canvas id="bal"></canvas>
      <div class="ranges">${Object.keys(RANGES).map(k => `<button data-range="${k}" class="${k === range ? "on" : ""}">${k}</button>`).join("")}</div></div>
      <div class="carousel">${s.cards.map(agentCard).join("")}</div>
      <div class="card list"><div class="muted small">Latest</div>${rows.length ? rows.map(actRow).join("") : `<div class="muted small">Nothing yet tonight</div>`}</div>`;
  }
  function chartPoints() {
    const c = cache.chart || { points: [], marks: [] }, cut = Date.now() - RANGES[range] * 3600e3;
    return { points: c.points.filter(p => Date.parse(p[0]) >= cut), marks: c.marks };
  }

  function activityView() {
    const rows = (cache.activity || {}).rows || [];
    if (!rows.length) return `<div class="empty">Nothing yet tonight</div>`;
    return `<div class="card list">${rows.map(actRow).join("")}</div>`;
  }

  async function agentsView() {
    if (!sub || !sub.agent) {
      const s = cache.state; if (!s) return `<div class="empty">Loading…</div>`;
      return `<div class="pipe">${s.cards.map(agentCard).join("")}</div>`;
    }
    const a = sub.agent;
    const seg = ["scanner", "auditor", "analyst", "executor", "risk"].map(x => `<button data-seg="${x}" class="${x === a ? "on" : ""}">${x}</button>`).join("");
    let rows = [];
    try { rows = (await get(`decisions/${a}.json`)).rows; } catch (e) { }
    const line = r => {
      if (a === "scanner") return [r.name, `${r.verdict}${r.reason ? " · " + r.reason : ""}`, r.liquidity_usd ? "$" + Math.round(r.liquidity_usd / 1000) + "K" : ""];
      if (a === "auditor") return [r.name, `${r.layers}/8 checked`, r.passed && r.layers === 8 ? "8/8" : "rejected"];
      if (a === "analyst") return [r.name, r.pass ? "pass" : (r.reason || ""), r.score == null ? "–" : r.score];
      if (a === "executor") return [r.name, `${r.status} · ${r.mode}`, usd(r.size_usd)];
      return [r.name, `${r.status}${r.exitReason ? " · " + r.exitReason : ""}`, r.pnlUsd != null ? usd(r.pnlUsd) : pct(r.pct)];
    };
    return `<button class="back">‹ Agents</button><div class="seg">${seg}</div><div class="card list">${rows.length ? rows.map(r => { const [t, s, v] = line(r);
      return `<div class="item" ${a === "auditor" ? `data-audit="${r.mint}"` : `data-coin="${r.mint}"`}><div><div class="t">${esc(t)}</div><div class="s">${esc(s)} · ${time(r.ts || r.openedAt)}</div></div><div class="v">${esc(v)}</div></div>`; }).join("") : `<div class="muted small">No decisions yet</div>`}</div>`;
  }

  async function coinView(mint) {
    let c, a = null;
    try { c = await get(`coin/${mint}.json`); } catch (e) { return `<button class="back">‹ Back</button><div class="empty">No data for this coin</div>`; }
    try { a = await get(`audit/${mint}.json`); } catch (e) { }
    const p = c.position;
    const strips = a ? `<div class="card" data-audit="${mint}"><div class="row"><b>Auditor ›</b><span class="muted small">${a.passed ? "8/8 → Executor" : esc(a.reason || "")}</span></div>
      <div class="strips" style="margin-top:8px">${a.layers.sort((x, y) => x.n - y.n).map(l => `<div class="strip ${l.pass === true ? "pass" : (l.pass === false ? "fail" : "")}"><b>${l.n} ${esc(l.name)}</b>${esc(l.value)}</div>`).join("")}</div></div>` : "";
    const v = c.verdict ? `<div class="card"><div class="row"><b>Analyst</b><span>${c.verdict.score == null ? "–" : c.verdict.score}</span></div>
      <div class="muted small">alive ${c.verdict.alive_6h} · organic ${c.verdict.organic} · flush ${c.verdict.flush} · chase ${c.verdict.chase}${c.verdict.reason ? " · " + esc(c.verdict.reason) : ""}</div></div>` : "";
    const pos = p ? `<div class="card"><div class="row"><b>Position · ${p.status}</b><span class="${cls(p.pct)}">${pct(p.pct)}</span></div>
      <div class="muted small">${usd(p.sizeUsd)} at $${p.entryPrice} · stop -${p.stopPct}%${p.trailActive ? " · trail on" : ""}${p.pnlUsd != null ? " · PnL " + usd(p.pnlUsd) : ""}</div>
      ${p.status !== "closed" ? fomo(p.link, "Sell on FOMO", true) : ""}</div>` : "";
    setTimeout(() => {
      const cv = document.getElementById("cnd"); if (!cv) return;
      const lines = p && p.status !== "closed" ? [{ v: p.entryPrice, color: "#60a5fa", label: "entry" }, { v: p.exitLine, color: "#f59e0b", dash: true, label: "Risk trailing stop" }] : [];
      drawCandles(cv, c.candles, lines);
    });
    return `<button class="back">‹ Back</button><div class="card"><div class="row"><b>${esc(c.name)}</b><span class="muted small">${c.holders ? c.holders + " holders" : ""}</span></div>
      <canvas id="cnd"></canvas>${c.scan ? `<div class="muted small">Scanner: ${esc(c.scan.verdict)}${c.scan.reason ? " · " + esc(c.scan.reason) : ""}</div>` : ""}
      ${!p || p.status === "closed" ? fomo(c.link, "Buy on FOMO") : ""}</div>${pos}${v}${strips}`;
  }

  async function auditView(mint) {
    let a;
    try { a = await get(`audit/${mint}.json`); } catch (e) { return `<button class="back">‹ Back</button><div class="empty">Not audited</div>`; }
    const L = a.layers.sort((x, y) => x.n - y.n);
    const st = l => l.pass === true ? "pass" : (l.pass === false ? "fail" : "");
    return `<button class="back">‹ Back</button><div class="card"><div class="row"><b>${esc(a.name)}</b><span class="muted small">${a.passed ? "8/8 → Executor" : esc(a.reason || "")}</span></div>
      <div class="discs">${L.map(l => `<div class="disc ${st(l)}">${l.n}</div>`).join("")}</div>
      <div class="list">${L.map(l => `<div class="item"><div><div class="t">${l.n} · ${esc(l.name)}</div><div class="s">${esc(l.source || "not checked")}</div></div>
      <div class="v ${l.pass === false ? "down" : (l.pass ? "up" : "muted")}">${esc(l.value)}</div></div>`).join("")}</div>
      ${a.jupiter ? `<div class="list"><div class="item"><div><div class="t">Jupiter (extra check)</div><div class="s">${esc(a.jupiter.note || (a.jupiter.isSus ? "isSus" : "ok"))}</div></div>
      <div class="v ${a.jupiter.pass ? "up" : "down"}">organic ${a.jupiter.organicScore == null ? "?" : esc(a.jupiter.organicScore)}${a.jupiter.divPct == null ? "" : " · div " + esc(a.jupiter.divPct) + "%"}</div></div></div>` : ""}
      ${fomo(a.link, "Buy on FOMO")}</div>`;
  }

  function accountView() {
    const a = cache.account; if (!a) return `<div class="empty">Loading…</div>`;
    const st = a.settings || {};
    return `<div class="card"><div class="row"><span>Mode</span><b>${esc(a.mode)}</b></div><div class="row"><span>Stack</span><b>${usd(a.stack)}</b></div></div>
      <div class="card"><div class="row"><span>Profile</span><a href="${esc(a.profileUrl)}" target="_blank" rel="noopener">@${esc(a.fomoHandle)}</a></div>
      <div class="row"><span>Invite</span><a href="${esc(a.inviteUrl)}" target="_blank" rel="noopener">${esc(a.inviteUrl.replace("https://", ""))}</a></div>
      ${a.reportUrl ? `<div class="row"><span>Morning report</span><a href="${esc(a.reportUrl)}" target="_blank" rel="noopener">open</a></div>` : ""}</div>
      <div class="card"><div class="row"><span>Notifications</span><b>${esc(a.notifications)}</b></div>
      <div class="row"><span>Bot</span><a href="${esc(a.telegram)}" target="_blank" rel="noopener">${esc(a.telegram.replace("https://", ""))}</a></div>
      <div class="row"><span>Analyst</span><b>${esc(a.analystMode)}</b></div></div>
      <div class="card"><div class="muted small">Settings (read-only here; change them in Telegram)</div>
      ${Object.keys(st).map(k => `<div class="row small"><span>${esc(k)}</span><b>${esc(st[k])}</b></div>`).join("")}</div>
      <div class="card"><div class="muted small">Telegram commands</div>${a.commands.map(c => `<div><code>${esc(c)}</code></div>`).join("")}</div>
      <div class="card list"><div class="muted small">Changes</div>${(a.changes || []).slice(0, 10).map(c => `<div class="item"><div><div class="t">${esc(c.key)}</div><div class="s">${esc(c.who)} · ${time(c.ts)}</div></div><div class="v">${esc(c.old)} → ${esc(c.new)}</div></div>`).join("") || `<div class="muted small">None</div>`}</div>`;
  }

  async function render() {
    if (!DP) { view.innerHTML = `<div class="empty">Open the one-time link the desk sent you (it ends with #d=…). It is saved on this phone after that.</div>`; return; }
    let html;
    if (sub && sub.audit) html = await auditView(sub.audit);
    else if (sub && sub.coin) html = await coinView(sub.coin);
    else if (tab === "home") html = home();
    else if (tab === "activity") html = activityView();
    else if (tab === "agents") html = await agentsView();
    else html = accountView();
    view.innerHTML = html;
    if (tab === "home" && !sub && cache.chart) { const c = chartPoints(); drawLine(document.getElementById("bal"), c.points, c.marks); rollOdometer(); }
  }

  document.getElementById("tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]"); if (!b) return;
    tab = b.dataset.tab; sub = null;
    document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
    render();
  });
  view.addEventListener("click", e => {
    if (e.target.closest("a")) return;
    if (e.target.closest(".back")) { if (sub && sub.audit) delete sub.audit; else if (sub && sub.coin) delete sub.coin; else if (sub) delete sub.agent; if (sub && !Object.keys(sub).length) sub = null; render(); return; }
    const rg = e.target.closest("[data-range]"); if (rg) { range = rg.dataset.range; render(); return; }
    const au = e.target.closest("[data-audit]"); if (au) { sub = Object.assign({}, sub, { audit: au.dataset.audit }); render(); return; }
    const sg = e.target.closest("[data-seg]"); if (sg) { sub = { agent: sg.dataset.seg }; render(); return; }
    const ag = e.target.closest("[data-agent]"); if (ag) { tab = "agents"; sub = { agent: ag.dataset.agent }; document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x.dataset.tab === "agents")); render(); return; }
    const c = e.target.closest("[data-coin]"); if (c && c.dataset.coin && c.dataset.coin !== "null") { sub = Object.assign({}, sub, { coin: c.dataset.coin }); render(); }
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
  refresh(); setInterval(refresh, POLL_MS);
})();
