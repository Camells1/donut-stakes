(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'towers').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let level = DC.store.get('dc_to_level') || 'medium';
  if (!info.levels[level]) level = 'medium';
  let game = null, busy = false;

  const bet = DC.betInput(controls, 'towers');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field"><div class="field-label">Difficulty</div><div class="seg" id="to-lv" style="flex-wrap:wrap">${Object.keys(info.levels).map((k) => `<button data-l="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat"><small>Multiplier</small><b id="to-mult">0.00x</b></div><div class="stat"><small>Next row</small><b id="to-next">-</b></div></div>
    <button class="btn primary big" id="to-main">Start climb</button>
    <button class="btn big" id="to-rand" style="margin-top:8px" disabled>Pick random tile</button>`);
  stage.innerHTML = `<div class="stage-inner towers-stage"><div class="tower" id="to-tower"></div></div>`;
  const $ = (id) => document.getElementById(id);
  const mult = (lv, k) => (k ? Math.floor(0.99 * Math.pow(lv.tiles / (lv.tiles - lv.bad), k) * 10000) / 10000 : 0);

  function build(reveal) {
    const lvName = game ? game.level : level;
    const lv = info.levels[lvName];
    const picks = game ? game.picks : [];
    const row = picks.length;
    $('to-tower').innerHTML = Array.from({ length: info.rows }, (_, r) => {
      const cls = game && game.active && r === row ? 'current' : r < row ? 'done' : '';
      const tiles = Array.from({ length: lv.tiles }, (_, t) => {
        let inner = '', tc = '';
        if (r < picks.length && picks[r] === t) { inner = DC.donut({ flavor: 'pink' }); tc = 'safe'; }
        else if (reveal && reveal.board) {
          const bad = reveal.board[r].includes(t);
          if (reveal.hit && reveal.hit.row === r && reveal.hit.tile === t) { inner = DC.donut({ flavor: 'burnt', sprinkles: false }); tc = 'bad'; }
          else { inner = DC.donut({ flavor: bad ? 'burnt' : 'pink', sprinkles: !bad }); tc = 'faded'; }
        }
        return `<button class="ttile ${tc}" data-r="${r}" data-t="${t}">${inner}</button>`;
      }).join('');
      return `<div class="trow ${cls}" style="--t:${lv.tiles}">${tiles}<span class="tm">${DC.mult(mult(lv, r + 1))}</span></div>`;
    }).join('');
    $('to-tower').querySelectorAll('.trow.current .ttile').forEach((b) => (b.onclick = () => pick(Number(b.dataset.t))));
  }
  function ui() {
    const active = !!(game && game.active);
    controls.querySelectorAll('#to-lv button').forEach((b) => { b.classList.toggle('on', b.dataset.l === (active ? game.level : level)); b.disabled = active; });
    bet.disable(active);
    $('to-mult').textContent = DC.mult(game && game.multiplier ? game.multiplier : 0);
    $('to-next').textContent = active && game.nextMultiplier ? DC.mult(game.nextMultiplier) : '-';
    const main = $('to-main');
    if (active) { main.textContent = game.picks.length ? `Cash out ${DC.short(game.cashout)}` : 'Pick a tile'; main.className = 'btn success big'; main.disabled = busy || !game.picks.length; }
    else { main.textContent = 'Start climb'; main.className = 'btn primary big'; main.disabled = busy; }
    $('to-rand').disabled = busy || !active;
  }
  controls.querySelectorAll('#to-lv button').forEach((b) => (b.onclick = () => { level = b.dataset.l; DC.store.set('dc_to_level', level); game = null; build(); ui(); }));

  async function call(action, body) {
    busy = true; ui();
    try {
      const r = await DC.api(`/api/games/towers/${action}`, body);
      busy = false;
      if (r.done) {
        game = { ...r, active: false };
        build(r);
        DC.setBalance(r.balance); DC.history.add(r.bet);
        if (r.win) DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
        else DC.pop(stage, false, 'Burnt!', `-${DC.fmt(r.bet.bet)} donuts`);
      } else { game = r.game; DC.setBalance(r.balance); build(); }
    } catch (e) { busy = false; DC.handleError(e); }
    ui();
  }
  const pick = (t) => !busy && game && game.active && call('pick', { tile: t });
  $('to-main').onclick = () => {
    if (busy) return;
    if (game && game.active) return call('cashout', {});
    if (!DC.canPlay()) return;
    call('start', { bet: bet.get(), level });
  };
  $('to-rand').onclick = () => game && game.active && pick(Math.floor(Math.random() * info.levels[game.level].tiles));

  if (DC.me) { try { const r = await DC.api('/api/games/towers/state', {}); if (r.game) game = r.game; } catch { /* ignore */ } }
  build(); ui();
  DC.history.mount(document.getElementById('history'), 'towers');
})();
