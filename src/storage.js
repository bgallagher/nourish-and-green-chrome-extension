// chrome.storage.local helpers.
// prefs:    { [studentId]: { favourites: { [productId]: title }, hidden: { [productId]: title } } }
// dayOrder: { [studentId]: { days: [dayOfWeekId, ...], savedAt } }
// snapshot: { name, savedAt, days: [{ dow, date: 'YYYY-MM-DD' | null, dateText, open, meal: { name, img } | null }] }
//           what the planner or daily check last saw, for the toolbar popup and badge
// status:   { state: 'ok' | 'login' | 'error', detail, at }  result of the last dashboard read
var NG = globalThis.NG || (globalThis.NG = {});

// Serialise read-modify-write updates so quick clicks can't overwrite each other.
let ngStoreQueue = Promise.resolve();
function ngStoreUpdate(fn) {
  const run = ngStoreQueue.then(fn);
  ngStoreQueue = run.catch(() => {});
  return run;
}

NG.store = {
  async getStudentPrefs(studentId) {
    const { prefs = {} } = await chrome.storage.local.get('prefs');
    const p = prefs[studentId] || {};
    return { favourites: p.favourites || {}, hidden: p.hidden || {} };
  },

  // Toggles productId in the given list ('favourites' | 'hidden'); returns the new state.
  toggle(studentId, list, productId, title) {
    return ngStoreUpdate(async () => {
      const { prefs = {} } = await chrome.storage.local.get('prefs');
      const p = prefs[studentId] || (prefs[studentId] = { favourites: {}, hidden: {} });
      const bucket = p[list] || (p[list] = {});
      const on = !(productId in bucket);
      if (on) bucket[productId] = title;
      else delete bucket[productId];
      await chrome.storage.local.set({ prefs });
      return on;
    });
  },

  async getDayOrder(studentId) {
    const { dayOrder = {} } = await chrome.storage.local.get('dayOrder');
    return dayOrder[studentId]?.days || null;
  },

  async getStatus() {
    const { status = null } = await chrome.storage.local.get('status');
    return status;
  },

  setStatus(state, detail = '') {
    return chrome.storage.local.set({ status: { state, detail, at: Date.now() } });
  },

  async getSnapshot() {
    const { snapshot = null } = await chrome.storage.local.get('snapshot');
    return snapshot;
  },

  setSnapshot(snapshot) {
    return chrome.storage.local.set({ snapshot });
  },

  setDayOrder(studentId, days) {
    return ngStoreUpdate(async () => {
      const { dayOrder = {} } = await chrome.storage.local.get('dayOrder');
      dayOrder[studentId] = { days, savedAt: Date.now() };
      await chrome.storage.local.set({ dayOrder });
    });
  },
};
