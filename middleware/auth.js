const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
}

function readUser(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(h.slice(7), SECRET);
    return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.id) || null;
  } catch {
    return null;
  }
}

function optionalAuth(req, _res, next) {
  req.user = readUser(req);
  next();
}

function requireAuth(req, res, next) {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

module.exports = { sign, optionalAuth, requireAuth, requireAdmin };
