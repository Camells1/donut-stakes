// Crypto-grade randomness (node:crypto CSPRNG) for every game outcome.
const crypto = require('crypto');

// Uniform float in [0, 1) with 52 bits of entropy.
function float() {
  const b = crypto.randomBytes(7);
  let x = 0;
  for (let i = 0; i < 7; i++) x = x * 256 + b[i];
  return (x % 2 ** 52) / 2 ** 52;
}
// Uniform integer in [min, max).
function int(min, max) { return crypto.randomInt(min, max); }
function bit() { return crypto.randomInt(0, 2); }
// k distinct indices from [0, n) (partial Fisher-Yates).
function sample(n, k) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = crypto.randomInt(i, n);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

module.exports = { float, int, bit, sample };
