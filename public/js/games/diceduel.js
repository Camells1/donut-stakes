(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'diceduel').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let dice = Number(DC.store.get('dc_dd_dice')) || 2;
  let busy = false;

  const bet = DC.betInput(controls, 'diceduel');
  controls.insertAdjacentHTML('beforeend', `
    <div class="field"><div class="field-label">Dice each</div><div class="seg" id="dd-n"><button data-n="1">1</button><button data-n="2">2</button><button data-n="3">3</button></div></div>
    <div class="stat-row" style="margin-top:14px"><div class="stat"><small>Win pays</small><b id="dd-mult"></b></div><div class="stat"><small>Win / tie</small><b id="dd-odds"></b></div></div>
    <button class="btn primary big" id="dd-go">Roll</button>
    <p class="ctrl-note">Higher total wins. A tie returns your stake.</p>`);
  stage.innerHTML = `<div class="stage-inner duel-stage">
    <div class="duel-row house"><span class="who">House</span><div class="duel-row" id="dd-house"></div><span class="sum" id="dd-hs">-</span></div>
    <div class="bj-msg" id="dd-msg">Roll the dice</div>
    <div class="duel-row you"><span class="who">You</span><div class="duel-row" id="dd-you"></div><span class="sum" id="dd-ys">-</span></div></div>`;
  const $ = (id) => document.getElementById(id);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const die = (v, roll) => `<div class="die ${roll ? 'rolling' : ''}">${Array.from({ length: 9 }, (_, i) => `<i class="${v && PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;

  function sync() {
    controls.querySelectorAll('#dd-n button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === dice));
    const o = info.odds[dice];
    $('dd-mult').textContent = DC.mult(o.multiplier);
    $('dd-odds').textContent = `${(o.win * 100).toFixed(1)}% / ${(o.tie * 100).toFixed(1)}%`;
    $('dd-you').innerHTML = Array.from({ length: dice }, () => die(0)).join('');
    $('dd-house').innerHTML = Array.from({ length: dice }, () => die(0)).join('');
  }
  controls.querySelectorAll('#dd-n button').forEach((b) => (b.onclick = () => { if (busy) return; dice = Number(b.dataset.n); DC.store.set('dc_dd_dice', dice); sync(); }));

  $('dd-go').onclick = async () => {
    if (busy || !DC.canPlay()) return;
    busy = true; $('dd-go').disabled = true;
    try {
      const r = await DC.api('/api/games/diceduel/play', { bet: bet.get(), dice });
      DC.setBalance(r.balance - r.payout);
      $('dd-you').innerHTML = r.result.you.map((v) => die(v, true)).join('');
      $('dd-house').innerHTML = r.result.house.map((v) => die(v, true)).join('');
      setTimeout(() => {
        $('dd-ys').textContent = r.result.youTotal; $('dd-hs').textContent = r.result.houseTotal;
        const o = r.result.outcome;
        $('dd-msg').innerHTML = o === 'win' ? `<span class="win">You win ${DC.fmt(r.payout)}</span>` : o === 'tie' ? 'Tie - stake returned' : '<span class="loss">House wins</span>';
        DC.setBalance(r.balance); DC.history.add(r.bet);
        busy = false; $('dd-go').disabled = false;
      }, 520);
    } catch (e) { DC.handleError(e); busy = false; $('dd-go').disabled = false; }
  };
  sync();
  DC.history.mount(document.getElementById('history'), 'diceduel');
})();
