(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'upgrader').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let target = Number(DC.store.get('dc_up_target')) || 2;
  let busy = false, rot = 0;

  const bet = DC.betInput(controls, 'upgrader');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field-label">Upgrade to</div>
    <div class="box-row" id="up-boxes">${info.boxes.map((b) => `<button class="btn" data-m="${b.multiplier}"><b>${DC.mult(b.multiplier)}</b>${DC.esc(b.name)}</button>`).join('')}</div>
    <label class="field"><span>Custom target</span><input type="number" id="up-t" step="0.01" min="${info.min}" max="${info.max}"></label>
    <div class="stat-row"><div class="stat"><small>Chance</small><b id="up-ch"></b></div><div class="stat"><small>You get</small><b id="up-get"></b></div></div>
    <button class="btn primary big" id="up-go">Upgrade</button>
    <p class="ctrl-note">${DC.esc(info.simplified)}</p>`);
  const R = 120, C = 2 * Math.PI * R;
  stage.innerHTML = `<div class="stage-inner up-stage"><div class="up-dial">
    <svg class="ring" viewBox="0 0 260 260"><circle cx="130" cy="130" r="${R}" fill="none" stroke="#26262c" stroke-width="10"/>
      <circle id="up-arc" cx="130" cy="130" r="${R}" fill="none" stroke="#3ecf8e" stroke-width="10" stroke-dasharray="0 ${C}"/></svg>
    <div class="up-pointer" id="up-ptr"></div>
    <div class="up-center"><div><b id="up-big">2.00x</b><span id="up-sub">Pick a box</span></div></div></div>
    <div class="bj-msg" id="up-msg"></div></div>`;
  const $ = (id) => document.getElementById(id);

  function sync() {
    target = Math.min(info.max, Math.max(info.min, Math.floor((Number(target) || 2) * 100) / 100));
    const chance = info.rtp / target;
    $('up-t').value = target.toFixed(2);
    $('up-ch').textContent = (chance * 100).toFixed(2) + '%';
    $('up-get').textContent = DC.short(Math.floor(bet.get() * target));
    $('up-arc').setAttribute('stroke-dasharray', `${chance * C} ${C}`);
    $('up-big').textContent = DC.mult(target);
    const box = info.boxes.find((b) => b.multiplier === target);
    $('up-sub').textContent = box ? box.name : 'Custom box';
    controls.querySelectorAll('#up-boxes button').forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === target));
    DC.store.set('dc_up_target', target);
  }
  controls.querySelectorAll('#up-boxes button').forEach((b) => (b.onclick = () => { target = Number(b.dataset.m); sync(); }));
  $('up-t').onchange = () => { target = Number($('up-t').value); sync(); };
  bet.input.addEventListener('input', sync);

  $('up-go').onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; $('up-go').disabled = true;
    $('up-msg').textContent = '';
    try {
      const r = await DC.api('/api/games/upgrader/play', { bet: bet.get(), target });
      DC.setBalance(r.balance - r.payout);
      rot = rot - (rot % 360) + 360 * 4 + r.result.roll * 360;
      $('up-ptr').style.transform = `rotate(${rot}deg)`;
      setTimeout(() => {
        $('up-msg').innerHTML = r.result.win ? `<span class="win">Upgraded! +${DC.fmt(r.payout)}</span>` : '<span class="loss">Upgrade failed</span>';
        DC.setBalance(r.balance); DC.history.add(r.bet);
        if (r.result.win) DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
        busy = false; $('up-go').disabled = false;
      }, 2300);
    } catch (e) { DC.handleError(e); busy = false; $('up-go').disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'upgrader');
})();
