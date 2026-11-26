(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'chicken').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let mode = DC.store.get('dc_ch_mode') || 'easy';
  if (!info.modes[mode]) mode = 'easy';
  let game = null, busy = false;

  const bet = DC.betInput(controls, 'chicken');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field"><div class="field-label">Difficulty</div><div class="seg" id="ch-mode" style="flex-wrap:wrap">${Object.keys(info.modes).map((k) => `<button data-m="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat"><small>Multiplier</small><b id="ch-mult">0.00x</b></div><div class="stat"><small>Hit chance / lane</small><b id="ch-risk"></b></div></div>
    <button class="btn primary big" id="ch-main">Start</button>
    <button class="btn big" id="ch-go" style="margin-top:8px" disabled>Cross next lane</button>`);
  stage.innerHTML = `<div class="stage-inner chicken-stage"><div class="road-wrap"><div class="road" id="ch-road"></div></div><div class="bj-msg" id="ch-msg">Cross the sprinkle highway</div></div>`;
  const $ = (id) => document.getElementById(id);
  const md = () => info.modes[game ? game.mode : mode];
  const multAt = (k) => Math.floor((0.99 / Math.pow(1 - md().hit, k)) * 10000) / 10000;

  function build() {
    const m = md();
    const lane = game ? game.lane : 0;
    $('ch-road').innerHTML = `<div class="lane side"><div class="runner" id="ch-runner">${DC.donut({ flavor: 'glaze' })}</div></div>` +
      Array.from({ length: m.lanes }, (_, i) => `<div class="lane ${i < lane ? 'passed' : i === lane ? 'next' : ''}" data-i="${i + 1}"><span class="lm">${DC.mult(multAt(i + 1))}</span></div>`).join('');
    place(lane, false);
  }
  function place(lane, hop) {
    const runner = $('ch-runner');
    const laneEl = lane ? $('ch-road').querySelector(`.lane[data-i="${lane}"]`) : $('ch-road').firstElementChild;
    if (runner.parentElement !== laneEl) laneEl.appendChild(runner);
    if (hop) { runner.classList.remove('hop'); void runner.offsetWidth; runner.classList.add('hop'); }
    const wrapW = $('ch-road').parentElement.clientWidth;
    const x = Math.max(0, laneEl.offsetLeft - wrapW / 2 + 46);
    $('ch-road').style.transform = `translateX(${-x}px)`;
    $('ch-road').querySelectorAll('.lane[data-i]').forEach((l) => { const i = Number(l.dataset.i); l.classList.toggle('passed', i <= lane); l.classList.toggle('next', i === lane + 1); });
  }
  function ui() {
    const active = !!(game && game.active);
    controls.querySelectorAll('#ch-mode button').forEach((b) => { b.classList.toggle('on', b.dataset.m === (active ? game.mode : mode)); b.disabled = active; });
    bet.disable(active);
    $('ch-mult').textContent = DC.mult(game && game.multiplier ? game.multiplier : 0);
    $('ch-risk').textContent = (md().hit * 100).toFixed(0) + '%';
    const main = $('ch-main');
    if (active) { main.textContent = game.lane ? `Cash out ${DC.short(game.cashout)}` : 'Cross a lane first'; main.className = 'btn success big'; main.disabled = busy || !game.lane; }
    else { main.textContent = 'Start'; main.className = 'btn primary big'; main.disabled = busy; }
    $('ch-go').disabled = busy || !active;
  }
  controls.querySelectorAll('#ch-mode button').forEach((b) => (b.onclick = () => { mode = b.dataset.m; DC.store.set('dc_ch_mode', mode); game = null; build(); ui(); }));

  async function call(action, body) {
    busy = true; ui();
    try {
      const r = await DC.api(`/api/games/chicken/${action}`, body);
      busy = false;
      if (r.done) {
        game = { ...r, active: false };
        if (r.hit) {
          const laneEl = $('ch-road').querySelector(`.lane[data-i="${r.lane + 1}"]`);
          place(r.lane + 1, true);
          laneEl.insertAdjacentHTML('beforeend', '<div class="truck"></div>');
          requestAnimationFrame(() => requestAnimationFrame(() => laneEl.querySelector('.truck').classList.add('go')));
          setTimeout(() => $('ch-runner').classList.add('splat'), 330);
          $('ch-msg').innerHTML = `<span class="loss">Splat at lane ${r.lane + 1}!</span>`;
        } else {
          place(r.lane, false);
          $('ch-msg').innerHTML = `<span class="win">${r.crossed ? 'Made it across!' : 'Cashed out'} ${DC.mult(r.multiplier)}</span>`;
          DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
        }
        DC.setBalance(r.balance); DC.history.add(r.bet);
      } else {
        const fresh = !game || !game.active;
        game = r.game; DC.setBalance(r.balance);
        if (fresh) { build(); $('ch-msg').textContent = 'Go when you are ready'; } else { place(game.lane, true); $('ch-msg').innerHTML = `<span class="win">Safe! ${DC.mult(game.multiplier)}</span>`; }
      }
    } catch (e) { busy = false; DC.handleError(e); }
    ui();
  }
  $('ch-main').onclick = () => {
    if (busy) return;
    if (game && game.active) return call('cashout', {});
    if (!DC.canPlay()) return;
    call('start', { bet: bet.get(), mode });
  };
  $('ch-go').onclick = () => !busy && game && game.active && call('step', {});

  if (DC.me) { try { const r = await DC.api('/api/games/chicken/state', {}); if (r.game) game = r.game; } catch { /* ignore */ } }
  build(); ui();
  DC.history.mount(document.getElementById('history'), 'chicken');
})();
