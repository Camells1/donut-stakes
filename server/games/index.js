// Game registry. To add a game: create server/games/<id>.js (use instantGame() from
// core.js for one-shot games, or export { id, name, actions } for stateful ones),
// add it to this list, and add public/js/games/<id>.js for the UI.
const games = [
  require('./plinko'),
  require('./mines'),
  require('./coinflip'),
  require('./dice'),
  require('./limbo'),
  require('./crash'),
  require('./roulette'),
  require('./blackjack'),
  require('./slots'),
  require('./hilo'),
  require('./keno'),
  require('./towers'),
  require('./chicken'),
  require('./diceduel'),
  require('./slider'),
  require('./rps'),
  require('./baccarat'),
  require('./upgrader'),
  require('./cases'),
  require('./casebattle'),
].sort((a, b) => (a.order || 99) - (b.order || 99));

const byId = Object.fromEntries(games.map((g) => [g.id, g]));

function list() {
  return games.map((g) => ({ id: g.id, name: g.name, description: g.description, info: g.info || {} }));
}

module.exports = { games, byId, list };
