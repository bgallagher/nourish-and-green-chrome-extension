// Portal data layer: read the dashboard, fetch day menus in the background, and submit
// a Hot Lunch choice by replaying the site's own form POST (see nourish-green-portal-notes.md).
var NG = globalThis.NG || (globalThis.NG = {});

NG.portal = (() => {
  const { SEL } = NG;
  const LOG = '[Nourish+Green helper]';

  // ---- Dates ----

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'];

  // "6 October" -> Date. No year on the page, so assume the nearest upcoming one.
  function parseDate(text) {
    const m = /(\d{1,2})\s+([A-Za-z]+)/.exec(text || '');
    if (!m) return null;
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month === -1) return null;
    const now = new Date();
    const date = new Date(now.getFullYear(), month, Number(m[1]));
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    if (date < twoMonthsAgo) date.setFullYear(date.getFullYear() + 1);
    return date;
  }

  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  // ---- Requests (serialised, a few per second at most) ----

  const GAP_MS = 300;
  let chain = Promise.resolve();
  let last = 0;

  function queued(fn) {
    const run = chain.then(async () => {
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        last = Date.now();
      }
    });
    chain = run.catch(() => {});
    return run;
  }

  function checkSession(res) {
    if (/^\/login/i.test(new URL(res.url).pathname)) {
      throw new Error('Your portal session has expired. Refresh the page and log in again.');
    }
  }

  function getDoc(url) {
    return queued(async () => {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      checkSession(res);
      if (!res.ok) throw new Error(`Couldn't load the menu (HTTP ${res.status}).`);
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    });
  }

  function textOf(html) {
    const list = Array.isArray(html) ? html : [html];
    return list
      .map((m) => new DOMParser().parseFromString(String(m ?? ''), 'text/html').body.textContent.trim())
      .filter(Boolean)
      .join(' ');
  }

  // ---- Dashboard ----

  function parseDashboardDays(doc = document) {
    const swiper = doc.querySelector(SEL.swiper);
    const slides = swiper ? [...swiper.querySelectorAll(SEL.swiperSlide)] : [];
    if (!slides.length) console.error(`${LOG} Expected element not found: ${SEL.swiperSlide}`);

    return slides.map((slide) => {
      const href = slide.querySelector(SEL.dayLink)?.getAttribute('href') || null;
      const dateText = slide.querySelector(SEL.dayDate)?.textContent.trim() || '';
      const date = parseDate(dateText);
      if (!date) console.warn(`${LOG} Could not parse day date:`, dateText, slide);
      const names = [...slide.querySelectorAll(SEL.dayMeals)].map((li) => li.textContent.trim()).filter(Boolean);
      return {
        dow: slide.querySelector(SEL.dayName)?.textContent.trim() || '',
        dateText,
        date,
        link: NG.parseCartPath(href),
        meal: names.length
          ? { name: names.join(', '), img: slide.querySelector(SEL.dayMealImage)?.getAttribute('src') || '' }
          : null,
      };
    });
  }

  function studentName(doc, studentId) {
    const tab = doc.querySelector(`a[href*="studentId=${studentId}"]`) || doc.querySelector(SEL.studentTab);
    return tab?.textContent.trim() || '';
  }

  // ---- Day menu ----

  function parseMenu(doc) {
    const form = doc.querySelector(SEL.cartForm);
    if (!form) throw new Error("Couldn't read the day's menu. The portal layout may have changed.");
    const items = [...form.querySelectorAll(`${SEL.itemGrid} ${SEL.itemBox}`)]
      .map((box) => {
        const item = box.querySelector(SEL.productItem);
        if (!item) return null;
        const onclick = box.querySelector(SEL.chooseButton)?.getAttribute('onclick') || '';
        const url = /addproducttostudentcart\(\s*'([^']+)'/.exec(onclick);
        return {
          productId: item.dataset.productid,
          title: item.querySelector(SEL.productTitle)?.textContent.trim() || '',
          description: item.querySelector(SEL.productDescription)?.textContent.trim() || '',
          img: item.querySelector(`${SEL.productPicture} img`)?.getAttribute('src') || '',
          detailHref: item.querySelector(`${SEL.productTitle} a`)?.getAttribute('href') || '',
          selected: item.matches(SEL.selectedItem),
          chooseUrl: url ? url[1] : null,
        };
      })
      .filter(Boolean);
    if (!items.length) console.warn(`${LOG} Day menu has no items`, doc);
    return { form, items };
  }

  // Mirrors jQuery's $(form).serialize(), which is what the site sends.
  function formParams(form) {
    const params = new URLSearchParams();
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (['submit', 'button', 'reset', 'file', 'image'].includes(el.type)) continue;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
      params.append(el.name, el.value);
    }
    return params;
  }

  async function loadMenu(studentId, dayOfWeekId) {
    return parseMenu(await getDoc(NG.cartUrl(studentId, NG.CART_HOT_LUNCH, dayOfWeekId)));
  }

  async function postChoice(menu, item) {
    // Only ever post to the site's own add-to-cart route on this origin.
    const postUrl = new URL(item.chooseUrl, location.origin);
    if (postUrl.origin !== location.origin || !/^\/student\/addproducttostudentcart\//i.test(postUrl.pathname)) {
      throw new Error('Unexpected choose address on the menu page; not sending.');
    }
    const body = formParams(menu.form);
    const json = await queued(async () => {
      const res = await fetch(postUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
      });
      checkSession(res);
      if (!res.ok) throw new Error(`The portal rejected the choice (HTTP ${res.status}).`);
      try {
        return await res.json();
      } catch {
        throw new Error('The portal sent an unexpected response. Check this day on the site.');
      }
    });
    // Diagnostics while background choosing is new: what we sent and what came back.
    console.info(`${LOG} choose POST`, postUrl.pathname, Object.fromEntries(body), json);
    if (NG.isFailedCartResponse(json)) {
      console.error(`${LOG} choose rejected; response:`, JSON.stringify(json).slice(0, 500));
      throw new Error(textOf(json?.message) || 'The portal did not accept that choice.');
    }
  }

  // Choose a Hot Lunch for one day, then re-read the day to confirm it stuck. If the portal says
  // OK but the meal isn't chosen yet (seen when replacing an existing choice), try once more.
  async function choose(studentId, dayOfWeekId, productId) {
    const id = String(productId);
    const MAX_ATTEMPTS = 2;
    let menu = await loadMenu(studentId, dayOfWeekId);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const item = menu.items.find((i) => i.productId === id);
      if (!item) throw new Error('That meal is no longer on the menu for this day.');
      if (item.selected) return menu;
      if (!item.chooseUrl) throw new Error("Couldn't find the portal's Choose button for that meal.");

      await postChoice(menu, item);
      menu = await loadMenu(studentId, dayOfWeekId);
      if (menu.items.some((i) => i.productId === id && i.selected)) return menu;
      console.warn(`${LOG} choice not showing after attempt ${attempt}`, {
        wanted: id,
        selectedNow: menu.items.filter((i) => i.selected).map((i) => i.productId),
      });
    }
    throw new Error("The portal said OK but the meal doesn't show as chosen. Check this day on the site.");
  }

  return { parseDate, mondayOf, parseDashboardDays, studentName, loadMenu, choose };
})();
