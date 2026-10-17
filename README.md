# MENX — Clothing Brand Website

Full-stack e-commerce site for the MENX menswear brand.

- **Frontend:** HTML, CSS and vanilla JavaScript (single-page storefront + admin panel), in `public/`
- **Backend:** Node.js + Express REST API
- **Database:** SQLite (a single file, created automatically at `data/menx.db`)

## Run it

```bash
npm install
cp .env.example .env      # then edit JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start
```

Open http://localhost:3000 (store) and http://localhost:3000/admin.html (admin) in local development.
On first start the database, an admin account and 14 sample products are created.
Needs Node.js 20 or newer.

### Deploy securely at shop.menx.com

The production server uses `https://shop.menx.com` as its canonical public URL,
redirects HTTP and alternate hostnames to HTTPS, and sends HSTS only for secure
production requests. Production refuses to start without a configured trusted
HTTPS reverse proxy.

To make this address publicly available:

1. Add `shop.menx.com` as a custom domain for your deployment and configure the
   exact DNS records provided by your hosting provider. The domain must be
   registered and under your control.
2. Enable the provider's managed TLS/HTTPS certificate and HTTP-to-HTTPS redirect.
   On your own server, place a trusted TLS-terminating reverse proxy such as Nginx
   in front of Express and redirect port 80 to port 443.
3. In the deployment's server-side environment, set `NODE_ENV=production`,
   `PUBLIC_URL=https://shop.menx.com`, `TRUST_PROXY_HOPS=1` (for one trusted
   proxy), and a unique `JWT_SECRET`. Generate a secret with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
   `TRUST_PROXY_HOPS` is required in production: set it to the actual number of
   trusted proxies between the public HTTPS endpoint and Express. `JWT_SECRET`
   must contain at least 32 characters; the sample placeholder is rejected.
   Never expose the production Express port directly to the internet.
4. Deploy/restart the app and verify `https://shop.menx.com` has a valid
   certificate. Managed hosts issue the certificate only after domain ownership
   and DNS are verified.

The application configures canonical HTTPS redirects and secure headers, but
cannot register the domain, change DNS, issue its public certificate, or
configure an external hosting account on your behalf.

### AI shopping assistant

The storefront assistant uses Google's `gemini-3.8-flash` model through the
Gemini API's OpenAI-compatible chat-completions endpoint. Create a Gemini API key
at [Google AI Studio](https://aistudio.google.com/apikey), then put it in
`GEMINI_API_KEY` in the server's `.env` or hosting-provider environment. The key
is only used by the backend and must never be added to frontend code. The model
defaults to `gemini-3.8-flash` and can be changed with `GEMINI_MODEL`. Restart
the server after setting a key. The assistant identifies whether its reply came
from Gemini or the no-key product-catalog fallback. Assistant requests are limited
to 12 messages per visitor every 10 minutes.

### Product photography

Sample product photos are served via the Unsplash image CDN and use responsive
image sizes up to 3840 pixels on large screens. Product photography requires an
internet connection. Set a product's image URL in the admin panel to use your own
product photography.

## Features

- Home, shop with category filter, search and sort, product pages with size selection
- Cart (saved in the browser), checkout with Cash on Delivery
- Customer sign-up / login (JWT) and order history
- Admin panel: add / edit / delete products, view orders, update order status
- Prices and stock are always checked on the server, so the cart cannot be tampered with
- Free shipping above ₹1,999, otherwise ₹99
- High-resolution, responsive product photography; product quick-view modals; an AI style assistant

## Project layout

```
server.js            Express app entry
db/schema.sql        Database tables (users, products, orders, order_items)
db/index.js          Opens the database
db/seed.js           Creates admin user + sample products
middleware/auth.js   JWT auth helpers
routes/              auth, products, orders API
public/              index.html, app.js, styles.css, admin.html, admin.js
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | returns `{token, user}` |
| GET | /api/products?category=&q=&sort= | `sort`: new, price_asc, price_desc |
| GET | /api/products/:id, /api/products/categories | |
| POST/PUT/DELETE | /api/products[/:id] | admin only |
| POST | /api/orders | guest or logged in |
| GET | /api/orders/mine | logged in |
| GET | /api/orders, PATCH /api/orders/:id/status | admin only |
| POST | /api/assistant | `{ "messages": [{ "role": "user", "content": "..." }] }` → `{ "reply": "..." }` |

## Before going live

- Set a strong `JWT_SECRET` and change the admin password.
- Serve over HTTPS (for example behind Nginx or on a host like Render or Railway).
- Add real product photos: put images in `public/images/` and set the product's image field to `/images/yourfile.jpg` in the admin panel.
- Online payments (Razorpay, Stripe) are not included; orders are Cash on Delivery. Add a payment step in `routes/orders.js` when ready.
- Add rate limiting (for example `express-rate-limit`) on the login routes.
