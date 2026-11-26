(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'mines').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');

  let size = Number(DC.store.get('dc_mi_size')) || info.defaultSize;
  if (!info.sizes.includes(size)) size = info.defaultSize;
  let mines = Number(DC.store.get('dc_mi_mines')) || 3;
  let game = null;   // active round from server
  let busy = false;

  const bet = DC.betInput(controls, 'mines');
  controls.insertAdjacentHTML('beforeend', `
    <div class="stat-row" style="grid-template-columns:1fr 1fr">
      <label class="field" style="margin:0"><span>Grid</span><select id="mi-size">${info.sizes.map((s) => `<option value="${s}">${s} x ${s}</option>`).join('')}</select></label>
      <label class="field" style="margin:0"><span>Mines</span><select id="mi-mines"></select></label>
    </div>
    <div class="stat-row"><div class="stat"><small>Multiplier</small><b id="mi-mult">0.00x</b></div><div class="stat"><small>Next tile</small><b id="mi-next">-</b></div></div>
    <div class="stat" style="margin-bottom:14px"><small>Cash out value</small><b id="mi-cash">0</b></div>
    <button class="btn primary big" id="mi-main">Start round</button>
    <button class="btn big" id="mi-random" style="margin-top:8px" disabled>Pick random tile</button>
    <p class="ctrl-note">Every safe tile is a donut. Hit a burnt one and the round ends.</p>`);
  stage.innerHTML = `<div class="stage-inner"><div class="mines-grid" id="mi-grid"></div></div>`;

  const sizeSel = document.getElementById('mi-size');
  const minesSel = document.getElementById('mi-mines');
  const grid = document.getElementById('mi-grid');
  const mainBtn = document.getElementById('mi-main');
  const randBtn = document.getElementById('mi-random');

  function fillMines() {
    const n = size * size;
    mines = Math.min(Math.max(1, mines), n - 1);
    minesSel.innerHTML = Array.from({ length: n - 1 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    minesSel.value = mines;
  }
  sizeSel.onchange = () => { size = Number(sizeSel.value); DC.store.set('dc_mi_size', size); fillMines(); buildGrid(); };
  minesSel.onchange = () => { mines = Number(minesSel.value); DC.store.set('dc_mi_mines', mines); };

  function buildGrid() {
    const n = game && game.active ? game.size : size;
    grid.style.setProperty('--n', n);
    grid.innerHTML = Array.from({ length: n * n }, (_, i) => `<button class="tile" data-i="${i}" aria-label="Tile ${i + 1}"><span class="inner"></span></button>`).join('');
    grid.querySelectorAll('.tile').forEach((t) => (t.onclick = () => reveal(Number(t.dataset.i))));
    paint();
  }
  const tileEl = (i) => grid.querySelector(`[data-i="${i}"]`);
  function setTile(i, kind, faded) {
    const t = tileEl(i);
    if (!t || t.dataset.kind === kind) return;
    t.dataset.kind = kind;
    t.classList.add('open', kind);
    if (faded) t.classList.add('faded');
    t.querySelector('.inner').innerHTML = DC.donut({ flavor: kind === 'mine' ? 'burnt' : 'pink', sprinkles: kind !== 'mine' });
  }

  function paint() {
    const active = !!(game && game.active);
    sizeSel.disabled = active; minesSel.disabled = active; bet.disable(active);
    sizeSel.value = active ? game.size : size;
    minesSel.value = active ? game.mineCount : mines;
    grid.classList.toggle('live', active);
    document.getElementById('mi-mult').textContent = DC.mult(game && game.multiplier ? game.multiplier : 0);
    document.getElementById('mi-next').textContent = game && game.active && game.nextMultiplier ? DC.mult(game.nextMultiplier) : '-';
    document.getElementById('mi-cash').textContent = game && game.active ? DC.fmt(game.cashout) : '0';
    if (active) {
      mainBtn.textContent = game.revealed.length ? `Cash out ${DC.short(game.cashout)}` : 'Pick a tile';
      mainBtn.className = 'btn success big';
      mainBtn.disabled = !game.revealed.length || busy;
      randBtn.disabled = busy;
    } else {
      mainBtn.textContent = 'Start round'; mainBtn.className = 'btn primary big'; mainBtn.disabled = busy; randBtn.disabled = true;
    }
    if (game) game.revealed.forEach((i) => setTile(i, 'safe'));
  }

  async function start() {
    if (!DC.canPlay()) return;
    busy = true; paint();
    try {
      const r = await DC.api('/api/games/mines/start', { bet: bet.get(), size, mines });
      game = r.game;
      DC.setBalance(r.balance);
      buildGrid();
    } catch (e) { DC.handleError(e); }
    busy = false; paint();
  }
  async function reveal(i) {
    if (!game || !game.active || busy || game.revealed.includes(i)) return;
    busy = true;
    tileEl(i).classList.add('pending');
    try {
      const r = await DC.api('/api/games/mines/reveal', { tile: i });
      tileEl(i).classList.remove('pending');
      if (r.done) return finish(r);
      game = r.game;
    } catch (e) { tileEl(i).classList.remove('pending'); DC.handleError(e); }
    busy = false; paint();
  }
  async function cashout() {
    busy = true; paint();
    try { finish(await DC.api('/api/games/mines/cashout', {})); } catch (e) { DC.handleError(e); busy = false; paint(); }
  }
  function finish(r) {
    game = { ...r, active: false };
    busy = false;
    paint();
    if (r.hit !== undefined) { setTile(r.hit, 'mine'); tileEl(r.hit).classList.add('boom'); }
    const total = r.size * r.size;
    setTimeout(() => {
      for (let i = 0; i < total; i++) if (!r.revealed.includes(i) && i !== r.hit) setTile(i, r.mines.includes(i) ? 'mine' : 'safe', true);
    }, r.win ? 150 : 450);
    DC.setBalance(r.balance);
    DC.history.add(r.bet);
    if (r.win) DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
    else DC.pop(stage, false, 'Burnt!', `-${DC.fmt(r.bet.bet)} donuts`);
  }
  mainBtn.onclick = () => (game && game.active ? cashout() : start());
  randBtn.onclick = () => {
    if (!game || !game.active) return;
    const free = [];
    for (let i = 0; i < game.size * game.size; i++) if (!game.revealed.includes(i)) free.push(i);
    reveal(free[Math.floor(Math.random() * free.length)]);
  };

  fillMines();
  if (DC.me) {
    try { const r = await DC.api('/api/games/mines/state', {}); if (r.game) { game = r.game; size = game.size; mines = game.mineCount; fillMines(); } } catch { /* ignore */ }
  }
  buildGrid();
  DC.history.mount(document.getElementById('history'), 'mines');
})();
