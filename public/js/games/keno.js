(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'keno').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let picks = new Set((DC.store.get('dc_ke_picks') || '').split(',').map(Number).filter((n) => n >= 1 && n <= info.pool));
  let busy = false;

  const bet = DC.betInput(controls, 'keno');
  controls.insertAdjacentHTML('beforeend', `
    <div class="stat-row"><div class="stat"><small>Picked</small><b id="ke-count">0 / ${info.maxPicks}</b></div><div class="stat"><small>Top prize</small><b id="ke-top">-</b></div></div>
    <button class="btn primary big" id="ke-play">Play</button>
    <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:8px"><button class="btn" id="ke-rand">Random</button><button class="btn" id="ke-clear">Clear</button></div>
    <p class="ctrl-note">Pick 1-${info.maxPicks} numbers. ${info.draw} are drawn from ${info.pool}.</p>`);
  stage.innerHTML = `<div class="stage-inner keno-stage"><div class="keno-grid" id="ke-grid">${Array.from({ length: info.pool }, (_, i) => `<button class="kcell" data-n="${i + 1}"><span>${i + 1}</span></button>`).join('')}</div>
    <div class="keno-pays" id="ke-pays"></div></div>`;
  const $ = (id) => document.getElementById(id);

  function paint(hitCount) {
    document.querySelectorAll('.kcell').forEach((c) => c.classList.toggle('pick', picks.has(Number(c.dataset.n))));
    $('ke-count').textContent = `${picks.size} / ${info.maxPicks}`;
    const t = info.tables[picks.size];
    $('ke-top').textContent = t ? DC.mult(t[t.length - 1]) : '-';
    $('ke-pays').innerHTML = t ? t.map((m, h) => (m ? `<span class="${hitCount === h ? 'hit' : ''}">${h} hits <b>${DC.mult(m)}</b></span>` : '')).join('') : '<span>Pick some numbers</span>';
    DC.store.set('dc_ke_picks', [...picks].join(','));
  }
  function clearDraw() { document.querySelectorAll('.kcell').forEach((c) => { c.classList.remove('drawn', 'hit'); const s = c.querySelector('svg'); if (s) s.remove(); }); }
  $('ke-grid').addEventListener('click', (e) => {
    const c = e.target.closest('.kcell');
    if (!c || busy) return;
    const n = Number(c.dataset.n);
    clearDraw();
    if (picks.has(n)) picks.delete(n); else if (picks.size < info.maxPicks) picks.add(n); else return DC.toast(`Max ${info.maxPicks} picks`, 'err');
    paint();
  });
  $('ke-clear').onclick = () => { if (busy) return; picks.clear(); clearDraw(); paint(); };
  $('ke-rand').onclick = () => {
    if (busy) return;
    clearDraw();
    const want = picks.size || 5;
    picks.clear();
    while (picks.size < want) picks.add(1 + Math.floor(Math.random() * info.pool));
    paint();
  };
  $('ke-play').onclick = async () => {
    if (busy) return;
    if (!picks.size) return DC.toast('Pick at least one number', 'err');
    if (!DC.canPlay()) return;
    busy = true; $('ke-play').disabled = true;
    clearDraw();
    try {
      const r = await DC.api('/api/games/keno/play', { bet: bet.get(), picks: [...picks] });
      DC.setBalance(r.balance - r.payout);
      let i = 0;
      const tick = () => {
        const n = r.result.drawn[i];
        const c = document.querySelector(`.kcell[data-n="${n}"]`);
        if (r.result.hits.includes(n)) { c.classList.add('hit'); c.insertAdjacentHTML('afterbegin', DC.donut({ flavor: 'pink' })); } else c.classList.add('drawn');
        if (++i < r.result.drawn.length) return setTimeout(tick, 110);
        paint(r.result.hits.length);
        DC.setBalance(r.balance);
        DC.history.add(r.bet);
        if (r.payout) DC.pop(stage, true, DC.mult(r.multiplier), `${r.result.hits.length} hits, +${DC.fmt(r.payout)}`);
        busy = false; $('ke-play').disabled = false;
      };
      tick();
    } catch (e) { DC.handleError(e); busy = false; $('ke-play').disabled = false; }
  };
  paint();
  DC.history.mount(document.getElementById('history'), 'keno');
})();
