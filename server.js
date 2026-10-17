require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const canonicalUrl = new URL(process.env.PUBLIC_URL || 'https://shop.menx.com');
if (canonicalUrl.protocol !== 'https:' || canonicalUrl.username || canonicalUrl.password ||
    canonicalUrl.pathname !== '/' || canonicalUrl.search || canonicalUrl.hash) {
  throw new Error('PUBLIC_URL must be an HTTPS origin, for example https://shop.menx.com');
}

const jwtSecret = process.env.JWT_SECRET || '';
const weakJwtSecrets = new Set([
  'change-this-to-a-long-random-secret',
  'dev-only-secret-change-me',
]);
if (isProduction && (jwtSecret.length < 32 || weakJwtSecrets.has(jwtSecret))) {
  throw new Error('Production requires a unique JWT_SECRET with at least 32 characters.');
}

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 ||
    (isProduction && trustProxyHops === 0)) {
  throw new Error('Production requires a trusted HTTPS reverse proxy. Set TRUST_PROXY_HOPS to its trusted hop count.');
}

const seed = require('./db/seed');
seed();

const app = express();
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

if (isProduction) {
  app.use((req, res, next) => {
    if (!req.secure || req.hostname.toLowerCase() !== canonicalUrl.hostname.toLowerCase()) {
      return res.redirect(308, `${canonicalUrl.origin}${req.originalUrl}`);
    }
    next();
  });
}

const securityDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
securityDirectives['img-src'] = [...securityDirectives['img-src'], 'https://images.unsplash.com'];
if (!securityDirectives['style-src'].includes("'unsafe-inline'")) {
  securityDirectives['style-src'].push("'unsafe-inline'");
}
app.use(helmet({
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  contentSecurityPolicy: {
    directives: securityDirectives,
  },
}));
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    const address = isProduction ? canonicalUrl.origin : `http://localhost:${PORT}`;
    console.log(`MENX running on ${address}`);
  });
}

module.exports = app;
