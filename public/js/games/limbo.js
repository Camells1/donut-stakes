(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'limbo').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let target = Number(DC.store.get('dc_li_target')) || 2;
  let busy = false;

  const bet = DC.betInput(controls, 'limbo');
  controls.insertAdjacentHTML('beforeend', `
    <label class="field"><span>Target multiplier</span><div class="input-group"><input type="number" id="li-target" step="0.01" min="${info.min}" max="${info.max}">
      <div class="bet-quick"><button type="button" class="btn small" data-t="2">2x</button><button type="button" class="btn small" data-t="10">10x</button><button type="button" class="btn small" data-t="100">100x</button></div></div></label>
    <div class="stat-row"><div class="stat"><small>Win chance</small><b id="li-chance"></b></div><div class="stat"><small>Win</small><b id="li-win"></b></div></div>
    <button class="btn primary big" id="li-go">Launch</button>
    <p class="ctrl-note">The donut flies to a random multiplier. Win if it reaches your target.</p>`);
  stage.innerHTML = `<div class="stage-inner limbo-stage">
    <div class="limbo-recent" id="li-recent"></div>
    <div class="limbo-sky"><div class="limbo-donut" id="li-donut">${DC.donut({ flavor: 'violet' })}</div></div>
    <div class="limbo-num" id="li-num">1.00x</div>
    <div class="limbo-target muted">Target <b id="li-tshow"></b></div></div>`;

  const tIn = document.getElementById('li-target');
  const go = document.getElementById('li-go');
  const num = document.getElementById('li-num');
  const donut = document.getElementById('li-donut');
  const clamp = (t) => Math.min(info.max, Math.max(info.min, Math.floor((Number(t) || 2) * 100) / 100));
  function sync() {
    target = clamp(target);
    tIn.value = target.toFixed(2);
    document.getElementById('li-chance').textContent = ((info.rtp / target) * 100).toFixed(target > 1000 ? 4 : 2) + '%';
    document.getElementById('li-win').textContent = DC.short(Math.floor(bet.get() * target));
    document.getElementById('li-tshow').textContent = DC.mult(target);
    DC.store.set('dc_li_target', target);
  }
  tIn.onchange = () => { target = Number(tIn.value); sync(); };
  controls.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { target = Number(b.dataset.t); sync(); }));
  bet.input.addEventListener('input', sync);

  go.onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; go.disabled = true;
    try {
      const r = await DC.api('/api/games/limbo/play', { bet: bet.get(), target });
      const res = r.result.result;
      DC.setBalance(r.balance - r.payout);
      num.className = 'limbo-num';
      donut.className = 'limbo-donut fly';
      const dur = 380 + Math.min(900, Math.log10(res) * 380);
      const t0 = performance.now();
      const anim = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        num.textContent = DC.mult(Math.pow(10, Math.log10(res) * e));
        if (p < 1) return requestAnimationFrame(anim);
        num.textContent = DC.mult(res);
        num.className = 'limbo-num ' + (r.result.win ? 'win' : 'loss');
        donut.className = 'limbo-donut ' + (r.result.win ? 'won' : 'lost');
        DC.setBalance(r.balance);
        DC.history.add(r.bet);
        const rec = document.getElementById('li-recent');
        rec.insertAdjacentHTML('afterbegin', `<span class="${r.result.win ? 'win' : 'loss'}">${DC.mult(res)}</span>`);
        while (rec.children.length > 8) rec.lastElementChild.remove();
        if (r.result.win) DC.pop(stage, true, `+${DC.short(r.payout)}`, `${DC.mult(target)} hit`);
        busy = false; go.disabled = false;
      };
      requestAnimationFrame(anim);
    } catch (e) { DC.handleError(e); busy = false; go.disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'limbo');
})();
