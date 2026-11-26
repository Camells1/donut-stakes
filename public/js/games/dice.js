(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'dice').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let dir = DC.store.get('dc_di_dir') || 'under';
  let target = Number(DC.store.get('dc_di_target')) || 50;
  let busy = false;

  const bet = DC.betInput(controls, 'dice');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field"><div class="field-label">Roll</div><div class="seg" id="di-dir"><button data-d="under">Under</button><button data-d="over">Over</button></div></div>
    <div class="stat-row" style="margin-top:14px">
      <label class="field" style="margin:0"><span>Target</span><input type="number" id="di-target" step="0.01" min="1" max="98.99"></label>
      <label class="field" style="margin:0"><span>Multiplier</span><input type="number" id="di-mult" step="0.0001"></label>
    </div>
    <div class="stat-row"><div class="stat"><small>Win chance</small><b id="di-chance"></b></div><div class="stat"><small>Win</small><b id="di-win"></b></div></div>
    <button class="btn primary big" id="di-go">Roll</button>`);
  stage.innerHTML = `<div class="stage-inner dice-stage">
    <div class="dice-result" id="di-result">50.00</div>
    <div class="dice-track-wrap">
      <div class="dice-marker" id="di-marker">${DC.donut({ flavor: 'glaze' })}<span id="di-mval"></span></div>
      <div class="dice-track" id="di-track"><div class="zone lose"></div><div class="zone win"></div></div>
      <input type="range" id="di-range" min="2" max="98" step="0.01" aria-label="Target">
      <div class="dice-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
    </div>
    <div class="dice-recent" id="di-recent"></div></div>`;

  const dirBtns = controls.querySelectorAll('#di-dir button');
  const tIn = document.getElementById('di-target');
  const mIn = document.getElementById('di-mult');
  const range = document.getElementById('di-range');
  const go = document.getElementById('di-go');
  const RTP = info.rtp;

  const chance = () => (dir === 'under' ? Math.round(target * 100) / 10000 : (9999 - Math.round(target * 100)) / 10000);
  const multOf = (c) => Math.floor((RTP / c) * 10000) / 10000;
  function clampTarget(t) {
    t = Math.round(t * 100) / 100;
    const lo = dir === 'under' ? 1 : 1.99, hi = dir === 'under' ? 98 : 98.99;
    return Math.min(hi, Math.max(lo, t || 50));
  }
  function sync(from) {
    target = clampTarget(target);
    const c = chance();
    if (from !== 't') tIn.value = target.toFixed(2);
    if (from !== 'm') mIn.value = multOf(c).toFixed(4);
    range.value = target;
    dirBtns.forEach((b) => b.classList.toggle('on', b.dataset.d === dir));
    document.getElementById('di-chance').textContent = (c * 100).toFixed(2) + '%';
    document.getElementById('di-win').textContent = DC.short(Math.floor(bet.get() * multOf(c)));
    const pct = target + '%';
    const track = document.getElementById('di-track');
    track.querySelector('.lose').style.cssText = dir === 'under' ? `left:${pct};right:0` : `left:0;width:${pct}`;
    track.querySelector('.win').style.cssText = dir === 'under' ? `left:0;width:${pct}` : `left:${pct};right:0`;
    DC.store.set('dc_di_dir', dir); DC.store.set('dc_di_target', target);
  }
  dirBtns.forEach((b) => (b.onclick = () => { if (b.dataset.d !== dir) { dir = b.dataset.d; target = 100 - target; } sync(); }));
  range.oninput = () => { target = Number(range.value); sync(); };
  tIn.onchange = () => { target = Number(tIn.value); sync(); };
  mIn.onchange = () => {
    const m = Math.max(1.0102, Math.min(99, Number(mIn.value) || 2));
    const c = RTP / m;
    target = dir === 'under' ? c * 100 : 99.99 - c * 100;
    sync();
  };
  bet.input.addEventListener('input', () => sync('x'));

  const marker = document.getElementById('di-marker');
  const result = document.getElementById('di-result');
  go.onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; go.disabled = true;
    try {
      const r = await DC.api('/api/games/dice/play', { bet: bet.get(), target, direction: dir });
      const roll = r.result.roll;
      DC.setBalance(r.balance - r.payout);
      marker.classList.add('show');
      marker.style.left = roll + '%';
      document.getElementById('di-mval').textContent = roll.toFixed(2);
      const t0 = performance.now();
      const startV = Number(result.textContent) || 50;
      const anim = (t) => {
        const p = Math.min(1, (t - t0) / 420);
        result.textContent = (startV + (roll - startV) * (1 - Math.pow(1 - p, 3))).toFixed(2);
        if (p < 1) return requestAnimationFrame(anim);
        result.className = 'dice-result ' + (r.result.win ? 'win' : 'loss');
        marker.classList.toggle('win', r.result.win);
        marker.classList.toggle('loss', !r.result.win);
        DC.setBalance(r.balance);
        DC.history.add(r.bet);
        const rec = document.getElementById('di-recent');
        rec.insertAdjacentHTML('afterbegin', `<span class="${r.result.win ? 'win' : 'loss'}">${roll.toFixed(2)}</span>`);
        while (rec.children.length > 8) rec.lastElementChild.remove();
        busy = false; go.disabled = false;
      };
      requestAnimationFrame(anim);
    } catch (e) { DC.handleError(e); busy = false; go.disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'dice');
})();
