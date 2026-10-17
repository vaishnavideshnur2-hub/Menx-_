const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const shape = p => ({ ...p, sizes: p.sizes.split(',').map(s => s.trim()).filter(Boolean), featured: !!p.featured });

router.get('/categories', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category').all();
  res.json(rows.map(r => r.category));
});

router.get('/', (req, res) => {
  const where = ['active = 1'];
  const params = [];
  if (req.query.category) { where.push('category = ?'); params.push(req.query.category); }
  if (req.query.featured) { where.push('featured = 1'); }
  if (req.query.q) { where.push('(name LIKE ? OR description LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }

  const order = { price_asc: 'price ASC', price_desc: 'price DESC', new: 'id DESC' }[req.query.sort] || 'id ASC';
  const rows = db.prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...params);
  res.json(rows.map(shape));
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(shape(p));
});

// ---- admin ----
function clean(body) {
  const name = String(body.name || '').trim();
  const price = Math.round(Number(body.price));
  const stock = Math.round(Number(body.stock));
  if (!name) return { error: 'Name is required' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Invalid price' };
  if (!Number.isFinite(stock) || stock < 0) return { error: 'Invalid stock' };
  return {
    value: {
      name,
      description: String(body.description || ''),
      price,
      category: String(body.category || 'Other').trim() || 'Other',
      sizes: String(body.sizes || 'S,M,L,XL'),
      color: String(body.color || '#222222'),
      image: String(body.image || ''),
      stock,
      featured: body.featured ? 1 : 0,
    },
  };
}

router.post('/', requireAdmin, (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(
    `INSERT INTO products (name, description, price, category, sizes, color, image, stock, featured)
     VALUES (@name,@description,@price,@category,@sizes,@color,@image,@stock,@featured)`
  ).run(value);
  res.status(201).json(shape(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', requireAdmin, (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(
    `UPDATE products SET name=@name, description=@description, price=@price, category=@category,
     sizes=@sizes, color=@color, image=@image, stock=@stock, featured=@featured WHERE id=@id`
  ).run({ ...value, id: req.params.id });
  if (!info.changes) return res.status(404).json({ error: 'Product not found' });
  res.json(shape(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
});

// soft delete so past orders keep their reference
router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

module.exports = router;
