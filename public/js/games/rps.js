(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'rps').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let hand = DC.store.get('dc_rps_hand') || 'rock';
  let busy = false;

  // Original simple glyphs: a round stone, a sheet, and open shears.
  const ICON = {
    rock: '<svg viewBox="0 0 100 100"><path d="M22 58c-4-14 6-30 22-34s34 2 38 18-4 32-22 36-34-6-38-20z" fill="#6b6b74"/><path d="M36 40c6-4 14-4 18 0M60 62c4-2 8-2 10 2" stroke="#4a4a52" stroke-width="4" fill="none" stroke-linecap="round"/></svg>',
    paper: '<svg viewBox="0 0 100 100"><rect x="26" y="16" width="48" height="66" rx="6" fill="#ececef" transform="rotate(-6 50 50)"/><path d="M36 34h26M36 46h28M36 58h20" stroke="#9d9da6" stroke-width="4" stroke-linecap="round" transform="rotate(-6 50 50)"/></svg>',
    scissors: '<svg viewBox="0 0 100 100"><circle cx="30" cy="70" r="12" fill="none" stroke="#ff4f8b" stroke-width="7"/><circle cx="70" cy="70" r="12" fill="none" stroke="#ff4f8b" stroke-width="7"/><path d="M38 61 72 16M62 61 28 16" stroke="#ececef" stroke-width="7" stroke-linecap="round"/></svg>',
  };
  const bet = DC.betInput(controls, 'rps');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field-label">Your hand</div>
    <div class="rps-pick" id="rps-pick">${info.hands.map((h) => `<button class="btn" data-h="${h}" title="${h}">${ICON[h]}</button>`).join('')}</div>
    <div class="stat-row"><div class="stat"><small>Win pays</small><b>${DC.mult(info.multiplier)}</b></div><div class="stat"><small>Draw</small><b>Stake back</b></div></div>
    <button class="btn primary big" id="rps-go">Throw</button>`);
  stage.innerHTML = `<div class="stage-inner rps-stage"><div class="rps-face"><div class="rps-hand" id="rps-you">${ICON[hand]}</div><span class="rps-vs">VS</span><div class="rps-hand" id="rps-house">${ICON.rock}</div></div>
    <div class="bj-msg" id="rps-msg">Pick your hand</div><div class="dice-recent" id="rps-recent"></div></div>`;
  const $ = (id) => document.getElementById(id);
  function sync() {
    controls.querySelectorAll('#rps-pick button').forEach((b) => b.classList.toggle('on', b.dataset.h === hand));
    $('rps-you').innerHTML = ICON[hand];
  }
  controls.querySelectorAll('#rps-pick button').forEach((b) => (b.onclick = () => { if (busy) return; hand = b.dataset.h; DC.store.set('dc_rps_hand', hand); sync(); }));

  $('rps-go').onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; $('rps-go').disabled = true;
    try {
      const r = await DC.api('/api/games/rps/play', { bet: bet.get(), hand });
      DC.setBalance(r.balance - r.payout);
      ['rps-you', 'rps-house'].forEach((id) => { $(id).className = 'rps-hand shake'; });
      $('rps-house').innerHTML = ICON.rock; $('rps-you').innerHTML = ICON.rock;
      $('rps-msg').textContent = 'Rock... paper... scissors...';
      setTimeout(() => {
        const o = r.result.outcome;
        $('rps-you').innerHTML = ICON[r.result.hand]; $('rps-house').innerHTML = ICON[r.result.house];
        $('rps-you').className = 'rps-hand ' + (o === 'win' ? 'win' : o === 'lose' ? 'loss' : '');
        $('rps-house').className = 'rps-hand ' + (o === 'lose' ? 'win' : o === 'win' ? 'loss' : '');
        $('rps-msg').innerHTML = o === 'win' ? `<span class="win">You win ${DC.fmt(r.payout)}</span>` : o === 'draw' ? 'Draw - stake returned' : '<span class="loss">House wins</span>';
        $('rps-recent').insertAdjacentHTML('afterbegin', `<span class="${o === 'win' ? 'win' : o === 'lose' ? 'loss' : ''}">${o}</span>`);
        while ($('rps-recent').children.length > 8) $('rps-recent').lastElementChild.remove();
        DC.setBalance(r.balance); DC.history.add(r.bet);
        busy = false; $('rps-go').disabled = false;
      }, 1000);
    } catch (e) { DC.handleError(e); busy = false; $('rps-go').disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'rps');
})();
