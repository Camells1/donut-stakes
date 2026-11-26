(async function () {
  const DC = await window.DC.ready;

  // A plain grid: game name and one short line each.
  document.getElementById('games-grid').innerHTML = DC.games.map((g) =>
    `<a class="game-card" href="/play/${g.id}"><h3>${DC.esc(g.name)}</h3><p>${DC.esc(g.description)}</p></a>`).join('');

  const cta = document.getElementById('hero-cta');
  if (DC.me) cta.innerHTML = DC.me.verified ? '<a class="btn" href="/deposit">Deposit</a>' : '<a class="btn primary" href="/account">Verify your account</a>';
  else {
    cta.innerHTML = '<button class="btn primary" id="hero-signup">Sign up</button><button class="btn" id="hero-login">Log in</button>';
    document.getElementById('hero-signup').onclick = () => DC.openAuth('signup');
    document.getElementById('hero-login').onclick = () => DC.openAuth('login');
  }

  DC.botCard(document.getElementById('bot-card'));
  DC.history.mount(document.getElementById('history'), '');
  DC.history.scope = 'all';
  DC.history.load();
})();
