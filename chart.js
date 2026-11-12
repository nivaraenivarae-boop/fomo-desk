/* Tiny canvas charts: balance line with marks, and coin candles with entry + Risk trailing stop. */
(function () {
  function setup(cv) {
    const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * r; cv.height = h * r;
    const c = cv.getContext("2d"); c.scale(r, r);
    return { c, w, h };
  }
  function scale(min, max, h, pad) { const span = (max - min) || Math.abs(max) || 1; return v => pad + (h - 2 * pad) * (1 - (v - min) / span); }

  window.drawLine = function (cv, points, marks) {
    const { c, w, h } = setup(cv);
    if (!points || points.length < 2) { c.fillStyle = "#8a94a7"; c.font = "12px system-ui"; c.fillText("Chart fills in as the desk runs", 10, h / 2); return; }
    const ts = points.map(p => Date.parse(p[0])), vs = points.map(p => p[1]);
    const t0 = ts[0], t1 = ts[ts.length - 1] || t0 + 1, y = scale(Math.min(...vs), Math.max(...vs), h, 10);
    const x = t => 4 + (w - 8) * (t - t0) / ((t1 - t0) || 1);
    const up = vs[vs.length - 1] >= vs[0];
    c.strokeStyle = up ? "#22c55e" : "#ef4444"; c.lineWidth = 2; c.beginPath();
    ts.forEach((t, i) => i ? c.lineTo(x(t), y(vs[i])) : c.moveTo(x(t), y(vs[i]))); c.stroke();
    (marks || []).forEach(m => {
      const t = Date.parse(m.ts); if (t < t0 || t > t1) return;
      let i = ts.findIndex(v => v >= t); if (i < 0) i = ts.length - 1;
      c.fillStyle = m.kind === "bought" ? "#60a5fa" : (m.kind === "stopped" ? "#ef4444" : "#22c55e");
      c.beginPath(); c.arc(x(t), y(vs[i]), 3.5, 0, 7); c.fill();
      const lab = (m.text || "").match(/[+-]\d+(\.\d+)?%/);
      if (lab) { c.font = "10px system-ui"; c.fillText(lab[0], Math.min(x(t) + 5, w - 30), y(vs[i]) - 5); }
    });
  };

  window.drawCandles = function (cv, candles, lines) {
    const { c, w, h } = setup(cv);
    if (!candles || !candles.length) { c.fillStyle = "#8a94a7"; c.font = "12px system-ui"; c.fillText("No prices yet", 10, h / 2); return; }
    let lo = Math.min(...candles.map(k => k[3])), hi = Math.max(...candles.map(k => k[2]));
    (lines || []).forEach(l => { if (l.v) { lo = Math.min(lo, l.v); hi = Math.max(hi, l.v); } });
    const y = scale(lo, hi, h, 10), bw = Math.max(2, Math.min(10, (w - 8) / candles.length - 2));
    candles.forEach((k, i) => {
      const cx = 4 + (i + 0.5) * (w - 8) / candles.length, up = k[4] >= k[1];
      c.strokeStyle = c.fillStyle = up ? "#22c55e" : "#ef4444";
      c.beginPath(); c.moveTo(cx, y(k[2])); c.lineTo(cx, y(k[3])); c.stroke();
      const top = y(Math.max(k[1], k[4])), bot = y(Math.min(k[1], k[4]));
      c.fillRect(cx - bw / 2, top, bw, Math.max(1, bot - top));
    });
    (lines || []).forEach(l => {
      if (!l.v) return;
      c.save(); c.strokeStyle = l.color; c.lineWidth = 1.5; if (l.dash) c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(0, y(l.v)); c.lineTo(w, y(l.v)); c.stroke(); c.restore();
      c.fillStyle = l.color; c.font = "11px system-ui"; c.fillText(l.label, 6, y(l.v) - 4);
    });
  };
})();
