(() => {
  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  document.getElementById('year').textContent = new Date().getFullYear();

  const money = n => '₹' + Number(n).toLocaleString('en-IN');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeColor = c => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#222');
  const imageUrl = (url, width) => {
    try {
      const image = new URL(url, location.origin);
      if (image.hostname !== 'images.unsplash.com') return esc(url);
      image.searchParams.set('auto', 'format');
      image.searchParams.set('fit', 'crop');
      image.searchParams.set('w', String(width));
      image.searchParams.set('q', '88');
      return esc(image.href);
    } catch {
      return '';
    }
  };
  const imageSrcSet = url => [320, 480, 640, 960, 1440, 1920, 2560, 3840]
    .map(width => `${imageUrl(url, width)} ${width}w`)
    .join(', ');
  const FREE_ABOVE = 1999, SHIP = 99;

  // ---------- state ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  let cart = load('menx_cart', []);
  let token = localStorage.getItem('menx_token') || '';
  let user = load('menx_user', null);
  const saveCart = () => { localStorage.setItem('menx_cart', JSON.stringify(cart)); renderNav(); };
  const setAuth = (t, u) => {
    token = t || ''; user = u || null;
    t ? localStorage.setItem('menx_token', t) : localStorage.removeItem('menx_token');
    u ? localStorage.setItem('menx_user', JSON.stringify(u)) : localStorage.removeItem('menx_user');
    renderNav();
  };

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- shared pieces ----------
  function renderNav() {
    const count = cart.reduce((n, i) => n + i.qty, 0);
    $nav.innerHTML = `
      <a href="#/shop">Shop</a>
      ${user ? `<a href="#/orders">Orders</a>` : ''}
      ${user && user.role === 'admin' ? `<a href="/admin.html">Admin</a>` : ''}
      ${user ? `<button data-action="logout">Logout</button>` : `<a href="#/login">Login</a>`}
      <a href="#/cart">Cart<span class="badge">${count}</span></a>`;
  }

  const tile = (p, cls = '', width = 960) =>
    `<div class="img ${cls}" style="background:${safeColor(p.color)}">${p.image
      ? `<img src="${imageUrl(p.image, width)}" ${p.image.startsWith('https://images.unsplash.com/')
        ? `srcset="${imageSrcSet(p.image)}" sizes="${cls === 'thumb'
          ? '70px'
          : cls === 'quick-view-image'
            ? '(max-width: 800px) 100vw, 50vw'
            : '(max-width: 800px) 50vw, (min-width: 1920px) 20vw, 25vw'}"`
        : ''} alt="${esc(p.name)}" loading="lazy" decoding="async">`
      : `<span>${esc(p.name)}</span>`}</div>`;

  const card = p => `
    <article class="card">
      <a class="card-link" href="#/product/${p.id}" aria-label="View ${esc(p.name)}">
        ${tile({ ...p, name: p.name }, '', 960)}
        <div class="cat-label">${esc(p.category)}</div>
        <h3>${esc(p.name)}</h3>
      </a>
      <div class="card-meta"><span class="price">${money(p.price)}</span> ${p.stock < 1 ? '<span class="sold">Sold out</span>' : ''}</div>
      <button class="quick-view-trigger" type="button" data-action="quick-view" data-id="${p.id}" aria-label="Quick view ${esc(p.name)}">Quick view <span aria-hidden="true">↗</span></button>
    </article>`;

  const setView = html => { $app.innerHTML = html; window.scrollTo(0, 0); };
  const loading = () => setView('<div class="wrap empty">Loading…</div>');
  const fail = e => setView(`<div class="wrap empty">${esc(e.message)}</div>`);

  // ---------- views ----------
  async function home() {
    loading();
    const [featured, cats] = await Promise.all([api('/products?featured=1'), api('/products/categories')]);
    setView(`
      <section class="hero">
        <img class="hero-image"
          src="${imageUrl('https://images.unsplash.com/photo-1488161628813-04466f872be2', 1920)}"
          srcset="${imageSrcSet('https://images.unsplash.com/photo-1488161628813-04466f872be2')}"
          sizes="100vw" alt="" fetchpriority="high" decoding="async">
        <div class="hero-shade"></div>
        <div class="wrap hero-copy">
          <span class="hero-eyebrow">MENX STUDIO · BUILT FOR EVERY DAY</span>
          <h1>WEAR<br>THE <em>EDGE.</em></h1>
          <p>Modern menswear built on heavyweight fabrics, clean cuts and zero compromise.</p>
          <a class="btn" href="#/shop">Shop the collection <span aria-hidden="true">↗</span></a>
          <div class="hero-note">DESIGNED TO MOVE DIFFERENTLY</div>
        </div>
        <span class="hero-index" aria-hidden="true">01 / 04</span>
      </section>
      <section class="block"><div class="wrap">
        <h2 class="title">Shop by category</h2>
        <div class="cats">${cats.map(c => `<a class="cat" href="#/shop?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
      </div></section>
      <section class="block"><div class="wrap">
        <h2 class="title">Featured</h2>
        <div class="grid">${featured.map(card).join('')}</div>
      </div></section>`);
  }

  async function shop(params) {
    loading();
    const q = new URLSearchParams(params);
    const [products, cats] = await Promise.all([api('/products?' + q.toString()), api('/products/categories')]);
    const cur = q.get('category') || '';
    setView(`
      <div class="wrap" style="padding-top:36px">
        <h2 class="title">${cur ? esc(cur) : 'All products'}</h2>
        <div class="filters">
          <button class="chip ${!cur ? 'on' : ''}" data-action="cat" data-cat="">All</button>
          ${cats.map(c => `<button class="chip ${cur === c ? 'on' : ''}" data-action="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <div class="filters">
          <input id="search" placeholder="Search…" value="${esc(q.get('q') || '')}">
          <select id="sort">
            <option value="">Sort: Default</option>
            <option value="new" ${q.get('sort') === 'new' ? 'selected' : ''}>Newest</option>
            <option value="price_asc" ${q.get('sort') === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
            <option value="price_desc" ${q.get('sort') === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
          </select>
        </div>
        ${products.length ? `<div class="grid">${products.map(card).join('')}</div>` : '<div class="empty">No products found.</div>'}
      </div>`);
  }

  let selectedSize = '';
  let quickViewProduct = null;
  let quickViewSize = '';
  const quickView = document.getElementById('quick-view');
  const quickViewContent = document.getElementById('quick-view-content');

  async function openQuickView(id) {
    quickViewProduct = null;
    quickViewSize = '';
    quickViewContent.innerHTML = '<p class="quick-view-status" role="status">Loading product…</p>';
    quickView.showModal();
    try {
      const p = await api('/products/' + encodeURIComponent(id));
      quickViewProduct = p;
      quickViewContent.innerHTML = `
        <div class="quick-view-layout">
          ${tile(p, 'quick-view-image', 1440)}
          <div class="quick-view-info">
            <div class="cat-label">${esc(p.category)}</div>
            <h2>${esc(p.name)}</h2>
            <div class="price">${money(p.price)}</div>
            <p>${esc(p.description)}</p>
            <span class="quick-view-label">SELECT YOUR SIZE</span>
            <div class="sizes">${p.sizes.map(size => `<button class="size" type="button" data-action="quick-size" data-size="${esc(size)}">${esc(size)}</button>`).join('')}</div>
            <button class="btn quick-view-add" type="button" data-action="quick-add" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Sold out' : 'Add to bag — ' + money(p.price)}</button>
            <p class="quick-view-stock">${p.stock > 0 ? `${p.stock} available` : 'Currently out of stock'}</p>
            <a class="quick-view-details" data-action="close-quick-view" href="#/product/${p.id}">View full details <span aria-hidden="true">↗</span></a>
          </div>
        </div>`;
    } catch (error) {
      quickViewContent.innerHTML = `<p class="quick-view-status" role="alert">${esc(error.message)}</p>`;
    }
  }

  const assistantPanel = document.getElementById('assistant-panel');
  const assistantMessages = document.getElementById('assistant-messages');
  const assistantForm = document.getElementById('assistant-form');
  const assistantInput = document.getElementById('assistant-input');
  const assistantPrompts = document.getElementById('assistant-prompts');
  const assistantStatus = document.getElementById('assistant-status');
  let assistantHistory = [];
  let lastFailedMessage = '';

  function formatAssistantReply(text) {
    let listType = '';
    const closeList = () => {
      if (!listType) return '';
      const closingTag = listType;
      listType = '';
      return `</${closingTag}>`;
    };
    const inlineFormatting = line => esc(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const formattedLines = [];

    for (const line of text.split(/\r?\n/)) {
      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const nextList = unordered ? 'ul' : 'ol';
        if (listType && listType !== nextList) formattedLines.push(closeList());
        if (!listType) {
          listType = nextList;
          formattedLines.push(`<${listType}>`);
        }
        formattedLines.push(`<li>${inlineFormatting((unordered || ordered)[1])}</li>`);
      } else {
        const closingTag = closeList();
        if (line.trim()) formattedLines.push(`${closingTag}<p>${inlineFormatting(line)}</p>`);
        else formattedLines.push(`${closingTag}<br>`);
      }
    }

    formattedLines.push(closeList());
    return formattedLines.join('');
  }

  function appendAssistantMessage(text, sender, source = '', options = {}) {
    const message = document.createElement('div');
    message.className = `assistant-message assistant-${sender}`;
    if (options.pending) message.setAttribute('role', 'status');
    if (source) {
      const label = document.createElement('small');
      label.className = 'assistant-source';
      label.textContent = source;
      message.append(label);
    }
    const content = document.createElement('span');
    content.className = sender === 'reply' ? 'assistant-content' : '';
    if (sender === 'reply') content.innerHTML = formatAssistantReply(text);
    else content.textContent = text;
    message.append(content);
    if (options.retry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'assistant-retry';
      retry.dataset.action = 'assistant-retry';
      retry.textContent = 'Try again';
      message.append(retry);
    }
    assistantMessages.append(message);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
    return message;
  }

  async function readAssistantStream(response, onEvent) {
    if (!response.body) throw new Error('The assistant response stream is unavailable. Please try again.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    function processBlock(block) {
      const data = block
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (!data) return;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        throw new Error('The assistant sent an invalid streaming response.');
      }

      if (event.type === 'error') throw new Error(event.error || 'The assistant could not finish the reply.');
      if (event.type === 'done') completed = true;
      onEvent(event);
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          processBlock(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
        }
        if (done) break;
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }

    if (buffer.trim()) processBlock(buffer);
    if (!completed) throw new Error('The assistant connection ended before the reply was complete. Please try again.');
  }

  async function sendAssistantMessage(text, retry = false) {
    const message = text.trim();
    const sendButton = assistantForm.querySelector('button[type="submit"]');
    if (!message || sendButton.disabled) return;

    if (retry) {
      assistantMessages.querySelector('.assistant-error:last-child')?.remove();
    } else {
      appendAssistantMessage(message, 'question');
      assistantHistory.push({ role: 'user', content: message });
      assistantHistory = assistantHistory.slice(-8);
    }
    assistantPrompts.hidden = true;

    sendButton.disabled = true;
    assistantInput.disabled = true;
    assistantStatus.textContent = 'Finding the right pieces…';
    const pendingMessage = appendAssistantMessage('Thinking…', 'pending', '', { pending: true });
    const replyContent = pendingMessage.querySelector('span');
    let reply = '';
    let metadata = null;

    function showReplySource(source) {
      let label = pendingMessage.querySelector('.assistant-source');
      if (!label) {
        label = document.createElement('small');
        label.className = 'assistant-source';
        pendingMessage.prepend(label);
      }
      label.textContent = source;
    }

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({ messages: assistantHistory }),
        signal: AbortSignal.timeout(50000),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not reach the shopping assistant.');
      }

      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        await readAssistantStream(response, event => {
          if (event.type === 'meta') {
            metadata = event;
            showReplySource(event.provider === 'gemini'
              ? `Powered by ${event.model || 'Gemini'} · replying live`
              : 'Catalog recommendations · Gemini key not configured');
          } else if (event.type === 'delta' && typeof event.text === 'string') {
            pendingMessage.className = 'assistant-message assistant-reply';
            reply += event.text;
            replyContent.className = 'assistant-content';
            replyContent.innerHTML = formatAssistantReply(reply);
            assistantMessages.scrollTop = assistantMessages.scrollHeight;
          } else if (event.type === 'done') {
            metadata = { ...metadata, ...event };
          }
        });
      } else {
        const result = await response.json().catch(() => ({}));
        if (typeof result.reply !== 'string' || !result.reply.trim()) {
          throw new Error('The shopping assistant returned an empty reply. Please try again.');
        }
        reply = result.reply;
        metadata = result;
        pendingMessage.className = 'assistant-message assistant-reply';
        showReplySource(result.provider === 'gemini'
          ? `Powered by ${result.model || 'Gemini'}`
          : 'Catalog recommendations · Gemini key not configured');
        replyContent.className = 'assistant-content';
        replyContent.innerHTML = formatAssistantReply(reply);
      }

      if (!reply.trim()) throw new Error('The assistant returned an empty reply. Please try again.');
      lastFailedMessage = '';
      assistantStatus.textContent = metadata?.provider === 'gemini'
        ? `Connected · ${metadata.model || 'Gemini'}`
        : 'Catalog mode · Gemini key is not configured on the server';
      if (metadata?.provider === 'gemini') showReplySource(`Powered by ${metadata.model || 'Gemini'}`);
      assistantHistory.push({ role: 'assistant', content: reply });
      assistantHistory = assistantHistory.slice(-8);
    } catch (error) {
      pendingMessage.remove();
      lastFailedMessage = message;
      const errorMessage = error.name === 'TimeoutError'
        ? 'The assistant took too long to respond. Please try again.'
        : error instanceof TypeError
          ? 'Unable to connect to the assistant. Check your connection and try again.'
          : error.message;
      assistantStatus.textContent = 'Assistant connection needs attention';
      appendAssistantMessage(errorMessage, 'error', '', { retry: true });
    } finally {
      sendButton.disabled = false;
      assistantInput.disabled = false;
      if (!assistantPanel.hidden) assistantInput.focus();
    }
  }

  assistantForm.addEventListener('submit', event => {
    event.preventDefault();
    const message = assistantInput.value;
    if (!message.trim()) return;
    assistantInput.value = '';
    void sendAssistantMessage(message);
  });

  assistantPrompts.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    assistantInput.value = button.textContent;
    assistantForm.requestSubmit();
  });

  assistantMessages.addEventListener('click', event => {
    if (!event.target.closest('[data-action="assistant-retry"]') || !lastFailedMessage) return;
    void sendAssistantMessage(lastFailedMessage, true);
  });
  async function product(id) {
    loading();
    const p = await api('/products/' + encodeURIComponent(id));
    selectedSize = '';
    setView(`
      <div class="wrap"><div class="product">
        ${tile(p)}
        <div>
          <div class="cat-label">${esc(p.category)}</div>
          <h1>${esc(p.name)}</h1>
          <div class="price">${money(p.price)}</div>
          <p style="color:var(--muted)">${esc(p.description)}</p>
          <label>Select size</label>
          <div class="sizes">${p.sizes.map(s => `<button class="size" data-action="size" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <button class="btn" data-action="add" data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Sold out' : 'Add to cart'}</button>
          <div class="msg" id="pmsg"></div>
          ${p.stock > 0 && p.stock <= 5 ? `<p class="sold" style="margin-top:12px">Only ${p.stock} left</p>` : ''}
        </div>
      </div></div>`);
    $app._product = p;
  }

  function cartTotals() {
    const subtotal = cart.reduce((n, i) => n + i.price * i.qty, 0);
    const shipping = subtotal === 0 || subtotal >= FREE_ABOVE ? 0 : SHIP;
    return { subtotal, shipping, total: subtotal + shipping };
  }
  const summary = () => {
    const t = cartTotals();
    return `
      <div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      <div class="summary-row"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : 'Free'}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(t.total)}</span></div>`;
  };

  function cartView() {
    if (!cart.length) return setView('<div class="wrap empty"><p>Your cart is empty.</p><br><a class="btn" href="#/shop">Start shopping</a></div>');
    setView(`
      <div class="wrap" style="padding-top:36px"><h2 class="title">Your cart</h2>
      <div class="two-col">
        <div>${cart.map((i, idx) => `
          <div class="cart-line">
            <div class="thumb">${tile({ ...i, name: '' }, 'thumb')}</div>
            <div><strong>${esc(i.name)}</strong><br><span style="color:var(--muted)">Size ${esc(i.size)} · ${money(i.price)}</span></div>
            <div class="qty"><button data-action="dec" data-i="${idx}">−</button><span>${i.qty}</span><button data-action="inc" data-i="${idx}">+</button></div>
            <button class="btn small ghost" data-action="remove" data-i="${idx}">Remove</button>
          </div>`).join('')}
        </div>
        <div class="panel">${summary()}<br><a class="btn" style="width:100%;text-align:center" href="#/checkout">Checkout</a></div>
      </div></div>`);
  }

  function checkout() {
    if (!cart.length) return (location.hash = '#/cart');
    setView(`
      <div class="wrap" style="padding-top:36px"><h2 class="title">Checkout</h2>
      <div class="two-col">
        <form class="panel" data-form="checkout">
          <label>Full name</label><input name="name" required value="${esc(user?.name || '')}">
          <div class="row"><div><label>Email</label><input type="email" name="email" required value="${esc(user?.email || '')}"></div>
          <div><label>Phone (10 digits)</label><input name="phone" required pattern="\\d{10}" inputmode="numeric"></div></div>
          <label>Address</label><textarea name="address" rows="3" required></textarea>
          <div class="row"><div><label>City</label><input name="city" required></div>
          <div><label>Pincode</label><input name="pincode" required pattern="\\d{6}" inputmode="numeric"></div></div>
          <label>Payment</label><input value="Cash on Delivery" disabled>
          <br><button class="btn" type="submit">Place order</button>
          <div class="msg" id="fmsg"></div>
        </form>
        <div class="panel"><h3 style="margin-bottom:10px">Order summary</h3>
          ${cart.map(i => `<div class="summary-row"><span>${esc(i.name)} (${esc(i.size)}) × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
          <br>${summary()}
        </div>
      </div></div>`);
  }

  function success(id) {
    setView(`<div class="wrap empty"><h2 class="title ok">Order placed!</h2>
      <p>Thank you. Your order number is <strong>#${esc(id)}</strong>.<br>We'll contact you to confirm delivery.</p><br>
      <a class="btn" href="#/shop">Continue shopping</a></div>`);
  }

  function login(mode = 'login') {
    const reg = mode === 'register';
    setView(`
      <div class="wrap" style="padding-top:50px"><div class="narrow panel">
        <h2 class="title">${reg ? 'Create account' : 'Login'}</h2>
        <form data-form="${mode}">
          ${reg ? '<label>Name</label><input name="name" required>' : ''}
          <label>Email</label><input type="email" name="email" required>
          <label>Password</label><input type="password" name="password" required minlength="${reg ? 8 : 1}">
          <br><button class="btn" type="submit">${reg ? 'Sign up' : 'Login'}</button>
          <div class="msg" id="amsg"></div>
        </form>
        <p style="margin-top:16px;color:var(--muted)">${reg ? 'Have an account? <a href="#/login"><u>Login</u></a>' : 'New here? <a href="#/register"><u>Create an account</u></a>'}</p>
      </div></div>`);
  }

  async function orders() {
    if (!token) return (location.hash = '#/login');
    loading();
    const list = await api('/orders/mine');
    setView(`<div class="wrap" style="padding-top:36px"><h2 class="title">My orders</h2>
      ${list.length ? list.map(o => `
        <div class="panel" style="margin-bottom:14px">
          <div class="summary-row"><strong>Order #${o.id}</strong><span class="status ${esc(o.status)}">${esc(o.status)}</span></div>
          <div style="color:var(--muted);font-size:13px">${esc(o.created_at)} UTC</div>
          ${o.items.map(i => `<div class="summary-row"><span>${esc(i.product_name)} (${esc(i.size)}) × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
          <div class="summary-row total"><span>Total</span><span>${money(o.total)}</span></div>
        </div>`).join('') : '<div class="empty">No orders yet.</div>'}
    </div>`);
  }

  // ---------- router ----------
  async function route() {
    const hash = location.hash.slice(1) || '/';
    const [pathPart, query = ''] = hash.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    try {
      if (!parts.length) await home();
      else if (parts[0] === 'shop') await shop(query);
      else if (parts[0] === 'product') await product(parts[1]);
      else if (parts[0] === 'cart') cartView();
      else if (parts[0] === 'checkout') checkout();
      else if (parts[0] === 'login') login('login');
      else if (parts[0] === 'register') login('register');
      else if (parts[0] === 'orders') await orders();
      else await home();
    } catch (e) { fail(e); }
  }
  window.addEventListener('hashchange', route);

  // ---------- events ----------
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'quick-view') {
      await openQuickView(el.dataset.id);
    } else if (a === 'close-quick-view') {
      quickView.close();
    } else if (a === 'assistant-open') {
      assistantPanel.hidden = false;
      assistantInput.focus();
    } else if (a === 'assistant-close') {
      assistantPanel.hidden = true;
      document.querySelector('[data-action="assistant-open"]').focus();
    } else if (a === 'quick-size') {
      quickViewSize = el.dataset.size;
      quickViewContent.querySelectorAll('[data-action="quick-size"]').forEach(button =>
        button.classList.toggle('on', button === el));
    } else if (a === 'quick-add') {
      if (!quickViewProduct || !quickViewSize) {
        const sizeMessage = document.createElement('p');
        sizeMessage.className = 'quick-view-stock';
        sizeMessage.setAttribute('role', 'status');
        sizeMessage.textContent = 'Please select a size first.';
        quickViewContent.querySelector('.quick-view-info').append(sizeMessage);
        return;
      }
      const found = cart.find(i => i.id === quickViewProduct.id && i.size === quickViewSize);
      if (found) found.qty = Math.min(10, found.qty + 1);
      else cart.push({
        id: quickViewProduct.id,
        name: quickViewProduct.name,
        price: quickViewProduct.price,
        size: quickViewSize,
        qty: 1,
        color: quickViewProduct.color,
        image: quickViewProduct.image,
      });
      saveCart();
      quickView.close();
      location.hash = '#/cart';
    } else if (a === 'size') {
      selectedSize = el.dataset.size;
      document.querySelectorAll('.size').forEach(b => b.classList.toggle('on', b === el));
    } else if (a === 'add') {
      const p = $app._product;
      if (!selectedSize) { document.getElementById('pmsg').textContent = 'Please select a size'; return; }
      const found = cart.find(i => i.id === p.id && i.size === selectedSize);
      if (found) found.qty = Math.min(10, found.qty + 1);
      else cart.push({ id: p.id, name: p.name, price: p.price, size: selectedSize, qty: 1, color: p.color, image: p.image });
      saveCart();
      location.hash = '#/cart';
    } else if (a === 'inc' || a === 'dec' || a === 'remove') {
      const i = Number(el.dataset.i);
      if (a === 'remove') cart.splice(i, 1);
      else cart[i].qty = Math.max(1, Math.min(10, cart[i].qty + (a === 'inc' ? 1 : -1)));
      saveCart(); cartView();
    } else if (a === 'cat') {
      const q = new URLSearchParams(location.hash.split('?')[1] || '');
      el.dataset.cat ? q.set('category', el.dataset.cat) : q.delete('category');
      location.hash = '#/shop?' + q.toString();
    } else if (a === 'logout') {
      setAuth(null, null); location.hash = '#/';
    }
  });

  let t;
  document.addEventListener('input', e => {
    if (e.target.id !== 'search') return;
    clearTimeout(t);
    t = setTimeout(() => {
      const q = new URLSearchParams(location.hash.split('?')[1] || '');
      e.target.value ? q.set('q', e.target.value) : q.delete('q');
      location.hash = '#/shop?' + q.toString();
    }, 400);
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'sort') return;
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    e.target.value ? q.set('sort', e.target.value) : q.delete('sort');
    location.hash = '#/shop?' + q.toString();
  });

  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const type = form.dataset.form;
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (type === 'login' || type === 'register') {
        const r = await api('/auth/' + type, { method: 'POST', body: data });
        setAuth(r.token, r.user);
        location.hash = '#/';
      } else if (type === 'checkout') {
        const r = await api('/orders', { method: 'POST', body: { customer: data, items: cart.map(i => ({ productId: i.id, size: i.size, qty: i.qty })) } });
        cart = []; saveCart(); success(r.orderId);
      }
    } catch (err) {
      const box = form.querySelector('.msg');
      if (box) box.textContent = err.message;
      btn.disabled = false;
    }
  });

  renderNav();
  route();
})();
