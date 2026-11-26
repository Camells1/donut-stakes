(async function () {
  const DC = await window.DC.ready;
  const info = DC.games.find((g) => g.id === 'blackjack').info;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let game = null;
  let busy = false;

  const bet = DC.betInput(controls, 'blackjack');
  controls.insertAdjacentHTML('beforeend', `
    <button class="btn primary big" id="bj-deal">Deal</button>
    <div class="btn-row" style="margin-top:8px"><button class="btn" id="bj-hit">Hit</button><button class="btn" id="bj-stand">Stand</button><button class="btn" id="bj-double">Double</button></div>
    <p class="ctrl-note">${DC.esc(info.rules)} Dealer stands on soft 17.</p>`);
  stage.innerHTML = `<div class="stage-inner bj-stage">
    <div class="bj-row"><div class="label">Dealer <b id="bj-dt">-</b></div><div class="bj-cards" id="bj-dealer"></div></div>
    <div class="bj-msg" id="bj-msg"></div>
    <div class="bj-row"><div class="bj-cards" id="bj-player"></div><div class="label" style="margin:10px 0 0">You <b id="bj-pt">-</b></div></div></div>`;

  const $ = (id) => document.getElementById(id);
  const fmtTotal = (t) => (t ? (t.soft && t.t < 21 ? `${t.t - 10}/${t.t}` : t.t) : '-');
  let shown = { p: 0, d: 0 };

  function render(g, reveal) {
    const pc = $('bj-player'), dc = $('bj-dealer');
    if (!g) { pc.innerHTML = ''; dc.innerHTML = ''; $('bj-pt').textContent = '-'; $('bj-dt').textContent = '-'; shown = { p: 0, d: 0 }; return; }
    // Only append new cards so earlier ones do not re-animate.
    if (shown.p > g.player.length) { pc.innerHTML = ''; shown.p = 0; }
    g.player.slice(shown.p).forEach((c) => pc.insertAdjacentHTML('beforeend', DC.card(c)));
    shown.p = g.player.length;
    const dcards = reveal ? g.dealer : [g.dealer[0], null];
    dc.innerHTML = dcards.map((c, i) => DC.card(c, i < shown.d && c ? 'nodeal' : '')).join('');
    dc.querySelectorAll('.nodeal').forEach((e) => (e.style.animation = 'none'));
    shown.d = dcards.filter(Boolean).length;
    $('bj-pt').textContent = fmtTotal(g.playerTotal);
    $('bj-dt').textContent = fmtTotal(g.dealerTotal);
  }
  function buttons() {
    const active = !!(game && game.active);
    $('bj-deal').disabled = busy || active;
    $('bj-hit').disabled = busy || !active;
    $('bj-stand').disabled = busy || !active;
    $('bj-double').disabled = busy || !active || !game.canDouble;
    bet.disable(active);
  }
  const MSG = { blackjack: 'Blackjack!', win: 'You win', dealer_bust: 'Dealer busts', push: 'Push', lose: 'Dealer wins', bust: 'Bust', dealer_blackjack: 'Dealer blackjack' };
  function finish(r) {
    game = { ...r.game, active: false };
    render(r.game, true);
    const win = r.payout > r.bet.bet, push = r.payout === r.bet.bet;
    $('bj-msg').textContent = MSG[r.outcome] || r.outcome;
    $('bj-msg').className = 'bj-msg ' + (win ? 'win' : push ? '' : 'loss');
    DC.setBalance(r.balance);
    DC.history.add(r.bet);
    if (win) DC.pop(stage, true, `+${DC.short(r.payout - r.bet.bet)}`, MSG[r.outcome]);
  }
  async function act(action) {
    if (busy) return;
    if (action === 'start' && !DC.canPlay()) return;
    busy = true; buttons();
    try {
      const r = await DC.api(`/api/games/blackjack/${action}`, action === 'start' ? { bet: bet.get() } : {});
      if (action === 'start') { render(null); $('bj-msg').textContent = ''; $('bj-msg').className = 'bj-msg'; }
      if (r.done) finish(r);
      else { game = r.game; render(game, false); DC.setBalance(r.balance); }
    } catch (e) { DC.handleError(e); }
    busy = false; buttons();
  }
  $('bj-deal').onclick = () => act('start');
  $('bj-hit').onclick = () => act('hit');
  $('bj-stand').onclick = () => act('stand');
  $('bj-double').onclick = () => act('double');

  if (DC.me) {
    try { const r = await DC.api('/api/games/blackjack/state', {}); if (r.game) { game = r.game; render(game, false); } } catch { /* ignore */ }
  }
  buttons();
  DC.history.mount(document.getElementById('history'), 'blackjack');
})();
