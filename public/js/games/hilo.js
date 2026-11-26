(async function () {
  const DC = await window.DC.ready;
  const controls = document.getElementById('controls');
  const stage = document.getElementById('stage');
  let game = null;
  let busy = false;

  const bet = DC.betInput(controls, 'hilo');
  controls.insertAdjacentHTML('beforeend', `
    <div class="guess-btns" id="hl-guess"></div>
    <div class="stat-row"><div class="stat"><small>Multiplier</small><b id="hl-mult">0.00x</b></div><div class="stat"><small>Cash out</small><b id="hl-cash">0</b></div></div>
    <button class="btn primary big" id="hl-main">Start</button>
    <p class="ctrl-note">A is low, K is high. Skip swaps the card for free.</p>`);
  stage.innerHTML = `<div class="stage-inner hilo-stage"><div class="hilo-main" id="hl-card">${DC.card(null)}</div>
    <div class="bj-msg" id="hl-msg">Start a round to draw a card</div><div class="hilo-chain" id="hl-chain"></div></div>`;
  const $ = (id) => document.getElementById(id);
  const LABEL = { higher: 'Higher', lower: 'Lower', same: 'Same' };

  function render(g, done) {
    $('hl-card').innerHTML = DC.card(g ? g.card : null);
    $('hl-chain').innerHTML = (g ? g.chain : []).map((s) => `<div class="step ${s.guess === 'skip' ? 'skip' : s.ok === true ? 'ok' : s.ok === false ? 'bad' : ''}">${DC.card(s.card, 'small')}<span>${s.guess === 'start' ? 'start' : s.guess}</span></div>`).join('');
    $('hl-chain').scrollLeft = 1e6;
    const active = !!(g && !done);
    const box = $('hl-guess');
    if (active) {
      const cardName = DC.rankName(g.card.r);
      const opts = Object.entries(g.options).map(([k, o]) => {
        const label = k === 'same' ? 'Same' : g.card.r === 1 || g.card.r === 13 ? LABEL[k] : `${LABEL[k]} or same`;
        return `<button class="btn" data-g="${k}">${label} than ${cardName}<small>${(o.chance * 100).toFixed(1)}% &middot; ${DC.mult(o.multiplier)}</small></button>`;
      });
      opts.push(`<button class="btn ghost" data-g="skip">Skip card<small>${g.maxSkips - g.skips} left</small></button>`);
      box.innerHTML = opts.join('');
      box.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => guess(b.dataset.g)));
    } else box.innerHTML = '';
    $('hl-mult').textContent = DC.mult(g && g.multiplier ? g.multiplier : 0);
    $('hl-cash').textContent = g && active ? DC.short(g.cashout) : '0';
    const main = $('hl-main');
    if (active) { main.textContent = g.steps ? `Cash out ${DC.short(g.cashout)}` : 'Make a guess'; main.className = 'btn success big'; main.disabled = busy || !g.steps; }
    else { main.textContent = 'Start'; main.className = 'btn primary big'; main.disabled = busy; }
    box.querySelectorAll('button').forEach((b) => (b.disabled = busy));
    bet.disable(active);
  }
  function finish(r) {
    game = null;
    render({ card: r.card, chain: r.chain, multiplier: r.multiplier }, true);
    $('hl-msg').innerHTML = r.win ? `<span class="win">Cashed out ${DC.fmt(r.payout)}</span>` : `<span class="loss">Wrong! It was ${DC.rankName(r.card.r)}</span>`;
    DC.setBalance(r.balance);
    DC.history.add(r.bet);
    if (r.win) DC.pop(stage, true, DC.mult(r.multiplier), `+${DC.fmt(r.payout)} donuts`);
  }
  async function call(action, body) {
    busy = true; render(game);
    try {
      const r = await DC.api(`/api/games/hilo/${action}`, body);
      busy = false;
      if (r.done) return finish(r);
      game = r.game; DC.setBalance(r.balance);
      $('hl-msg').innerHTML = action === 'start' ? 'Higher or lower?' : r.correct ? '<span class="win">Correct!</span>' : 'Card skipped';
    } catch (e) { busy = false; DC.handleError(e); }
    render(game);
  }
  const guess = (choice) => !busy && game && call('guess', { choice });
  $('hl-main').onclick = () => {
    if (busy) return;
    if (game) return call('cashout', {});
    if (!DC.canPlay()) return;
    call('start', { bet: bet.get() });
  };

  if (DC.me) {
    try { const r = await DC.api('/api/games/hilo/state', {}); if (r.game) { game = r.game; $('hl-msg').textContent = 'Higher or lower?'; } } catch { /* ignore */ }
  }
  render(game);
  DC.history.mount(document.getElementById('history'), 'hilo');
})();
