(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'coinflip').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let side = DC.store.get('dc_cf_side') || 'heads';
  let rot = 0;
  let busy = false;
  const streak = [];

  const bet = DC.betInput(controls, 'coinflip');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field"><div class="field-label">Your call</div><div class="seg" id="cf-side">
      <button data-s="heads">Frosted</button><button data-s="tails">Chocolate</button></div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat"><small>Multiplier</small><b>${DC.mult(info.multiplier)}</b></div><div class="stat"><small>Win</small><b id="cf-win">0</b></div></div>
    <button class="btn primary big" id="cf-go">Flip</button>
    <p class="ctrl-note">50 / 50. Pays ${DC.mult(info.multiplier)}.</p>`);
  stage.innerHTML = `<div class="stage-inner coin-stage">
    <div class="coin-wrap"><div class="coin" id="coin">
      <div class="face front">${DC.donut({ flavor: 'pink' })}<em>Frosted</em></div>
      <div class="face back">${DC.donut({ flavor: 'choco' })}<em>Chocolate</em></div>
    </div><div class="coin-shadow"></div></div>
    <div class="streak" id="cf-streak"></div></div>`;

  const coin = document.getElementById('coin');
  const sideBtns = controls.querySelectorAll('#cf-side button');
  const win = document.getElementById('cf-win');
  const go = document.getElementById('cf-go');
  const sync = () => {
    sideBtns.forEach((b) => b.classList.toggle('on', b.dataset.s === side));
    win.textContent = DC.short(Math.floor(bet.get() * info.multiplier));
  };
  sideBtns.forEach((b) => (b.onclick = () => { side = b.dataset.s; DC.store.set('dc_cf_side', side); sync(); }));
  bet.input.addEventListener('input', sync);

  go.onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; go.disabled = true;
    try {
      const r = await DC.api('/api/games/coinflip/play', { bet: bet.get(), side });
      DC.setBalance(r.balance - r.payout);
      const base = rot - (((rot % 360) + 360) % 360);
      rot = base + 360 * 5 + (r.result.outcome === 'tails' ? 180 : 0);
      coin.classList.add('flipping');
      coin.style.transform = `rotateY(${rot}deg)`;
      setTimeout(() => {
        coin.classList.remove('flipping');
        DC.setBalance(r.balance);
        DC.history.add(r.bet);
        streak.unshift(r.result.outcome);
        document.getElementById('cf-streak').innerHTML = streak.slice(0, 12).map((o) => `<span class="${o}">${DC.donut({ flavor: o === 'heads' ? 'pink' : 'choco', sprinkles: false })}</span>`).join('');
        if (r.result.win) DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
        else DC.pop(stage, false, r.result.outcome === 'heads' ? 'Frosted' : 'Chocolate', `-${DC.fmt(r.bet.bet)} donuts`);
        busy = false; go.disabled = false;
      }, 1300);
    } catch (e) { DC.handleError(e); busy = false; go.disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'coinflip');
})();
