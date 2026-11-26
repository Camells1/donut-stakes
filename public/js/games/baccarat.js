(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'baccarat').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let chips = { player: 0, banker: 0, tie: 0 };
  let busy = false;

  const bet = DC.betInput(controls, 'baccarat');
  controls.querySelector('label.field span').firstChild.textContent = 'Chip value ';
  controls.insertAdjacentHTML('beforeend', `
    <div class="stat-row"><div class="stat"><small>Total stake</small><b id="bc-total">0</b></div><div class="stat"><small>Tie pays</small><b>${DC.mult(info.multipliers.tie)}</b></div></div>
    <button class="btn primary big" id="bc-deal">Deal</button>
    <button class="btn big" id="bc-clear" style="margin-top:8px">Clear chips</button>
    <p class="ctrl-note">Player and Banker bets push on a tie. Priced for 99% RTP.</p>`);
  stage.innerHTML = `<div class="stage-inner bac-stage">
    <div class="bac-hands"><div class="bac-hand" id="bc-ph"><div class="bj-row"><div class="label">Player <b id="bc-pt">-</b></div><div class="bj-cards" id="bc-p"></div></div></div>
    <div class="bac-hand" id="bc-bh"><div class="bj-row"><div class="label">Banker <b id="bc-bt">-</b></div><div class="bj-cards" id="bc-b"></div></div></div></div>
    <div class="bj-msg" id="bc-msg">Click a spot to place chips</div>
    <div class="bac-spots">${['player', 'tie', 'banker'].map((k) => `<button class="bac-spot ${k}" data-k="${k}">${k[0].toUpperCase() + k.slice(1)}<small>${DC.mult(info.multipliers[k])} &middot; ${(info.odds[k] * 100).toFixed(1)}%</small></button>`).join('')}</div></div>`;
  const $ = (id) => document.getElementById(id);

  function render() {
    let total = 0;
    stage.querySelectorAll('.bac-spot').forEach((s) => {
      const v = chips[s.dataset.k];
      total += v;
      const c = s.querySelector('.chip');
      if (c) c.remove();
      if (v) s.insertAdjacentHTML('beforeend', `<span class="chip">${DC.short(v)}</span>`);
    });
    $('bc-total').textContent = DC.short(total);
  }
  stage.querySelectorAll('.bac-spot').forEach((s) => (s.onclick = () => {
    if (busy) return;
    chips[s.dataset.k] += bet.get();
    stage.querySelectorAll('.bac-spot').forEach((x) => x.classList.remove('hit'));
    render();
  }));
  $('bc-clear').onclick = () => { if (!busy) { chips = { player: 0, banker: 0, tie: 0 }; render(); } };

  $('bc-deal').onclick = async () => {
    if (busy) return;
    const bets = Object.fromEntries(Object.entries(chips).filter(([, v]) => v > 0));
    if (!Object.keys(bets).length) return DC.toast('Place a chip on Player, Banker or Tie', 'err');
    if (!DC.canPlay()) return;
    busy = true; $('bc-deal').disabled = true;
    try {
      const r = await DC.api('/api/games/baccarat/play', { bets });
      DC.setBalance(r.balance - r.payout);
      const res = r.result;
      $('bc-p').innerHTML = ''; $('bc-b').innerHTML = ''; $('bc-pt').textContent = '-'; $('bc-bt').textContent = '-';
      $('bc-ph').classList.remove('won'); $('bc-bh').classList.remove('won');
      $('bc-msg').textContent = '';
      const order = [['p', res.player[0]], ['b', res.banker[0]], ['p', res.player[1]], ['b', res.banker[1]]];
      if (res.player[2]) order.push(['p', res.player[2]]);
      if (res.banker[2]) order.push(['b', res.banker[2]]);
      order.forEach(([w, c], i) => setTimeout(() => $('bc-' + w).insertAdjacentHTML('beforeend', DC.card(c)), i * 380));
      setTimeout(() => {
        $('bc-pt').textContent = res.playerTotal; $('bc-bt').textContent = res.bankerTotal;
        if (res.winner !== 'tie') $(res.winner === 'player' ? 'bc-ph' : 'bc-bh').classList.add('won');
        stage.querySelector(`.bac-spot[data-k="${res.winner}"]`).classList.add('hit');
        $('bc-msg').innerHTML = `${res.winner === 'tie' ? 'Tie' : res.winner[0].toUpperCase() + res.winner.slice(1) + ' wins'} &middot; ${r.payout ? `<span class="win">paid ${DC.fmt(r.payout)}</span>` : '<span class="loss">no win</span>'}`;
        DC.setBalance(r.balance); DC.history.add(r.bet);
        busy = false; $('bc-deal').disabled = false;
      }, order.length * 380 + 200);
    } catch (e) { DC.handleError(e); busy = false; $('bc-deal').disabled = false; }
  };
  render();
  DC.history.mount(document.getElementById('history'), 'baccarat');
})();
