// Case definitions shared by Cases and Case Battles (simplified: every drop is a
// donut amount = case price x multiplier; no tradeable items). Drop multipliers are
// scaled so opening a case returns just under 99% on average.
const { fitTable } = require('./core');

const RAW = {
  glazed: {
    name: 'Glazed Box', color: '#f6b75c',
    drops: [['Crumbs', 0.2, 40], ['Plain Glazed', 0.6, 25], ['Sugar Ring', 1, 18], ['Double Glaze', 1.6, 10], ['Maple Bar', 3, 5], ['Boston Cream', 8, 1.6], ['Golden Glaze', 25, 0.4]],
  },
  sprinkle: {
    name: 'Sprinkle Crate', color: '#ff6fb5',
    drops: [['Crumbs', 0.1, 45], ['Rainbow Bit', 0.4, 25], ['Sprinkle Ring', 1.2, 15], ['Party Box', 3, 9], ['Cake Tower', 10, 4.5], ['Sprinkle Storm', 50, 1.3], ['Jackpot Dozen', 200, 0.2]],
  },
  golden: {
    name: 'Golden Vault', color: '#ffd98a',
    drops: [['Crumbs', 0.05, 60], ['Gold Flake', 0.5, 20], ['Gilded Ring', 2, 12], ['Golden Box', 8, 6], ['Gold Bar', 40, 1.7], ['Golden Vault', 500, 0.3]],
  },
};

const CASES = {};
for (const [id, c] of Object.entries(RAW)) {
  const totalW = c.drops.reduce((a, d) => a + d[2], 0);
  const probs = c.drops.map((d) => d[2] / totalW);
  const fit = fitTable(c.drops.map((d) => d[1]), probs, 0.01);
  CASES[id] = {
    id, name: c.name, color: c.color, rtp: Math.round(fit.rtp * 10000) / 10000,
    drops: c.drops.map((d, i) => ({ name: d[0], multiplier: fit.m[i], chance: probs[i], weight: d[2] })),
    totalWeight: totalW,
  };
}

function openCase(c, rng) {
  let x = rng.float() * c.totalWeight;
  for (let i = 0; i < c.drops.length; i++) { if (x < c.drops[i].weight) return i; x -= c.drops[i].weight; }
  return c.drops.length - 1;
}

module.exports = { CASES, openCase };
