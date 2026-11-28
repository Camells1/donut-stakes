(async function () {
  const DC = await window.DC.ready;
  const root = document.getElementById('page');

  async function load() {
    let r;
    try { r = await DC.api('/api/leaderboard?limit=50'); } catch (e) { return DC.handleError(e); }
    const rows = r.rows.map((x) => `<tr>
      <td>#${x.rank}</td>
      <td>${DC.esc(x.tag)}</td>
      <td style="text-align:right">${DC.fmt(x.wagered)}</td>
      <td style="text-align:right" class="${x.profit >= 0 ? 'win' : 'loss'}">${x.profit >= 0 ? '+' : ''}${DC.fmt(x.profit)}</td></tr>`).join('');
    root.innerHTML = `<section class="panel full">
      <h1 style="font-size:30px">Leaderboard</h1>
      <p class="muted">Ranked by total donuts wagered. Players are anonymous: only a random tag is shown, never a username.</p>
      ${rows ? `<table class="board"><thead><tr><th>Rank</th><th>Player</th><th style="text-align:right">Wagered</th><th style="text-align:right">Profit</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No bets yet. Be the first on the board.</p>'}
    </section>`;
  }

  await load();
})();
