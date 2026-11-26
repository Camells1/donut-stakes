// Owner-only API under /api/admin. Every route needs ADMIN_SECRET in the
// "X-Admin-Secret" header (or "Authorization: Bearer <secret>").
const crypto = require('crypto');
const express = require('express');

function adminOk(req) {
  const want = Buffer.from(process.env.ADMIN_SECRET || '');
  const h = req.headers.authorization || '';
  const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : String(req.headers['x-admin-secret'] || ''));
  return want.length > 0 && got.length === want.length && crypto.timingSafeEqual(got, want);
}

const router = express.Router();
router.use((req, res, next) => {
  if (!adminOk(req)) return res.status(401).json({ ok: false, code: 'bad_secret', error: 'Bad admin secret' });
  next();
});

module.exports = { router, adminOk };
