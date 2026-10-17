(() => {
  const root = document.getElementById('root');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₹' + Number(n).toLocaleString('en-IN');
  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  let token = localStorage.getItem('menx_token') || '';
  let editing = null;

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

  function loginView(msg = '') {
    root.innerHTML = `<div class="narrow panel"><h2 class="title">Admin login</h2>
      <form data-form="login"><label>Email</label><input type="email" name="email" required>
      <label>Password</label><input type="password" name="password" required><br>
      <button class="btn" type="submit">Login</button><div class="msg">${esc(msg)}</div></form></div>`;
  }

  async function dashboard() {
    let products, orders;
    try {
      [products, orders] = await Promise.all([api('/products'), api('/orders')]);
    } catch (e) {
      return loginView(token ? 'Admin access required: ' + e.message : '');
    }
    const p = editing ? products.find(x => x.id === editing) : null;
    const v = k => esc(p ? (k === 'sizes' ? p.sizes.join(',') : p[k]) : '');
    root.innerHTML = `
      <h2 class="title">Orders (${orders.length})</h2>
      <div class="panel" style="overflow-x:auto"><table>
        <tr><th>#</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
        ${orders.map(o => `<tr>
          <td>${o.id}<br><small style="color:var(--muted)">${esc(o.created_at)}</small></td>
          <td>${esc(o.customer_name)}<br><small>${esc(o.phone)} · ${esc(o.email)}</small><br><small>${esc(o.address)}, ${esc(o.city)} ${esc(o.pincode)}</small></td>
          <td>${o.items.map(i => `${esc(i.product_name)} (${esc(i.size)}) × ${i.qty}`).join('<br>')}</td>
          <td>${money(o.total)}</td>
          <td><select data-order="${o.id}">${STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        </tr>`).join('') || '<tr><td colspan="5">No orders yet</td></tr>'}
      </table></div>

      <h2 class="title" style="margin-top:40px">${p ? 'Edit product #' + p.id : 'Add product'}</h2>
      <form class="panel" data-form="product">
        <div class="row"><div><label>Name</label><input name="name" required value="${v('name')}"></div>
        <div><label>Category</label><input name="category" required value="${v('category')}"></div></div>
        <label>Description</label><textarea name="description" rows="2">${v('description')}</textarea>
        <div class="row"><div><label>Price (₹)</label><input type="number" name="price" min="0" required value="${v('price')}"></div>
        <div><label>Stock</label><input type="number" name="stock" min="0" required value="${v('stock')}"></div></div>
        <div class="row"><div><label>Sizes (comma separated)</label><input name="sizes" value="${p ? v('sizes') : 'S,M,L,XL'}"></div>
        <div><label>Tile colour (hex)</label><input name="color" value="${p ? v('color') : '#222222'}"></div></div>
        <label>Image URL or /path (optional)</label><input name="image" value="${v('image')}">
        <label><input type="checkbox" name="featured" style="width:auto" ${p && p.featured ? 'checked' : ''}> Featured on home page</label>
        <br><button class="btn" type="submit">${p ? 'Save changes' : 'Add product'}</button>
        ${p ? '<button class="btn ghost" type="button" data-act="cancel" style="margin-left:8px">Cancel</button>' : ''}
        <div class="msg" id="pm"></div>
      </form>

      <h2 class="title" style="margin-top:40px">Products (${products.length})</h2>
      <div class="panel" style="overflow-x:auto"><table>
        <tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr>
        ${products.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.category)}</td><td>${money(x.price)}</td><td>${x.stock}</td>
          <td><button class="btn small ghost" data-act="edit" data-id="${x.id}">Edit</button>
          <button class="btn small danger" data-act="del" data-id="${x.id}">Delete</button></td></tr>`).join('')}
      </table></div>`;
  }

  document.addEventListener('click', async e => {
    if (e.target.id === 'logout') { localStorage.removeItem('menx_token'); localStorage.removeItem('menx_user'); token = ''; return loginView(); }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id);
    if (el.dataset.act === 'edit') { editing = id; await dashboard(); window.scrollTo(0, document.body.scrollHeight / 3); }
    if (el.dataset.act === 'cancel') { editing = null; await dashboard(); }
    if (el.dataset.act === 'del' && confirm('Delete this product?')) {
      try { await api('/products/' + id, { method: 'DELETE' }); await dashboard(); } catch (err) { alert(err.message); }
    }
  });

  document.addEventListener('change', async e => {
    const id = e.target.dataset.order;
    if (!id) return;
    try { await api(`/orders/${id}/status`, { method: 'PATCH', body: { status: e.target.value } }); }
    catch (err) { alert(err.message); }
  });

  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    try {
      if (form.dataset.form === 'login') {
        const r = await api('/auth/login', { method: 'POST', body: fd });
        token = r.token;
        localStorage.setItem('menx_token', r.token);
        localStorage.setItem('menx_user', JSON.stringify(r.user));
      } else {
        fd.featured = form.querySelector('[name=featured]').checked;
        if (editing) await api('/products/' + editing, { method: 'PUT', body: fd });
        else await api('/products', { method: 'POST', body: fd });
        editing = null;
      }
      await dashboard();
    } catch (err) {
      const box = form.querySelector('.msg');
      if (box) box.textContent = err.message;
    }
  });

  token ? dashboard() : loginView();
})();
