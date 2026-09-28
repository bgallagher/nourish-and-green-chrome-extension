// Dashboard takeover: week cards for each school day, and a side drawer to choose that
// day's Hot Lunch without leaving the page. Choosing moves on to the next empty day.
(() => {
  const { SEL } = NG;
  const LOG = '[Nourish+Green helper]';

  const swiper = NG.getRequired(SEL.swiper);
  if (!swiper) return;

  const days = NG.portal.parseDashboardDays(document);
  const studentId = days.find((d) => d.link)?.link.studentId;
  if (!days.length || !studentId) {
    console.error(`${LOG} Couldn't read the dashboard days; leaving the site's dashboard as it is.`);
    return;
  }
  const openDays = days.filter((d) => d.link);
  NG.store.setDayOrder(studentId, openDays.map((d) => d.link.dayOfWeekId));

  const name = NG.portal.studentName(document, studentId);

  // Save what we can see for the toolbar popup and icon badge. Being here also proves we're logged in.
  function saveSnapshot() {
    NG.store.setSnapshot(NG.portal.toSnapshot(days, name, location.origin))
      .catch((err) => console.error(LOG, 'Could not save snapshot', err));
  }
  NG.store.setStatus('ok');
  saveSnapshot();

  const state = {
    open: null, // a day from `days` while the drawer is showing it
    menus: new Map(), // dayOfWeekId -> { items } | { error } | 'loading'
    saving: null, // productId being chosen
    prefs: { favourites: {}, hidden: {} },
    showHidden: false, // hidden-meals list expanded in the drawer
  };

  // ---- Helpers ----

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  }

  // Static icon markup only (never site data).
  function icon(svg) {
    const span = h('span', { class: 'ng-icon', 'aria-hidden': 'true' });
    span.innerHTML = svg;
    return span;
  }

  const ICON = {
    heart: (on) =>
      `<svg viewBox="0 0 24 24" width="22" height="22" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
    eye: (shut) =>
      shut
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c5 0 8.7 3.6 10 7-.5 1.3-1.3 2.6-2.4 3.7M6.3 6.3C4.3 7.6 2.8 9.6 2 12c1.3 3.4 5 7 10 7 1.9 0 3.6-.5 5.1-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c1.3-3.4 5-7 10-7s8.7 3.6 10 7c-1.3 3.4-5 7-10 7S3.3 15.4 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  };

  const shortDate = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short' });
  const weekLabel = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const dayDate = (d) => (d.date ? shortDate.format(d.date) : d.dateText);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // ---- Mount ----

  const fonts = h('link', {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=swap',
  });
  document.head.append(fonts);

  // Top bar from the design: wordmark + "Meal planner" pill, account links on the right.
  // Reuse the site's own link targets where they exist.
  const siteHeader = document.querySelector(SEL.siteHeader);
  const linkHref = (sel, fallback) => document.querySelector(sel)?.getAttribute('href') || fallback;
  const topbar = h('header', { id: 'ng-topbar' },
    h('div', { class: 'ng-brand' },
      h('a', { class: 'ng-wordmark', href: '/dashboard', text: 'Nourish + Green' }),
      h('span', { class: 'ng-pill', text: 'Meal planner' }),
    ),
    h('nav', { class: 'ng-nav', 'aria-label': 'Account' },
      h('a', { href: linkHref(SEL.accountLink, '/customer/info'), text: 'My account' }),
      h('a', { href: linkHref(SEL.logoutLink, '/logout'), text: 'Log out' }),
    ),
  );
  document.body.prepend(topbar);
  if (siteHeader) siteHeader.classList.add('ng-hidden');
  else console.error(`${LOG} Expected element not found: ${SEL.siteHeader}`);
  document.documentElement.classList.add('ng-planner-page');

  const siteFooter = document.querySelector(SEL.siteFooter);
  if (siteFooter) siteFooter.classList.add('ng-hidden');
  else console.warn(`${LOG} Expected element not found: ${SEL.siteFooter}`);

  const siteContent = swiper.closest(SEL.dashboardMain) || swiper;
  const root = h('div', { id: 'ng-planner' });
  siteContent.before(root);
  siteContent.classList.add('ng-hidden');

  const header = h('div', { class: 'ng-head' });
  const weeksEl = h('div', { class: 'ng-weeks' });
  const drawer = h('dialog', { class: 'ng-drawer', 'aria-label': 'Choose a lunch' });
  const toast = h('div', { class: 'ng-toast', role: 'status', 'aria-live': 'polite' });
  root.append(header, weeksEl, drawer, toast);

  drawer.addEventListener('close', () => {
    state.open = null;
    renderWeeks();
  });
  // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) drawer.close();
  });

  let toastTimer;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2600);
  }

  // ---- Weeks ----

  function renderHeader() {
    const missing = openDays.filter((d) => !d.meal).length;
    header.replaceChildren(
      h('h1', { class: 'ng-title', text: name ? `${name}’s lunches` : 'School lunches' }),
      h('p', {
        class: 'ng-sub',
        text: missing
          ? `${plural(missing, 'day still needs', 'days still need')} a lunch.`
          : 'Every open day has a lunch chosen.',
      }),
    );
  }

  function groupWeeks() {
    const weeks = new Map();
    for (const day of days) {
      const monday = day.date ? NG.portal.mondayOf(day.date) : null;
      const key = monday ? monday.toDateString() : 'other';
      if (!weeks.has(key)) weeks.set(key, { monday, days: [] });
      weeks.get(key).days.push(day);
    }
    return [...weeks.values()];
  }

  function dayCard(day) {
    const col = day.date ? ((day.date.getDay() + 6) % 7) + 1 : null;
    const style = col ? `--ng-col:${col}` : null;
    const top = h('div', { class: 'ng-card-top' },
      h('span', { class: 'ng-card-dow', text: day.dow }),
      h('span', { class: 'ng-card-date', text: dayDate(day) }),
    );

    if (!day.link) {
      return h('div', { class: 'ng-card is-closed', style }, top,
        h('div', { class: 'ng-card-closed', text: 'Not available to order' }));
    }

    const isOpen = state.open === day;
    const cls = `ng-card ${day.meal ? 'is-chosen' : 'is-empty'}${isOpen ? ' is-open' : ''}`;
    const body = day.meal
      ? [
          h('div', { class: 'ng-card-meal' },
            day.meal.img ? h('img', { class: 'ng-card-img', src: day.meal.img, alt: '' }) : null,
            h('span', { class: 'ng-card-name', text: day.meal.name }),
          ),
          h('span', { class: 'ng-card-action', text: 'Change' }),
        ]
      : [
          h('div', { class: 'ng-card-none' }, icon(ICON.clock), h('span', { text: 'No lunch chosen' })),
          h('span', { class: 'ng-card-action is-primary', text: 'Choose lunch' }),
        ];

    return h('button', {
      type: 'button',
      class: cls,
      style,
      'aria-label': `${day.dow} ${dayDate(day)}: ${day.meal ? day.meal.name + '. Change' : 'no lunch chosen. Choose lunch'}`,
      onclick: () => openDay(day),
    }, top, body);
  }

  // Placeholder for a weekday the dashboard doesn't list: already past, or not open yet.
  const firstOpen = openDays.find((d) => d.date)?.date;
  function ghostCard(monday, index) {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    const future = firstOpen && date > firstOpen;
    return h('div', { class: 'ng-card is-closed', style: `--ng-col:${index + 1}` },
      h('div', { class: 'ng-card-top' },
        h('span', { class: 'ng-card-dow', text: WEEKDAYS[index] }),
        h('span', { class: 'ng-card-date', text: shortDate.format(date) }),
      ),
      h('div', { class: 'ng-card-closed', text: future ? 'Not open for ordering yet' : 'Not available to order' }),
    );
  }

  function renderWeeks() {
    renderHeader();
    weeksEl.replaceChildren(
      ...groupWeeks().map(({ monday, days: weekDays }) => {
        const avail = weekDays.filter((d) => d.link);
        const picked = avail.filter((d) => d.meal).length;
        const done = avail.length > 0 && picked === avail.length;

        const cards = weekDays.map(dayCard);
        if (monday) {
          const taken = new Set(weekDays.filter((d) => d.date).map((d) => (d.date.getDay() + 6) % 7));
          for (let i = 0; i < 5; i++) if (!taken.has(i)) cards.push(ghostCard(monday, i));
        }

        return h('section', { class: 'ng-week' },
          h('div', { class: 'ng-week-head' },
            h('h2', { class: 'ng-week-title', text: monday ? `Week of ${weekLabel.format(monday)}` : 'Other days' }),
            avail.length
              ? h('span', {
                  class: `ng-badge ${done ? 'is-done' : 'is-todo'}`,
                  text: done ? (avail.length === 1 ? 'Lunch chosen' : `All ${avail.length} lunches chosen`) : `${picked} of ${avail.length} chosen`,
                })
              : null,
          ),
          h('div', { class: 'ng-week-grid' }, cards),
        );
      }),
    );
  }

  // ---- Drawer ----

  async function openDay(day) {
    state.open = day;
    if (!drawer.open) drawer.showModal();
    renderWeeks();
    renderDrawer();
    const key = day.link.dayOfWeekId;
    if (state.menus.has(key) && !state.menus.get(key).error) return;
    state.menus.set(key, 'loading');
    renderDrawer();
    try {
      state.menus.set(key, await NG.portal.loadMenu(studentId, key));
    } catch (err) {
      console.error(LOG, err);
      state.menus.set(key, { error: err.message });
    }
    if (state.open === day) renderDrawer();
  }

  function stepDay(delta) {
    const i = openDays.indexOf(state.open);
    const next = openDays[i + delta];
    if (next) openDay(next);
  }

  // Tiles for the picker: chosen first, then favourites, then the rest (site order within each).
  // Hidden meals leave the grid for the "hidden" section, unless one is the current choice.
  function pickerItems(items) {
    const { favourites, hidden } = state.prefs;
    const rank = (it) => (it.selected ? 0 : it.productId in favourites ? 1 : 2);
    return items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.selected || !(it.productId in hidden))
      .sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i)
      .map(({ it }) => it);
  }

  function hiddenItems(items) {
    return items.filter((it) => !it.selected && it.productId in state.prefs.hidden);
  }

  function mealTile(item) {
    const fav = item.productId in state.prefs.favourites;
    const saving = state.saving === item.productId;

    const picture = h('button', {
      type: 'button',
      class: 'ng-tile-pic',
      'aria-label': item.selected ? `${item.title} (chosen)` : `Choose ${item.title}`,
      disabled: item.selected || !!state.saving,
      onclick: () => chooseItem(item),
    },
      item.img ? h('img', { src: item.img, alt: '' }) : null,
      saving ? h('span', { class: 'ng-tile-saving', text: 'Saving…' }) : null,
    );

    return h('li', { class: `ng-tile${item.selected ? ' is-selected' : ''}` },
      h('div', { class: 'ng-tile-media' },
        picture,
        item.selected ? h('span', { class: 'ng-tile-chosen' }, icon(ICON.check), h('span', { text: 'Chosen' })) : null,
        h('div', { class: 'ng-tile-actions' },
          item.selected
            ? null
            : h('button', {
                type: 'button',
                class: 'ng-round-btn ng-hide',
                'aria-label': `Hide ${item.title}`,
                onclick: () => NG.store.toggle(studentId, 'hidden', item.productId, item.title),
              }, icon(ICON.eye(true))),
          h('button', {
            type: 'button',
            class: 'ng-round-btn ng-fav',
            'aria-pressed': String(fav),
            'aria-label': fav ? `Remove ${item.title} from favourites` : `Add ${item.title} to favourites`,
            onclick: () => NG.store.toggle(studentId, 'favourites', item.productId, item.title),
          }, icon(ICON.heart(fav))),
        ),
      ),
      h('div', { class: 'ng-tile-info' },
        h('span', { class: 'ng-tile-name', text: item.title }),
        item.detailHref
          ? h('a', { class: 'ng-tile-link', href: item.detailHref, target: '_blank', rel: 'noopener', text: 'Ingredients & allergens' })
          : null,
      ),
    );
  }

  function hiddenSection(items) {
    if (!items.length) return null;
    const n = items.length;
    return h('div', { class: 'ng-hidden-section' },
      h('div', { class: 'ng-hidden-bar' },
        h('span', { text: `${n} ${n === 1 ? 'meal' : 'meals'} hidden from the picker` }),
        h('button', {
          type: 'button',
          class: 'ng-btn-secondary',
          'aria-expanded': String(state.showHidden),
          onclick: () => {
            state.showHidden = !state.showHidden;
            renderDrawer();
          },
          text: state.showHidden ? 'Done' : 'Show hidden',
        }),
      ),
      state.showHidden
        ? h('ul', { class: 'ng-hidden-list' },
            items.map((item) =>
              h('li', { class: 'ng-hidden-row' },
                item.img ? h('img', { class: 'ng-hidden-img', src: item.img, alt: '' }) : h('span', { class: 'ng-hidden-img' }),
                h('span', { class: 'ng-hidden-name', text: item.title }),
                h('button', {
                  type: 'button',
                  class: 'ng-btn-outline',
                  'aria-label': `Show ${item.title} again`,
                  onclick: () => NG.store.toggle(studentId, 'hidden', item.productId, item.title),
                  text: 'Show again',
                }),
              ),
            ),
          )
        : null,
    );
  }

  function renderDrawer() {
    const day = state.open;
    if (!day) return;
    const idx = openDays.indexOf(day);
    const menu = state.menus.get(day.link.dayOfWeekId);
    const pickedAll = openDays.filter((d) => d.meal).length;

    // Re-rendering replaces the list; keep the scroll position when it's the same day.
    const oldBody = drawer.querySelector('.ng-drawer-body');
    const keepScroll = oldBody && drawer.dataset.day === String(day.link.dayOfWeekId) ? oldBody.scrollTop : 0;
    drawer.dataset.day = String(day.link.dayOfWeekId);

    let body;
    if (!menu || menu === 'loading') {
      body = h('p', { class: 'ng-drawer-msg', text: 'Loading menu…' });
    } else if (menu.error && !menu.items) {
      body = h('div', { class: 'ng-drawer-msg is-error' },
        h('p', { text: menu.error }),
        h('button', { type: 'button', class: 'ng-btn-primary', onclick: () => { state.menus.delete(day.link.dayOfWeekId); openDay(day); }, text: 'Try again' }),
      );
    } else {
      const items = pickerItems(menu.items);
      body = [
        menu.error ? h('p', { class: 'ng-drawer-msg is-error', role: 'alert', text: menu.error }) : null,
        items.length
          ? h('ul', { class: 'ng-tiles' }, items.map(mealTile))
          : h('p', { class: 'ng-drawer-msg', text: 'No meals to show for this day.' }),
        hiddenSection(hiddenItems(menu.items)),
      ];
    }

    const bodyEl = h('div', { class: 'ng-drawer-body' }, body);
    drawer.replaceChildren(
      h('div', { class: 'ng-panel' },
        h('div', { class: 'ng-drawer-head' },
          h('div', { class: 'ng-drawer-nav' },
            h('div', { class: 'ng-day-switch' },
              h('button', { type: 'button', class: 'ng-icon-btn ng-outline', 'aria-label': 'Previous day', disabled: idx <= 0, onclick: () => stepDay(-1) }, icon(ICON.prev)),
              h('div', { class: 'ng-drawer-day' },
                h('span', { class: 'ng-drawer-dow', text: day.dow }),
                h('span', { class: 'ng-drawer-date', text: dayDate(day) }),
              ),
              h('button', { type: 'button', class: 'ng-icon-btn ng-outline', 'aria-label': 'Next day', disabled: idx >= openDays.length - 1, onclick: () => stepDay(1) }, icon(ICON.next)),
            ),
            h('button', { type: 'button', class: 'ng-icon-btn ng-filled', 'aria-label': 'Close', onclick: () => drawer.close() }, icon(ICON.close)),
          ),
        ),
        bodyEl,
        h('div', { class: 'ng-drawer-foot' },
          h('span', { text: 'Tap a picture to choose – then it’s on to the next empty day' }),
          h('strong', { text: `${pickedAll} of ${openDays.length} days chosen` }),
        ),
      ),
    );
    bodyEl.scrollTop = keepScroll;
  }

  async function chooseItem(item) {
    const day = state.open;
    if (!day || state.saving) return;
    const key = day.link.dayOfWeekId;
    state.saving = item.productId;
    renderDrawer();
    try {
      const after = await NG.portal.choose(studentId, key, item.productId);
      state.menus.set(key, after);
      day.meal = { name: item.title, img: item.img };
      saveSnapshot();
      state.saving = null;
      renderWeeks();

      const start = openDays.indexOf(day);
      const nextEmpty = openDays.slice(start + 1).find((d) => !d.meal);
      if (nextEmpty) {
        showToast(`Saved: ${item.title}`);
        openDay(nextEmpty);
      } else {
        drawer.close();
        showToast(openDays.every((d) => d.meal) ? 'Saved. Every open day has a lunch.' : `Saved: ${item.title}`);
      }
    } catch (err) {
      console.error(LOG, err);
      state.saving = null;
      // Keep the menu we had but show the error above it; the next open re-fetches.
      const current = state.menus.get(key);
      state.menus.set(key, { ...(current?.items ? current : {}), error: err.message });
      if (state.open === day) renderDrawer();
    }
  }

  // ---- Prefs ----

  async function loadPrefs() {
    state.prefs = await NG.store.getStudentPrefs(studentId);
    renderDrawer();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.prefs) loadPrefs();
  });

  renderWeeks();
  loadPrefs();
})();
