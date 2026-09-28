// Dashboard: replace the one-day-at-a-time carousel with all days grouped by week,
// and cache the day order so the meal page knows where "next day" goes.
(() => {
  const { SEL } = NG;
  const swiper = NG.getRequired(SEL.swiper);
  if (!swiper) return;

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
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  const slides = [...swiper.querySelectorAll(SEL.swiperSlide)];
  if (!slides.length) {
    console.error(`[Nourish+Green helper] Expected element not found: ${SEL.swiperSlide}`);
    return;
  }

  const days = slides.map((slide) => {
    const link = NG.parseCartPath(slide.querySelector(SEL.dayLink)?.getAttribute('href'));
    const dateText = slide.querySelector(SEL.dayDate)?.textContent.trim();
    const date = parseDate(dateText);
    if (!date) console.warn('[Nourish+Green helper] Could not parse day date:', dateText, slide);
    return { slide, link, date };
  });

  // Make the day name and meal image link to the day's menu too, not just the button.
  function wrapInLink(el, href) {
    if (!el || el.querySelector('a')) return; // leave anything that already has its own link
    const a = document.createElement('a');
    a.href = href;
    a.className = 'ng-day-link';
    a.append(...el.childNodes);
    el.append(a);
  }
  for (const { slide } of days) {
    const href = slide.querySelector(SEL.dayLink)?.getAttribute('href');
    if (!href) continue;
    wrapInLink(slide.querySelector(SEL.dayIntro), href);
    wrapInLink(slide.querySelector(SEL.mealImage), href);
  }

  // Cache day order per student (display order handles the Fri -> Mon wrap).
  const studentId = days.find((d) => d.link)?.link.studentId;
  if (studentId) {
    NG.store.setDayOrder(studentId, days.filter((d) => d.link).map((d) => d.link.dayOfWeekId));
  }

  // Group by week, keeping display order.
  const groups = new Map();
  for (const day of days) {
    const key = day.date ? mondayOf(day.date).toDateString() : 'other';
    if (!groups.has(key)) groups.set(key, { monday: day.date && mondayOf(day.date), days: [] });
    groups.get(key).days.push(day);
  }

  const fmt = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
  const container = document.createElement('div');
  container.className = 'ng-weeks';

  for (const { monday, days: weekDays } of groups.values()) {
    const section = document.createElement('section');
    section.className = 'ng-week';
    const h = document.createElement('h3');
    h.className = 'ng-week-title';
    h.textContent = monday ? `Week of ${fmt.format(monday)}` : 'Other days';
    const grid = document.createElement('div');
    grid.className = 'ng-week-grid';
    for (const { slide, date } of weekDays) {
      slide.removeAttribute('style'); // drop carousel widths/margins
      slide.classList.add('ng-day');
      // Pin each day to its weekday column (Mon = 1) so weeks line up.
      if (date) slide.style.setProperty('--ng-col', String(((date.getDay() + 6) % 7) + 1));
      grid.append(slide);
    }
    section.append(h, grid);
    container.append(section);
  }

  NG.hideZeroPrices(container);
  swiper.before(container);
  swiper.classList.add('ng-hidden');
  swiper.parentElement?.querySelectorAll(SEL.swiperChrome).forEach((el) => el.classList.add('ng-hidden'));
})();
