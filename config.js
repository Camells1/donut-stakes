// Donut Stakes - the ONE place for the site name, bots, limits, rewards and legal placeholders.
// Change values here; the server injects them into every page and API response.
module.exports = {
  siteName: 'Donut Stakes',
  tagline: 'Spin, drop and flip for in-game donuts',
  currency: { singular: 'donut', plural: 'donuts' },

  port: 5320,            // overridden by PORT in .env
  houseEdge: 0.01,       // 1% edge => 99% RTP on every game
  minBet: 1,
  maxBet: 1_000_000_000,
  maxPayout: 10_000_000_000, // single-bet payout cap (protects the bank)
  minWithdraw: 1,
  sessionDays: 30,
  pendingLoginMinutes: 30,

  // In-game bot accounts players pay. Exactly one should be active; the site shows the active one.
  bots: [
    { ign: '[BOT_IGN]', active: true },
    // { ign: '[BACKUP_BOT_IGN]', active: false },
  ],

  // Verification: the player pays the bot a small unique whole-number amount (credited to their balance).
  verify: { minAmount: 1, maxAmount: 999, expiryHours: 24 },
  // Deposits: the player asks to deposit N; the site may add +1, +2... so each pending amount is unique.
  deposit: { minAmount: 1, maxAmount: 1_000_000_000, expiryMinutes: 30, maxPending: 5 },

  // Rewards
  rewards: {
    dailyCooldownHours: 24,
    // VIP tiers by total wagered. dailyBonus = donuts per daily claim; rakeback = share of net losses.
    vipTiers: [
      { name: 'Sprinkle', minWagered: 0, dailyBonus: 25, rakeback: 0.01 },
      { name: 'Glazed', minWagered: 100_000, dailyBonus: 100, rakeback: 0.02 },
      { name: 'Frosted', minWagered: 1_000_000, dailyBonus: 250, rakeback: 0.04 },
      { name: 'Golden', minWagered: 10_000_000, dailyBonus: 1000, rakeback: 0.06 },
    ],
  },

  // Affiliates: referrers earn this share of the house edge (houseEdge x wagered) their referrals generate.
  // Commission accrues, then the owner reviews and approves each payout before it is credited.
  affiliates: { commissionRate: 0.05, applyWindowDays: 7 },

  // Legal placeholders: fill these in before going live (shown on ToS/Privacy/RG pages).
  legal: {
    ownerName: '[OWNER NAME]',
    legalEntity: '[LEGAL ENTITY / "an individual"]',
    contact: '[CONTACT EMAIL OR DISCORD]',
    jurisdiction: '[JURISDICTION]',
    serverName: '[MINECRAFT SERVER NAME, e.g. Donut SMP]',
    effectiveDate: '[EFFECTIVE DATE]',
  },
};

// The bot players should pay right now.
module.exports.activeBot = () => (module.exports.bots.find((b) => b.active) || module.exports.bots[0]).ign;
