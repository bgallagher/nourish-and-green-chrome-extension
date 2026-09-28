// All portal selectors and URL parsing live here so markup changes only need fixing in one place.
var NG = globalThis.NG || (globalThis.NG = {});

NG.SEL = {
  // Day menu page (/student/editstudentcart/...)
  cartForm: '#student-carts-form',
  productDescription: '.description',
  itemGrid: '.student-carts .item-grid',
  itemBox: '.item-box',
  productItem: '.product-item[data-productid]',
  productPicture: '.picture',
  productTitle: '.product-title',
  selectedItem: '.product-item.selected',
  chooseButton: '.add-to-cart button[data-productid]',
  studentHeading: '.student-heading',
  dayLink: 'a[href*="/student/editstudentcart/"]',

  // Dashboard (/dashboard)
  swiper: '.swiper',
  swiperSlide: '.swiper-slide:not(.swiper-slide-duplicate)',
  dayName: '.day-summary-intro h2',
  dayDate: '.day-summary-intro span',
  dayMeals: '.day-summary-cart ul li',
  dayMealImage: '.meal-image img',
  studentTab: 'a[href*="studentId="]',
  // Site header (logo, account links), replaced by the planner's own top bar.
  siteHeader: '.header',
  accountLink: 'a[href*="/customer/info"]',
  logoutLink: 'a[href*="/logout"]',
  siteFooter: '.footer',
  // The site's dashboard content, hidden and replaced by the planner (nearest match wins).
  dashboardMain: '.page, .center-1, main',

  // Prices on menu items (hidden when zero)
  price: '.prices',
};

// True if the element's text contains a money amount and every amount is zero (e.g. "Daily Total: €0.00").
NG.isZeroPrice = (el) => {
  const amounts = (el.textContent.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  return amounts.length > 0 && amounts.every((n) => n === 0);
};

NG.hideZeroPrices = (root = document) => {
  root.querySelectorAll(NG.SEL.price).forEach((el) => {
    if (NG.isZeroPrice(el)) el.classList.add('ng-zero-price');
  });
};

NG.CART_HOT_LUNCH = 1;

// Mirrors the site's AjaxCart.success_process: a pick normally comes back as just
// { redirect } (no `success`). It's a failure only when success is false, or when there's
// a message without success === true (the site shows that as an error bar).
NG.isFailedCartResponse = (json) =>
  !json || json.success === false || (!!json.message && json.success !== true);

// Parses /student/editstudentcart/{studentId}/{cartTypeId}/{dayOfWeekId}/0 from a path or href.
NG.parseCartPath = (href) => {
  const m = /\/student\/editstudentcart\/(\d+)\/(\d+)\/(\d+)/.exec(href || '');
  if (!m) return null;
  return { studentId: m[1], cartTypeId: Number(m[2]), dayOfWeekId: Number(m[3]) };
};

NG.cartUrl = (studentId, cartTypeId, dayOfWeekId) =>
  `/student/editstudentcart/${studentId}/${cartTypeId}/${dayOfWeekId}/0`;

NG.dashboardUrl = (studentId) => `/dashboard?studentId=${encodeURIComponent(studentId)}`;

// Returns the element or null, logging loudly so markup changes are noticed.
NG.getRequired = (selector, root = document) => {
  const el = root.querySelector(selector);
  if (!el) console.error(`[Nourish+Green helper] Expected element not found: ${selector}`);
  return el;
};
