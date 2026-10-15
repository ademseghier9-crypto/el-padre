/* El Padré — لوحة التحكم: عرض الطلبات وتعديل الأسعار والتوفر. تعمل فقط مع الخادم. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c);
    return n;
  };
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' دج';
  const STATUS = { new: 'جديد', preparing: 'قيد التحضير', done: 'تم التسليم', cancelled: 'ملغى' };

  let key = '';
  let timer = null;
  let menu = null;
  try { key = sessionStorage.getItem('ep_admin') || ''; } catch { /* تجاهل */ }

  async function call(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: { 'X-Admin-Key': key, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'حدث خطأ.'), { status: r.status });
    return data;
  }

  /* ---------- الدخول ---------- */
  async function enter() {
    await call('api/admin/ping');
    try { sessionStorage.setItem('ep_admin', key); } catch { /* تجاهل */ }
    $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
    await Promise.all([loadOrders(), loadMenu()]);
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) loadOrders(); }, 20000);
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    key = $('#key').value;
    const err = $('#login-error');
    err.hidden = true;
    try { await enter(); }
    catch (x) {
      err.textContent = x.status === 401 ? 'كلمة السر غير صحيحة.' : 'لا يوجد خادم يعمل. لوحة التحكم تحتاج تشغيل الـ backend.';
      err.hidden = false;
    }
  });

  $('#logout').addEventListener('click', () => {
    try { sessionStorage.removeItem('ep_admin'); } catch { /* تجاهل */ }
    location.reload();
  });

  /* ---------- التبويبات ---------- */
  function tab(which) {
    const orders = which === 'orders';
    $('#t-orders').setAttribute('aria-selected', String(orders));
    $('#t-menu').setAttribute('aria-selected', String(!orders));
    $('#p-orders').hidden = !orders;
    $('#p-menu').hidden = orders;
  }
  $('#t-orders').addEventListener('click', () => tab('orders'));
  $('#t-menu').addEventListener('click', () => tab('menu'));

  /* ---------- الطلبات ---------- */
  async function loadOrders() {
    const status = $('#orders-status');
    try {
      const { orders } = await call('api/admin/orders');
      $('#new-count').textContent = String(orders.filter((o) => o.status === 'new').length);
      status.textContent = orders.length ? '' : 'لا توجد طلبات بعد.';
      $('#orders').replaceChildren(...orders.map(orderCard));
    } catch (x) {
      if (x.status === 401) return location.reload();
      status.textContent = 'تعذّر تحميل الطلبات.';
    }
  }

  function orderCard(o) {
    const when = new Date(o.createdAt).toLocaleString('ar-DZ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' });
    const select = el('select', { 'aria-label': 'حالة الطلب ' + o.id, onchange: async (e) => {
      try { await call('api/admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }); loadOrders(); }
      catch (x) { alert(x.message); loadOrders(); }
    } }, ...Object.entries(STATUS).map(([v, t]) => el('option', { value: v, selected: v === o.status, text: t })));

    return el('li', { class: 'order' + (o.status === 'new' ? ' is-new' : '') },
      el('div', { class: 'order-top' },
        el('span', { class: 'order-id', text: o.id }),
        el('span', { class: 'order-time', text: when })),
      el('p', { class: 'order-who' },
        `${o.name} — `, el('a', { href: 'tel:' + o.phone, dir: 'ltr', text: o.phone }),
        ` — ${o.type === 'delivery' ? 'توصيل' : 'استلام من المحل'}`),
      o.address ? el('p', { class: 'order-note', text: 'العنوان: ' + o.address }) : null,
      el('ul', { class: 'order-lines' }, ...o.items.map((i) => el('li', {},
        el('span', { dir: 'auto', text: `${i.qty} × ${i.name}` }), el('span', { text: money(i.subtotal) })))),
      o.note ? el('p', { class: 'order-note', text: 'ملاحظة: ' + o.note }) : null,
      el('div', { class: 'order-foot' }, el('span', { class: 'order-total', text: 'المجموع: ' + money(o.total) }), select));
  }

  /* ---------- القائمة ---------- */
  async function loadMenu() {
    menu = await call('api/menu');
    render();
  }

  function render() {
    $('#menu-edit').replaceChildren(...menu.categories.map((c) => el('div', { class: 'm-cat' },
      el('h3', { text: `${c.emoji} ${c.name}` }),
      ...c.items.map((it) => {
        const price = el('input', { type: 'number', min: 0, max: 100000, step: 1, value: it.price, 'aria-label': 'سعر ' + it.name, 'data-id': it.id, 'data-orig': it.price });
        const avail = el('input', { type: 'checkbox', checked: it.available, 'data-id': it.id, 'data-orig': String(it.available) });
        const row = el('div', { class: 'm-row' },
          el('span', { dir: 'auto', text: it.name }), price, el('label', {}, avail, 'متوفر'));
        row.addEventListener('input', () => row.classList.toggle('changed',
          price.value !== price.dataset.orig || String(avail.checked) !== avail.dataset.orig));
        return row;
      }))));
  }

  $('#save-menu').addEventListener('click', async () => {
    const err = $('#menu-error'), msg = $('#menu-msg');
    err.hidden = true; msg.textContent = '';
    const updates = [];
    for (const row of document.querySelectorAll('.m-row.changed')) {
      const [price, avail] = row.querySelectorAll('input');
      const p = Number(price.value);
      if (!Number.isInteger(p) || p < 0) { err.textContent = 'السعر يجب أن يكون رقماً صحيحاً.'; err.hidden = false; return; }
      updates.push({ id: price.dataset.id, price: p, available: avail.checked });
    }
    if (!updates.length) { msg.textContent = 'لا توجد تغييرات.'; return; }
    try {
      menu = await call('api/admin/menu', { method: 'PATCH', body: JSON.stringify({ updates }) });
      render();
      msg.textContent = 'تم الحفظ. التغييرات ظاهرة الآن في الموقع.';
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });

  if (key) enter().catch(() => { try { sessionStorage.removeItem('ep_admin'); } catch { /* تجاهل */ } });
})();
