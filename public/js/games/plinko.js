(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'plinko').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');

  let risk = DC.store.get('dc_pl_risk') || 'medium';
  let rows = Number(DC.store.get('dc_pl_rows')) || 12;
  if (!info.rows.includes(rows)) rows = 12;

  const bet = DC.betInput(controls, 'plinko');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field"><div class="field-label">Risk</div><div class="seg" id="pl-risk">${info.risks.map((r) => `<button data-r="${r}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}</div></div>
    <label class="field" style="margin-top:14px"><span>Rows</span><select id="pl-rows">${info.rows.map((n) => `<option value="${n}">${n} rows</option>`).join('')}</select></label>
    <div class="stat-row"><div class="stat"><small>Max multi</small><b id="pl-max"></b></div><div class="stat"><small>RTP</small><b id="pl-rtp"></b></div></div>
    <button class="btn primary big" id="pl-drop">Drop donut</button>
    <p class="ctrl-note">Tip: press Space to drop. Drop as many as you like.</p>`);
  stage.innerHTML = `<div class="stage-inner plinko-stage"><canvas id="pl-canvas"></canvas><div class="pl-recent" id="pl-recent"></div></div>`;

  const canvas = document.getElementById('pl-canvas');
  const ctx = canvas.getContext('2d');
  const riskBtns = controls.querySelectorAll('#pl-risk button');
  const rowsSel = document.getElementById('pl-rows');
  const dropBtn = document.getElementById('pl-drop');
  const recent = document.getElementById('pl-recent');

  let balls = [];
  let flashes = new Map(); // peg key -> time
  let slotHits = new Map(); // slot -> time
  let geo = null;
  let running = false;
  let serverBalance = DC.me ? DC.me.balance : 0;
  let pendingPayout = 0;

  const table = () => info.tables[risk][rows];
  function syncControls() {
    riskBtns.forEach((b) => b.classList.toggle('on', b.dataset.r === risk));
    rowsSel.value = rows;
    const t = table();
    document.getElementById('pl-max').textContent = DC.mult(Math.max(...t));
    document.getElementById('pl-rtp').textContent = (info.rtp[risk][rows] * 100).toFixed(2) + '%';
    layout(); draw();
  }
  function lockSettings(on) { riskBtns.forEach((b) => (b.disabled = on)); rowsSel.disabled = on; }
  riskBtns.forEach((b) => (b.onclick = () => { risk = b.dataset.r; DC.store.set('dc_pl_risk', risk); syncControls(); }));
  rowsSel.onchange = () => { rows = Number(rowsSel.value); DC.store.set('dc_pl_rows', rows); syncControls(); };

  // Text colour by payout: dim below 1x, plain from 1x, accent for big slots.
  function slotColor(s) {
    const m = table()[s];
    return m >= 10 ? '#ff4f8b' : m >= 1 ? '#ececef' : '#6b6b74';
  }

  function layout() {
    const box = canvas.parentElement.getBoundingClientRect();
    const W = Math.max(280, box.width - 40), H = Math.max(300, Math.min(620, W * 0.92));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sp = Math.min((W - 10) / (rows + 2), (H - 60) / (rows + 1.2));
    const top = 26;
    geo = { W, H, sp, top, cx: W / 2, pegR: Math.max(2.2, sp * 0.11), ballR: Math.max(4, sp * 0.26), slotY: top + rows * sp + sp * 0.35, slotH: Math.max(20, sp * 0.82) };
  }
  const pegX = (r, j) => geo.cx + (j - (r + 2) / 2) * geo.sp;
  const rowY = (r) => geo.top + r * geo.sp;

  const donutImg = new Image();
  donutImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DC.donut({ flavor: 'pink' }).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));

  function draw(now = performance.now()) {
    if (!geo) return;
    const { W, H, sp, pegR, ballR, slotY, slotH } = geo;
    ctx.clearRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      for (let j = 0; j < r + 3; j++) {
        const f = flashes.get(r + ':' + j);
        const glow = f ? Math.max(0, 1 - (now - f) / 260) : 0;
        ctx.beginPath();
        ctx.arc(pegX(r, j), rowY(r), pegR, 0, Math.PI * 2);
        ctx.fillStyle = glow ? '#ececef' : '#55555e';
        ctx.fill();
      }
    }
    const t = table();
    const fs = Math.max(8, Math.min(14, sp * 0.33));
    for (let s = 0; s <= rows; s++) {
      const x = geo.cx + (s - rows / 2) * sp;
      const hit = slotHits.get(s);
      const bounce = hit ? Math.max(0, 1 - (now - hit) / 300) : 0;
      const y = slotY + Math.sin(bounce * Math.PI) * 6;
      const w = sp * 0.9;
      ctx.fillStyle = '#1c1c21';
      roundRect(x - w / 2, y, w, slotH, 4);
      ctx.fill();
      ctx.strokeStyle = bounce ? '#ececef' : '#33333a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = slotColor(s);
      ctx.font = `600 ${t[s] >= 100 ? fs * 0.85 : fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t[s] >= 1000 ? Math.round(t[s] / 1000) + 'K' : (t[s] < 10 ? +t[s].toFixed(2) : t[s]) + (sp > 30 ? 'x' : ''), x, y + slotH / 2 - 1);
    }
    for (const b of balls) {
      const p = ballPos(b, now);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (donutImg.complete) ctx.drawImage(donutImg, -ballR, -ballR, ballR * 2, ballR * 2);
      else { ctx.beginPath(); ctx.arc(0, 0, ballR, 0, Math.PI * 2); ctx.fillStyle = '#e8608f'; ctx.fill(); }
      ctx.restore();
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  const STEP = 125;
  function waypoints(path) {
    const pts = [{ x: geo.cx, y: geo.top - geo.sp * 0.9 }];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      pts.push({ x: geo.cx + (k - r / 2) * geo.sp, y: rowY(r) - geo.pegR - geo.ballR * 0.9, peg: r + ':' + (k + 1) });
      k += path[r];
    }
    pts.push({ x: geo.cx + (k - rows / 2) * geo.sp, y: geo.slotY + geo.slotH * 0.35, slot: k });
    return pts;
  }
  function ballPos(b, now) {
    const el = (now - b.t0) / STEP;
    const i = Math.min(Math.floor(el), b.pts.length - 2);
    const t = Math.min(1, el - i);
    const a = b.pts[i], c = b.pts[i + 1];
    const hop = i === 0 ? 0 : geo.sp * 0.32;
    return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t * t - hop * 4 * t * (1 - t) * (1 - t * 0.3), rot: b.rot0 + el * 0.9 * b.spin };
  }

  function tick(now) {
    for (const b of balls) {
      const seg = Math.floor((now - b.t0) / STEP);
      while (b.seen < seg && b.seen < b.pts.length - 1) {
        b.seen++;
        const p = b.pts[b.seen];
        if (p.peg) flashes.set(p.peg, now);
      }
      if (seg >= b.pts.length - 1 && !b.done) { b.done = true; land(b, now); }
    }
    balls = balls.filter((b) => !b.done);
    draw(now);
    if (balls.length || [...flashes.values(), ...slotHits.values()].some((t) => now - t < 320)) requestAnimationFrame(tick);
    else { running = false; lockSettings(false); }
  }
  function land(b, now) {
    slotHits.set(b.res.slot, now);
    pendingPayout -= b.payout;
    DC.setBalance(serverBalance - pendingPayout);
    const m = b.res.multiplier;
    recent.insertAdjacentHTML('afterbegin', `<span style="color:${slotColor(b.res.slot)}">${DC.mult(m)}</span>`);
    while (recent.children.length > 6) recent.lastElementChild.remove();
    DC.history.add(b.bet);
  }

  async function drop() {
    if (!DC.canPlay()) return;
    const amount = bet.get();
    if (amount > (DC.me.balance)) return DC.toast('Not enough donuts', 'err');
    try {
      const r = await DC.api('/api/games/plinko/play', { bet: amount, risk, rows });
      serverBalance = r.balance;
      pendingPayout += r.payout;
      DC.setBalance(serverBalance - pendingPayout);
      lockSettings(true);
      balls.push({ pts: waypoints(r.result.path), t0: performance.now(), seen: 0, res: r.result, payout: r.payout, bet: r.bet, rot0: Math.random() * 6, spin: Math.random() < 0.5 ? -1 : 1 });
      if (!running) { running = true; requestAnimationFrame(tick); }
    } catch (e) { DC.handleError(e); }
  }
  dropBtn.onclick = drop;
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); drop(); } });
  new ResizeObserver(() => { if (!running) { layout(); draw(); } }).observe(canvas.parentElement);
  donutImg.onload = () => draw();

  syncControls();
  DC.history.mount(document.getElementById('history'), 'plinko');
})();
