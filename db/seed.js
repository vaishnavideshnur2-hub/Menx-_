const bcrypt = require('bcryptjs');
const db = require('./index');

const PRODUCTS = [
  ['MENX Essential Tee', 'Heavyweight 240 GSM cotton tee with a boxy fit and ribbed collar.', 799, 'T-Shirts', 'S,M,L,XL,XXL', '#111111', 60, 1, 'photo-1521572163474-6864f9cf17ab'],
  ['MENX Oversized Graphic Tee', 'Drop-shoulder oversized tee with a puff-print MENX back graphic.', 999, 'T-Shirts', 'S,M,L,XL', '#2b2b2b', 45, 1, 'photo-1576566588028-4147f3842f27'],
  ['Washed Sand Tee', 'Garment-washed cotton in a soft sand tone. Lived-in feel from day one.', 849, 'T-Shirts', 'S,M,L,XL', '#b9a88a', 40, 0, 'photo-1523381210434-271e8be1f52b'],
  ['Classic Oxford Shirt', 'Crisp cotton Oxford with a button-down collar. Smart or casual.', 1499, 'Shirts', 'S,M,L,XL', '#8fa3b8', 35, 1, 'photo-1596755094514-f87e34085b2c'],
  ['Linen Camp Collar Shirt', 'Breathable pure linen, relaxed fit, perfect for warm days.', 1699, 'Shirts', 'M,L,XL', '#c9c2a8', 25, 0, 'photo-1598033129183-c4f50c736f10'],
  ['Black Utility Shirt', 'Twin-pocket overshirt in a durable cotton twill.', 1799, 'Shirts', 'S,M,L,XL', '#1a1a1a', 30, 0, 'photo-1598033129183-c4f50c736f10'],
  ['Straight Fit Indigo Jeans', 'Rigid indigo denim, straight leg, 12 oz.', 2199, 'Jeans', '28,30,32,34,36', '#26364f', 40, 1, 'photo-1542272604-787c3835535d'],
  ['Washed Black Jeans', 'Slim-tapered stretch denim with a faded black wash.', 2099, 'Jeans', '28,30,32,34,36', '#2a2a2a', 38, 0, 'photo-1548883354-7622d03aca27'],
  ['MENX Core Hoodie', 'Brushed-fleece 400 GSM hoodie with embroidered MENX chest logo.', 1999, 'Hoodies', 'S,M,L,XL,XXL', '#3a3a3a', 50, 1, 'photo-1523381210434-271e8be1f52b'],
  ['Zip-Up Track Hoodie', 'Full-zip hoodie with contrast side stripes.', 2299, 'Hoodies', 'S,M,L,XL', '#4a5a4a', 28, 0, 'photo-1576566588028-4147f3842f27'],
  ['Bomber Jacket', 'Lightweight nylon bomber with ribbed cuffs and hem.', 3499, 'Jackets', 'S,M,L,XL', '#273127', 20, 1, 'photo-1488161628813-04466f872be2'],
  ['Denim Trucker Jacket', 'Classic trucker silhouette in mid-wash denim.', 3299, 'Jackets', 'S,M,L,XL', '#4b6584', 18, 0, 'photo-1548883354-7622d03aca27'],
  ['MENX Cap', 'Six-panel cotton cap with embroidered logo and adjustable strap.', 599, 'Accessories', 'FREE', '#101010', 80, 0, 'photo-1588850561407-ed78c282e89b'],
  ['Canvas Tote', 'Heavy canvas tote bag with MENX print.', 499, 'Accessories', 'FREE', '#d8d2c2', 70, 0, 'photo-1598033129183-c4f50c736f10'],
];

const PREVIOUS_SEED_PHOTOS = new Map([
  ['Linen Camp Collar Shirt', 'photo-1620012253295-c15a3e2dacf5'],
  ['MENX Core Hoodie', 'photo-1556821840-3a63f95609a7'],
  ['Zip-Up Track Hoodie', 'photo-1578681994506-b8f463449011'],
  ['Bomber Jacket', 'photo-1551028719-00167b16eac5'],
  ['Denim Trucker Jacket', 'photo-1591047139829-d91aecb6caea'],
  ['Canvas Tote', 'photo-1544816155-12df9643f363'],
]);

function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@menx.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe@123';

  if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail)) {
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
      .run('MENX Admin', adminEmail, bcrypt.hashSync(adminPassword, 10), 'admin');
    console.log('Admin user created:', adminEmail);
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO products (name, description, price, category, sizes, color, stock, featured, image) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    db.transaction(() => PRODUCTS.forEach(p => {
      const photoUrl = `https://images.unsplash.com/${p[8]}`;
      ins.run(...p.slice(0, 8), photoUrl);
    }))();
    console.log(`Seeded ${PRODUCTS.length} products`);
  }

  const addPhoto = db.prepare("UPDATE products SET image = ? WHERE name = ? AND COALESCE(image, '') = ''");
  const replaceOldPhoto = db.prepare('UPDATE products SET image = ? WHERE name = ? AND image = ?');
  db.transaction(() => PRODUCTS.forEach(product => {
    const photoUrl = `https://images.unsplash.com/${product[8]}`;
    const previousPhoto = PREVIOUS_SEED_PHOTOS.get(product[0]);
    if (previousPhoto) replaceOldPhoto.run(photoUrl, product[0], `https://images.unsplash.com/${previousPhoto}`);
    addPhoto.run(photoUrl, product[0]);
  }))();
}

module.exports = seed;

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  seed();
}
