const express = require('express');
const db = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const FREE_SHIPPING_ABOVE = 1999;
const SHIPPING_FEE = 99;
const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

router.post('/', optionalAuth, (req, res) => {
  const c = req.body.customer || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  const customer = {
    name: String(c.name || '').trim(),
    email: String(c.email || '').trim().toLowerCase(),
    phone: String(c.phone || '').trim(),
    address: String(c.address || '').trim(),
    city: String(c.city || '').trim(),
    pincode: String(c.pincode || '').trim(),
  };
  if (!customer.name || !customer.address || !customer.city) return res.status(400).json({ error: 'Please fill in all delivery details' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (!/^\d{10}$/.test(customer.phone)) return res.status(400).json({ error: 'Enter a 10-digit phone number' });
  if (!/^\d{6}$/.test(customer.pincode)) return res.status(400).json({ error: 'Enter a 6-digit pincode' });
  if (!items.length) return res.status(400).json({ error: 'Your cart is empty' });

  try {
    const orderId = db.transaction(() => {
      const lines = [];
      let subtotal = 0;
      for (const it of items) {
        const qty = Math.floor(Number(it.qty));
        if (!(qty > 0 && qty <= 10)) throw new Error('Invalid quantity');
        const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(it.productId);
        if (!p) throw new Error('A product in your cart is no longer available');
        const sizes = p.sizes.split(',').map(s => s.trim());
        if (!sizes.includes(it.size)) throw new Error(`Invalid size for ${p.name}`);
        const upd = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(qty, p.id, qty);
        if (!upd.changes) throw new Error(`Sorry, ${p.name} is out of stock`);
        lines.push({ p, size: it.size, qty });
        subtotal += p.price * qty; // price always comes from the database
      }
      const shipping = subtotal >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
      const info = db.prepare(
        `INSERT INTO orders (user_id, customer_name, email, phone, address, city, pincode, subtotal, shipping, total)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(req.user ? req.user.id : null, customer.name, customer.email, customer.phone, customer.address,
            customer.city, customer.pincode, subtotal, shipping, subtotal + shipping);
      const insItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, product_name, size, price, qty) VALUES (?,?,?,?,?,?)'
      );
      lines.forEach(l => insItem.run(info.lastInsertRowid, l.p.id, l.p.name, l.size, l.p.price, l.qty));
      return info.lastInsertRowid;
    })();
    res.status(201).json({ orderId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function withItems(orders) {
  const stmt = db.prepare('SELECT product_name, size, price, qty FROM order_items WHERE order_id = ?');
  return orders.map(o => ({ ...o, items: stmt.all(o.id) }));
}

router.get('/mine', requireAuth, (req, res) => {
  res.json(withItems(db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id)));
});

router.get('/', requireAdmin, (_req, res) => {
  res.json(withItems(db.prepare('SELECT * FROM orders ORDER BY id DESC').all()));
});

router.patch('/:id/status', requireAdmin, (req, res) => {
  if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Order not found' });
  res.json({ ok: true });
});

module.exports = router;
