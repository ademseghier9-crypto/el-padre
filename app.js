/* El Padré — منطق الواجهة
   - يحمّل القائمة من الخادم (api/menu)، وإن لم يوجد خادم يقرأ menu.json (استضافة ثابتة مثل GitHub Pages).
   - مع الخادم: سلة طلب + إرسال الطلب. بدونه: عرض القائمة وزر اتصال. */
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
  const digits = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const normPhone = (p) => digits(p).replace(/[\s.\-()]/g, '').replace(/^(\+213|00213)/, '0');
  const PHONE_RE = /^0(5|6|7)\d{8}$|^0[2-4]\d{7}$/;

  const state = { menu: null, api: false, cat: null, cart: {}, index: new Map() };

  /* ---------- التخزين المحلي للسلة ---------- */
  const store = {
    load() { try { return JSON.parse(localStorage.getItem('ep_cart') || '{}'); } catch { return {}; } },
    save() { try { localStorage.setItem('ep_cart', JSON.stringify(state.cart)); } catch { /* تجاهل */ } },
  };

  /* ---------- الشبكة ---------- */
  async function getJSON(url, ms = 5000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function loadMenu() {
    const status = $('#menu-status');
    try {
      state.menu = await getJSON('api/menu');
      state.api = true;
    } catch {
      try { state.menu = await getJSON('menu.json'); state.api = false; }
      catch {
        status.textContent = 'تعذّر تحميل القائمة. حدّث الصفحة أو اتصل بنا على 0782 914 617.';
        status.classList.add('bad');
        $('#callbar').hidden = false;
        return;
      }
    }
    status.hidden = true;
    for (const c of state.menu.categories) for (const i of c.items) state.index.set(i.id, i);

    state.cart = state.api ? store.load() : {};
    for (const id of Object.keys(state.cart)) {          // تنظيف أي أصناف لم تعد متاحة
      const it = state.index.get(id);
      if (!it || !it.available || !(state.cart[id] > 0)) delete state.cart[id];
    }
    state.cat = state.menu.categories[0].id;
    renderTabs();
    renderItems();
    renderBar();
  }

  /* ---------- الأقسام والأصناف ---------- */
  function renderTabs() {
    const box = $('#tabs');
    box.replaceChildren(...state.menu.categories.map((c) => el('button', {
      class: 'tab', type: 'button', role: 'tab', id: 'tab-' + c.id,
      'aria-selected': String(c.id === state.cat), 'aria-controls': 'items',
      text: `${c.emoji} ${c.name}`,
      onclick: () => { state.cat = c.id; renderTabs(); renderItems(); },
    })));
  }

  function renderItems() {
    const cat = state.menu.categories.find((c) => c.id === state.cat);
    const note = $('#note');
    if (cat.chips) {
      note.replaceChildren(el('b', { text: cat.note + ' ' }), cat.chips.join(' - '));
      note.hidden = false;
    } else { note.hidden = true; }

    $('#items').setAttribute('aria-labelledby', 'tab-' + cat.id);
    $('#items').replaceChildren(...cat.items.map((it) => {
      const thumb = it.image
        ? el('img', { class: 'th' + (it.imageKind === 'contain' ? ' contain' : ''), src: it.image, alt: '', loading: 'lazy', width: 84, height: 72 })
        : el('div', { class: 'th ph', 'aria-hidden': 'true', text: cat.emoji });
      return el('li', { class: 'item', 'data-id': it.id },
        thumb,
        el('div', { class: 'info-col' },
          el('div', { class: 'top' },
            el('h3', { class: 'name', dir: 'auto', text: it.name }),
            el('span', { class: 'leader', 'aria-hidden': 'true' }),
            el('span', { class: 'price', text: money(it.price) })),
          it.desc ? el('p', { class: 'desc', text: it.desc }) : null),
        controls(it));
    }));
  }

  function stepper(it, q) {
    return el('div', { class: 'step' },
      el('button', { type: 'button', 'aria-label': 'إنقاص ' + it.name, text: '−', onclick: () => change(it.id, -1) }),
      el('output', { 'aria-label': 'الكمية', text: String(q) }),
      el('button', { type: 'button', 'aria-label': 'زيادة ' + it.name, text: '+', onclick: () => change(it.id, 1) }));
  }

  function controls(it) {
    const box = el('div', { class: 'ctl' });
    if (!state.api) return box;
    if (!it.available) { box.append(el('span', { class: 'soldout', text: 'غير متوفر حالياً' })); return box; }
    const q = state.cart[it.id] || 0;
    box.append(q
      ? stepper(it, q)
      : el('button', { class: 'add', type: 'button', 'aria-label': 'أضف ' + it.name + ' إلى الطلب', text: 'أضف', onclick: () => change(it.id, 1) }));
    return box;
  }

  function change(id, d) {
    const q = Math.max(0, Math.min(20, (state.cart[id] || 0) + d));
    if (q) state.cart[id] = q; else delete state.cart[id];
    store.save();
    const li = $(`.item[data-id="${CSS.escape(id)}"]`);
    if (li) li.querySelector('.ctl').replaceWith(controls(state.index.get(id)));
    renderBar();
    if ($('#checkout').open) {
      if (cartEntries().length === 0) $('#checkout').close(); else renderLines();
    }
  }

  /* ---------- شريط الطلب ---------- */
  const cartEntries = () => Object.entries(state.cart).map(([id, qty]) => ({ it: state.index.get(id), qty })).filter((x) => x.it);
  const cartTotal = () => cartEntries().reduce((s, x) => s + x.it.price * x.qty, 0);

  function renderBar() {
    const bar = $('#cartbar');
    if (!state.api) { bar.hidden = true; $('#callbar').hidden = false; return; }
    const count = cartEntries().reduce((s, x) => s + x.qty, 0);
    bar.hidden = count === 0;
    $('#cart-count').textContent = String(count);
    $('#cart-total').textContent = money(cartTotal());
  }

  /* ---------- نافذة تأكيد الطلب ---------- */
  const dlg = $('#checkout');
  const form = $('#order-form');

  function renderLines() {
    $('#lines').replaceChildren(...cartEntries().map(({ it, qty }) => el('li', { class: 'line' },
      el('span', { class: 'ln', dir: 'auto', text: it.name }),
      stepper(it, qty),
      el('span', { class: 'sub', text: money(it.price * qty) }))));
    $('#sum').textContent = money(cartTotal());
  }

  function showError(msg) {
    const e = $('#form-error');
    e.textContent = msg;
    e.hidden = !msg;
  }

  function syncType() {
    const delivery = form.type.value === 'delivery';
    $('#address-field').hidden = !delivery;
  }

  $('#cartbar').addEventListener('click', () => { showError(''); renderLines(); syncType(); dlg.showModal(); });
  $('#close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  form.addEventListener('change', syncType);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const type = form.type.value;
    const name = form.name.value.trim();
    const phone = normPhone(form.phone.value);
    const address = form.address.value.trim();
    if (name.length < 2) return showError('اكتب اسمك (حرفان على الأقل).');
    if (!PHONE_RE.test(phone)) return showError('رقم الهاتف غير صحيح. مثال: 0782914617');
    if (type === 'delivery' && address.length < 5) return showError('اكتب عنوان التوصيل بالتفصيل.');

    const btn = $('#send');
    btn.disabled = true; btn.textContent = 'جارٍ الإرسال…';
    try {
      const r = await fetch('api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, name, phone, address, note: form.note.value.trim(),
          items: cartEntries().map((x) => ({ id: x.it.id, qty: x.qty })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(data.error || 'تعذّر إرسال الطلب.'), { known: true });
      state.cart = {}; store.save(); renderBar(); renderItems();
      success(data);
    } catch (err) {
      showError(err.known ? err.message : 'تعذّر إرسال الطلب. تحقق من الاتصال أو اتصل بنا على 0782 914 617.');
    } finally {
      btn.disabled = false; btn.textContent = 'أرسل الطلب';
    }
  });

  function success(data) {
    $('#sheet').replaceChildren(el('div', { class: 'done', role: 'status' },
      el('div', { class: 'ok', 'aria-hidden': 'true', text: '✅' }),
      el('h2', { text: 'تم استلام طلبك' }),
      el('p', { class: 'no', text: data.id }),
      el('p', { text: `المجموع ${money(data.total)}. سنتصل بك قريباً لتأكيد الطلب.` }),
      el('button', { class: 'btn cta wide', type: 'button', text: 'تم', onclick: () => location.reload() })));
  }

  loadMenu();
})();
