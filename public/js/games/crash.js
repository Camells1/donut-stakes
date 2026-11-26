(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'crash').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  const K = info.k;

  const bet = DC.betInput(controls, 'crash');
  controls.insertAdjacentHTML('beforeend', `
    <label class="field"><span>Auto cash-out <em class="dim" style="font-style:normal">optional</em></span><input type="number" id="cr-auto" step="0.01" min="1.01" placeholder="e.g. 2.00"></label>
    <div class="stat-row"><div class="stat"><small>Now</small><b id="cr-now">-</b></div><div class="stat"><small>Cash out value</small><b id="cr-val">0</b></div></div>
    <button class="btn primary big" id="cr-main">Launch</button>
    <p class="ctrl-note">The multiplier climbs until it crashes. Cash out first to win.</p>`);
  stage.innerHTML = `<div class="stage-inner crash-stage"><canvas id="cr-canvas"></canvas><div class="crash-recent" id="cr-recent"></div>
    <div class="crash-num" id="cr-num">1.00x</div><div class="crash-sub" id="cr-sub">Place a bet to launch</div></div>`;

  const autoIn = document.getElementById('cr-auto');
  autoIn.value = DC.store.get('dc_cr_auto') || '';
  autoIn.onchange = () => DC.store.set('dc_cr_auto', autoIn.value);
  const mainBtn = document.getElementById('cr-main');
  const num = document.getElementById('cr-num');
  const sub = document.getElementById('cr-sub');
  const canvas = document.getElementById('cr-canvas');
  const ctx = canvas.getContext('2d');
  const donutImg = new Image();
  donutImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DC.donut({ flavor: 'pink' }).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));

  let round = null;   // { bet, auto, t0 (local ms when the round started) }
  let finished = null; // { m, crashed }
  let busy = false;
  let pollTimer = null;
  const multAt = (ms) => Math.floor(Math.exp(K * Math.max(0, ms)) * 100 + 1e-9) / 100;

  function size() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  let box = size();
  new ResizeObserver(() => { box = size(); draw(); }).observe(canvas.parentElement);

  function draw() {
    const W = box.width, H = box.height;
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 44, r: 24, t: 60, b: 34 };
    const el = round ? performance.now() - round.t0 : finished ? finished.el : 0;
    const m = finished ? finished.m : multAt(el);
    const tMax = Math.max(8000, el * 1.15), mMax = Math.max(2, m * 1.15);
    const X = (t) => pad.l + (t / tMax) * (W - pad.l - pad.r);
    const Y = (v) => H - pad.b - ((v - 1) / (mMax - 1)) * (H - pad.t - pad.b);
    ctx.strokeStyle = '#26262c'; ctx.fillStyle = '#6b6b74'; ctx.font = '500 11px system-ui, sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = 1 + ((mMax - 1) * i) / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(v < 10 ? 1 : 0) + 'x', 6, y + 4);
    }
    if (!el && !finished) return;
    const color = finished ? (finished.crashed ? '#f0555b' : '#3ecf8e') : '#ff4f8b';
    const grad = color + '1f';   // flat, faint fill under the curve
    ctx.beginPath(); ctx.moveTo(X(0), Y(1));
    const steps = 60;
    for (let i = 1; i <= steps; i++) { const t = (el * i) / steps; ctx.lineTo(X(t), Y(Math.exp(K * t))); }
    ctx.lineTo(X(el), H - pad.b); ctx.lineTo(X(0), H - pad.b); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(0), Y(1));
    for (let i = 1; i <= steps; i++) { const t = (el * i) / steps; ctx.lineTo(X(t), Y(Math.exp(K * t))); }
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    if (donutImg.complete) {
      const s = 38, x = X(el), y = Y(Math.min(m, Math.exp(K * el)));
      ctx.save(); ctx.translate(x, y); ctx.rotate(el / 300);
      if (finished && finished.crashed) ctx.filter = 'grayscale(1) brightness(.6)';
      ctx.drawImage(donutImg, -s / 2, -s / 2, s, s); ctx.restore();
    }
  }

  function loop() {
    if (!round) return;
    const m = multAt(performance.now() - round.t0);
    num.textContent = DC.mult(m);
    document.getElementById('cr-now').textContent = DC.mult(m);
    document.getElementById('cr-val').textContent = DC.short(Math.floor(round.bet * m));
    mainBtn.textContent = `Cash out ${DC.short(Math.floor(round.bet * m))}`;
    draw();
    requestAnimationFrame(loop);
  }

  function setIdle() {
    mainBtn.textContent = 'Launch'; mainBtn.className = 'btn primary big'; mainBtn.disabled = busy;
    bet.disable(false); autoIn.disabled = false;
  }
  function begin(game) {
    finished = null;
    round = { bet: game.bet, auto: game.auto, t0: performance.now() - game.elapsed };
    num.className = 'crash-num';
    sub.textContent = game.auto ? `Auto cash-out at ${DC.mult(game.auto)}` : 'Cash out before it crashes!';
    mainBtn.className = 'btn success big'; mainBtn.disabled = false;
    bet.disable(true); autoIn.disabled = true;
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, 450);
    requestAnimationFrame(loop);
  }
  async function poll() {
    if (!round || busy) return;
    try { const r = await DC.api('/api/games/crash/state', {}); if (r.result) settle(r.result); } catch { /* keep going */ }
  }
  function settle(r) {
    if (!round && !finished) return;
    clearInterval(pollTimer);
    const el = round ? performance.now() - round.t0 : 0;
    round = null;
    const m = r.win ? r.cashedAt : r.crash;
    finished = { m, crashed: !r.win, el: Math.log(Math.max(1, r.win ? r.cashedAt : r.crash)) / K || el };
    num.textContent = DC.mult(m);
    num.className = 'crash-num ' + (r.win ? 'win' : 'loss');
    sub.textContent = r.win ? `Cashed out! Crashed at ${DC.mult(r.crash)}` : `Crashed at ${DC.mult(r.crash)}`;
    document.getElementById('cr-val').textContent = r.win ? DC.short(r.payout) : '0';
    draw();
    DC.setBalance(r.balance);
    DC.history.add(r.bet);
    const rec = document.getElementById('cr-recent');
    rec.insertAdjacentHTML('afterbegin', `<span class="${r.crash >= 2 ? 'hi' : 'lo'}">${DC.mult(r.crash)}</span>`);
    while (rec.children.length > 10) rec.lastElementChild.remove();
    if (r.win) DC.pop(stage, true, `+${DC.short(r.payout)}`, `${DC.mult(r.cashedAt)} cashed`);
    busy = false; setIdle();
  }

  mainBtn.onclick = async () => {
    if (busy) return;
    if (round) {
      busy = true; mainBtn.disabled = true;
      try { const r = await DC.api('/api/games/crash/cashout', {}); settle(r.result); } catch (e) { DC.handleError(e); busy = false; mainBtn.disabled = false; }
      return;
    }
    if (!DC.canPlay()) return;
    busy = true; mainBtn.disabled = true;
    try {
      const body = { bet: bet.get() };
      if (autoIn.value) body.autoCashout = Number(autoIn.value);
      const r = await DC.api('/api/games/crash/start', body);
      DC.setBalance(r.balance);
      busy = false;
      begin(r.game);
    } catch (e) { DC.handleError(e); busy = false; setIdle(); }
  };

  if (DC.me) {
    try { const r = await DC.api('/api/games/crash/state', {}); if (r.game) begin(r.game); else if (r.result) { DC.setBalance(r.result.balance); } } catch { /* ignore */ }
  }
  draw();
  DC.history.mount(document.getElementById('history'), 'crash');
})();
