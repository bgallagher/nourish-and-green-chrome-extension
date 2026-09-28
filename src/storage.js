// chrome.storage.local helpers.
// prefs:    { [studentId]: { favourites: { [productId]: title }, hidden: { [productId]: title } } }
// dayOrder: { [studentId]: { days: [dayOfWeekId, ...], savedAt } }
var NG = globalThis.NG || (globalThis.NG = {});

NG.store = {
  async getStudentPrefs(studentId) {
    const { prefs = {} } = await chrome.storage.local.get('prefs');
    const p = prefs[studentId] || {};
    return { favourites: p.favourites || {}, hidden: p.hidden || {} };
  },

  // Toggles productId in the given list ('favourites' | 'hidden'); returns the new state.
  async toggle(studentId, list, productId, title) {
    const { prefs = {} } = await chrome.storage.local.get('prefs');
    const p = prefs[studentId] || (prefs[studentId] = { favourites: {}, hidden: {} });
    const bucket = p[list] || (p[list] = {});
    const on = !(productId in bucket);
    if (on) bucket[productId] = title;
    else delete bucket[productId];
    await chrome.storage.local.set({ prefs });
    return on;
  },

  async getDayOrder(studentId) {
    const { dayOrder = {} } = await chrome.storage.local.get('dayOrder');
    return dayOrder[studentId]?.days || null;
  },

  async setDayOrder(studentId, days) {
    const { dayOrder = {} } = await chrome.storage.local.get('dayOrder');
    dayOrder[studentId] = { days, savedAt: Date.now() };
    await chrome.storage.local.set({ dayOrder });
  },
};
