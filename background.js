// Daily background check of the dashboard. It refreshes the popup snapshot, keeps the portal
// login warm (the site renews its 14-day cookie on use), and sets the toolbar badge:
//   amber dot = an upcoming day has no lunch chosen, red "!" = need to log in.
importScripts('src/storage.js');

const PORTAL = 'https://portal.nourishandgreen.ie';
const DAILY = 'daily-check';
const RETRY = 'retry-check';
const DAY_MINUTES = 24 * 60;
const STALE_MS = 20 * 60 * 60 * 1000;
const LOG = '[Nourish+Green helper]';

// ---- Scheduling ----

// Alarms can be lost on browser restart, so make sure the daily one exists on every wake-up.
async function ensureAlarm() {
  if (!(await chrome.alarms.get(DAILY))) {
    await chrome.alarms.create(DAILY, { delayInMinutes: DAY_MINUTES, periodInMinutes: DAY_MINUTES });
  }
}

async function checkIfStale() {
  const status = await NG.store.getStatus();
  if (!status || Date.now() - status.at > STALE_MS) await check();
  else await updateBadge();
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm();
  await check();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await checkIfStale();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DAILY || alarm.name === RETRY) await check();
});

// ---- The check ----

async function check() {
  try {
    const res = await fetch(`${PORTAL}/dashboard`, { credentials: 'include', cache: 'no-store' });
    if (/^\/login/i.test(new URL(res.url).pathname)) return await NG.store.setStatus('login');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parsed = await parseDashboard(await res.text());
    if (parsed?.error) throw new Error(parsed.error);
    if (parsed?.loginPage) return await NG.store.setStatus('login');
    if (!parsed?.snapshot?.days?.length) throw new Error('No days found on the dashboard');

    await NG.store.setSnapshot(parsed.snapshot);
    if (parsed.dayOrder) await NG.store.setDayOrder(parsed.dayOrder.studentId, parsed.dayOrder.days);
    await NG.store.setStatus('ok');
  } catch (err) {
    // Offline, site down, or the layout changed: keep the last snapshot, try again in an hour.
    console.error(LOG, 'Daily check failed:', err);
    await NG.store.setStatus('error', String(err.message || err));
    await chrome.alarms.create(RETRY, { delayInMinutes: 60 });
  }
}

// Service workers have no DOMParser, so the HTML is read in a short-lived offscreen page.
async function parseDashboard(html) {
  const url = chrome.runtime.getURL('offscreen/offscreen.html');
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (!existing.length) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Read the lunch dashboard page to find days that need a lunch.',
    });
  }
  try {
    return await chrome.runtime.sendMessage({ type: 'parse-dashboard', html, origin: PORTAL });
  } finally {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

// ---- Badge ----

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function setBadge(text, color, title) {
  await chrome.action.setBadgeText({ text });
  if (color) {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
  await chrome.action.setTitle({ title });
}

async function updateBadge() {
  const [status, snap] = await Promise.all([NG.store.getStatus(), NG.store.getSnapshot()]);
  if (status?.state === 'login') {
    return setBadge('!', '#d93025', 'Log in to Nourish + Green to check lunches');
  }
  const today = todayIso();
  const empty = (snap?.days || []).filter((d) => d.open && !d.meal && (!d.date || d.date >= today)).length;
  if (empty) {
    return setBadge(' ', '#d9a441', `${empty} ${empty === 1 ? 'day needs' : 'days need'} a lunch`);
  }
  return setBadge('', null, "This week's lunches");
}

// Re-draw whenever the planner, popup or a check changes what we know.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.snapshot || changes.status)) updateBadge();
});

// ---- Messages from the popup ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'check-now') return;
  (async () => {
    await check();
    sendResponse(await NG.store.getStatus());
  })();
  return true;
});
