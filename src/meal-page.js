// Day menu pages. Hot Lunch: favourites (heart), hide toggle (greyscale), sorting.
// Hot Lunch + Little Break: auto-advance to the next day after a Hot Lunch pick.
(() => {
  const { SEL } = NG;
  const ctx = NG.parseCartPath(location.pathname);
  if (!ctx) return;

  // ---- Auto-advance ----
  // After a Hot Lunch pick, go to the next day's Hot Lunch (or the dashboard after the last day)
  // instead of the site's Little Break step. Two triggers:
  //  1. page-hook.js intercepts the site's AJAX success and fires 'ng:picked' (no page load).
  //  2. Fallback: we record the pick on click; if Little Break (or the same day, now selected)
  //     loads shortly after, we redirect onward from there.

  const PENDING_KEY = 'ng-pending-pick';
  const PENDING_MAX_AGE_MS = 30_000;

  function showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'ng-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    document.body.append(toast);
  }

  function readPending() {
    try {
      const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
      if (p && Date.now() - p.at < PENDING_MAX_AGE_MS) return p;
    } catch {}
    return null;
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  }

  async function nextUrl() {
    const days = await NG.store.getDayOrder(ctx.studentId);
    if (days?.length) {
      const i = days.indexOf(ctx.dayOfWeekId);
      if (i === -1 || i === days.length - 1) return NG.dashboardUrl(ctx.studentId);
      return NG.cartUrl(ctx.studentId, NG.CART_HOT_LUNCH, days[i + 1]);
    }
    // No cached order yet: fall back to the heading's next-day arrow (the last day link there).
    const heading = NG.getRequired(SEL.studentHeading);
    const links = heading ? [...heading.querySelectorAll(SEL.dayLink)] : [];
    const next = NG.parseCartPath(links.at(-1)?.getAttribute('href'));
    if (next && next.dayOfWeekId !== ctx.dayOfWeekId) {
      return NG.cartUrl(ctx.studentId, NG.CART_HOT_LUNCH, next.dayOfWeekId);
    }
    return NG.dashboardUrl(ctx.studentId);
  }

  let advancing = false;
  async function advance() {
    if (advancing) return;
    advancing = true;
    clearPending();
    const url = await nextUrl();
    showToast(url.startsWith('/dashboard') ? 'Saved ✓ Back to dashboard…' : 'Saved ✓ Next day…');
    setTimeout(() => location.assign(url), 600);
  }

  const pending = readPending();
  const pendingHere =
    pending && pending.studentId === ctx.studentId && pending.dayOfWeekId === ctx.dayOfWeekId;

  if (ctx.cartTypeId !== NG.CART_HOT_LUNCH) {
    // Landed on Little Break right after picking a Hot Lunch for this day: skip it.
    if (pendingHere) advance();
    return;
  }

  // The site may reload the same Hot Lunch page after a pick: advance if our pick is now selected.
  if (pendingHere && document.querySelector(`${SEL.selectedItem}[data-productid="${pending.productId}"]`)) {
    advance();
    return;
  }

  // Record picks so the fallback above can recognise the follow-up page.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.(SEL.chooseButton);
    if (!btn) return;
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        studentId: ctx.studentId,
        dayOfWeekId: ctx.dayOfWeekId,
        productId: btn.dataset.productid,
        at: Date.now(),
      }));
    } catch {}
  }, true);

  window.addEventListener('ng:picked', advance);

  // ---- Favourites / hidden (Hot Lunch only from here on) ----

  const grid = NG.getRequired(SEL.itemGrid);
  if (!grid) return;

  NG.hideZeroPrices(grid);

  const boxes = [...grid.querySelectorAll(`:scope > ${SEL.itemBox}`)];
  boxes.forEach((box, i) => { box.dataset.ngIndex = String(i); });

  const HEART_PATH =
    'M12 20.5 10.6 19.2C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6L12 20.5z';
  const heartSvg = (filled) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${HEART_PATH}" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"/></svg>`;
  const EYE_OPEN =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7C21.3 9.1 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>';
  const EYE_SHUT =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2.3 3.7 3.7 2.3l18 18-1.4 1.4-3.2-3.2A11 11 0 0 1 12 19C6.5 19 2.7 14.9 1.5 12a13 13 0 0 1 4-5.1L2.3 3.7zM12 5c5.5 0 9.3 4.1 10.5 7a12.8 12.8 0 0 1-2.9 4.1l-3.2-3.2A4.5 4.5 0 0 0 11.1 7.6L8.8 5.4A11 11 0 0 1 12 5zm-4.3 5.1a4.5 4.5 0 0 0 6.2 6.2l-1.9-1.9a2 2 0 0 1-2.4-2.4L7.7 10.1z"/></svg>';

  function infoFor(box) {
    const item = box.querySelector(SEL.productItem);
    if (!item) return null;
    const title = item.querySelector(SEL.productTitle)?.textContent.trim() || '';
    return { item, productId: item.dataset.productid, title };
  }

  function makeButton(cls, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ng-btn ${cls}`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // Inject controls once per meal.
  for (const box of boxes) {
    const info = infoFor(box);
    if (!info) {
      console.error('[Nourish+Green helper] item-box without product-item', box);
      continue;
    }
    const picture = info.item.querySelector(SEL.productPicture);
    if (!picture) {
      console.error(`[Nourish+Green helper] Expected element not found: ${SEL.productPicture}`, info.item);
      continue;
    }
    const bar = document.createElement('div');
    bar.className = 'ng-controls';
    bar.append(
      makeButton('ng-heart', () => NG.store.toggle(ctx.studentId, 'favourites', info.productId, info.title)),
      makeButton('ng-eye', () => NG.store.toggle(ctx.studentId, 'hidden', info.productId, info.title)),
    );
    picture.classList.add('ng-picture');
    picture.append(bar);
  }

  async function render() {
    const { favourites, hidden } = await NG.store.getStudentPrefs(ctx.studentId);
    const rank = (box) => {
      if (box.querySelector(SEL.selectedItem)) return -1; // current selection always first
      const id = infoFor(box)?.productId;
      if (id in favourites) return 0;
      if (id in hidden) return 2;
      return 1;
    };

    for (const box of boxes) {
      const info = infoFor(box);
      if (!info) continue;
      const fav = info.productId in favourites;
      const hid = info.productId in hidden;
      box.classList.toggle('ng-favourite', fav);
      box.classList.toggle('ng-hidden-meal', hid);

      const heart = box.querySelector('.ng-heart');
      if (heart) {
        heart.innerHTML = heartSvg(fav);
        heart.setAttribute('aria-pressed', String(fav));
        heart.title = fav ? 'Remove from favourites' : 'Add to favourites';
      }
      const eye = box.querySelector('.ng-eye');
      if (eye) {
        eye.innerHTML = hid ? EYE_SHUT : EYE_OPEN;
        eye.setAttribute('aria-pressed', String(hid));
        eye.title = hid ? 'Show this meal' : 'Hide this meal';
      }
    }

    const sorted = [...boxes].sort(
      (a, b) => rank(a) - rank(b) || Number(a.dataset.ngIndex) - Number(b.dataset.ngIndex),
    );
    sorted.forEach((box) => grid.append(box));
  }

  render();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.prefs) render();
  });
})();
