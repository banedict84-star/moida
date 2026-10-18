export function normalizeSidebarOrder(value, defaults) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = []; } }
  const known = new Set(defaults);
  return [...new Set([...(Array.isArray(value) ? value : []), ...defaults].filter(key => known.has(key)))];
}

export function setupSidebarOrder({root, user, load, save, subscribe}) {
  const nav = root?.querySelector('nav');
  const section = nav?.querySelector('.sb-agent-section');
  if (!section || root.dataset.sortReady) return;
  root.dataset.sortReady = 'true';
  const doc = root.ownerDocument, win = doc.defaultView;
  const items = [...nav.querySelectorAll('.nav-item[data-page]')];
  const defaults = items.map(item => item.dataset.page);
  const list = doc.createElement('div');
  list.className = 'sidebar-sort-list';
  section.append(list);
  // Move existing nodes, preserving their page navigation and access-control listeners.
  items.forEach(item => {
    list.append(item);
    item.tabIndex = 0;
    if (item.tagName !== 'BUTTON') item.setAttribute('role', 'button');
    item.setAttribute('aria-describedby', 'sidebarSortHelp');
    item.title = `${item.dataset.label || item.textContent.trim()} · 길게 눌러 이동 (Alt+↑↓)`;
    const grip = doc.createElement('span');
    grip.className = 'sidebar-sort-grip'; grip.textContent = '⠿';
    grip.setAttribute('aria-hidden', 'true'); item.append(grip);
  });
  const system = nav.querySelector('.sb-system');
  if (system && !system.querySelector('.nav-item')) system.hidden = true;
  const hint = doc.createElement('div');
  hint.className = 'sidebar-sort-hint'; hint.id = 'sidebarSortHelp';
  hint.textContent = '길게 눌러 순서 변경 · Alt+↑↓'; section.append(hint);
  const status = doc.createElement('div');
  status.className = 'sidebar-sort-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); section.append(status);
  let owner = null, ready = false, gesture = null, suppressUntil = 0;
  let sequence = 0, writeSequence = 0, writes = Promise.resolve(), statusTimer;
  const order = () => [...list.children].map(item => item.dataset.page);
  const apply = keys => normalizeSidebarOrder(keys, defaults).forEach(key => list.append(items.find(item => item.dataset.page === key)));
  const visible = () => [...list.children].filter(item => !item.hidden && win.getComputedStyle(item).display !== 'none');
  function announce(text) {
    win.clearTimeout(statusTimer); status.textContent = text;
    statusTimer = win.setTimeout(() => { status.textContent = ''; }, 5000);
  }
  function persist() {
    const uid = owner, keys = order(), ticket = ++writeSequence;
    announce('메뉴 순서 저장 중…');
    // Serialize writes so that a slow earlier request cannot replace the newest order.
    writes = writes.catch(() => {}).then(async () => {
      if (!uid || user() !== uid) return;
      await save(uid, keys);
      if (owner === uid && ticket === writeSequence) announce('메뉴 순서를 저장했습니다.');
    }).catch(() => {
      if (owner === uid && ticket === writeSequence) announce('순서를 저장하지 못했습니다. 다시 이동해 주세요.');
    });
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const current = gesture; gesture = null;
    win.clearTimeout(current.timer); win.cancelAnimationFrame(current.frame);
    if (!current.active) return;
    suppressUntil = Date.now() + 500;
    current.item.classList.remove('sidebar-sort-dragging');
    current.item.setAttribute('aria-pressed', 'false'); root.classList.remove('sidebar-sorting');
    if (cancel || owner !== current.owner || user() !== current.owner) { apply(current.before); return; }
    if (JSON.stringify(order()) !== JSON.stringify(current.before)) persist();
    else announce('메뉴 이동을 마쳤습니다.');
  }
  function place(x, y) {
    const hit = doc.elementFromPoint(x, y)?.closest('.nav-item[data-page]');
    if (!hit || hit === gesture.item || !list.contains(hit)) return;
    const box = hit.getBoundingClientRect();
    list.insertBefore(gesture.item, y < box.top + box.height / 2 ? hit : hit.nextSibling);
  }
  function scrollFrame() {
    if (!gesture?.active) return;
    const box = nav.getBoundingClientRect(), y = gesture.y;
    const step = y < box.top + 35 ? -7 : y > box.bottom - 35 ? 7 : 0;
    if (step) { nav.scrollTop += step; place(gesture.x, gesture.y); }
    gesture.frame = win.requestAnimationFrame(scrollFrame);
  }
  function start(item, x, y, pointerId, immediate = false) {
    if (!ready || !owner || user() !== owner) return;
    finish(true);
    const current = {item, x, y, startX:x, startY:y, pointerId, owner, before:order(), active:false};
    gesture = current;
    function activate() {
      if (gesture !== current || user() !== current.owner) return;
      current.active = true;
      if (pointerId !== undefined) { try { item.setPointerCapture(pointerId); } catch {} }
      item.classList.add('sidebar-sort-dragging'); item.setAttribute('aria-pressed', 'true');
      root.classList.add('sidebar-sorting');
      announce('위아래로 옮긴 뒤 놓으세요. 취소하려면 Escape를 누르세요.'); scrollFrame();
    }
    if (immediate) activate(); else current.timer = win.setTimeout(activate, 420);
  }
  function move(x, y, event) {
    if (!gesture) return;
    if (user() !== gesture.owner) { finish(true); return; }
    if (!gesture.active) {
      // Before the long press, movement is normal touch scrolling or a cancelled click.
      if (Math.hypot(x - gesture.startX, y - gesture.startY) > 9) finish(true);
      return;
    }
    if (event.cancelable) event.preventDefault();
    gesture.x = x; gesture.y = y; place(x, y);
  }
  list.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    const item = event.target.closest('.nav-item');
    if (item) start(item, event.clientX, event.clientY, event.pointerId, Boolean(event.target.closest('.sidebar-sort-grip')));
  });
  doc.addEventListener('pointermove', event => {
    if (gesture && gesture.pointerId === event.pointerId) move(event.clientX, event.clientY, event);
  }, {passive:false});
  doc.addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) finish(); });
  doc.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(true); });
  list.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { finish(true); return; }
    const touch = event.touches[0], item = event.target.closest('.nav-item');
    if (item) start(item, touch.clientX, touch.clientY);
  }, {passive:true});
  doc.addEventListener('touchmove', event => {
    if (!gesture || gesture.pointerId !== undefined) return;
    if (event.touches.length !== 1) { finish(true); return; }
    move(event.touches[0].clientX, event.touches[0].clientY, event);
  }, {passive:false});
  doc.addEventListener('touchend', () => { if (gesture?.pointerId === undefined) finish(); });
  doc.addEventListener('touchcancel', () => { if (gesture?.pointerId === undefined) finish(true); });
  root.addEventListener('click', event => {
    if (event.target.closest('.nav-item') && (gesture?.active || Date.now() < suppressUntil)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener('contextmenu', event => { if (gesture && event.target.closest('.nav-item')) event.preventDefault(); });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape') { finish(true); return; }
    const item = event.target.closest?.('.nav-item');
    if (!item || !list.contains(item)) return;
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); if (!ready || !owner || user() !== owner) return;
      finish(true);
      const shown = visible(), index = shown.indexOf(item), target = shown[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      list.insertBefore(item, event.key === 'ArrowUp' ? target : target.nextSibling);
      item.focus(); persist();
    } else if (!event.altKey && ['Enter', ' '].includes(event.key) && item.tagName !== 'BUTTON') {
      event.preventDefault(); item.click();
    }
  });
  win.addEventListener('blur', () => finish(true));
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) finish(true); });
  async function syncUser() {
    const uid = user(); if (uid === owner) return;
    const ticket = ++sequence; finish(true); owner = uid; ready = false; apply(defaults);
    if (!uid) return;
    try {
      const saved = await load(uid);
      if (ticket !== sequence || user() !== uid) return;
      apply(saved); ready = true;
    } catch {
      if (ticket !== sequence || user() !== uid) return;
      ready = true; announce('메뉴 순서를 불러오지 못했습니다. 이동하면 다시 저장합니다.');
    }
  }
  subscribe(syncUser); syncUser();
  return {syncUser, getOrder:order, cancel:() => finish(true)};
}
