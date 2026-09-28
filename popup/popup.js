// Toolbar popup: a quick look at upcoming lunches, from the snapshot the planner saves.
const PORTAL = 'https://portal.nourishandgreen.ie';
const PORTAL_DASHBOARD = `${PORTAL}/dashboard`;
const PORTAL_LOGIN = `${PORTAL}/login?returnUrl=%2Fdashboard`;

const $ = (id) => document.getElementById(id);

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dayLabel = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
const relative = new Intl.RelativeTimeFormat('en-IE', { numeric: 'auto' });

function ago(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return relative.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  return relative.format(-Math.round(hours / 24), 'day');
}

function labelFor(day, todayIso, tomorrowIso) {
  if (!day.date) return `${day.dow} ${day.dateText}`.trim();
  if (day.date === todayIso) return 'Today';
  if (day.date === tomorrowIso) return 'Tomorrow';
  return dayLabel.format(dateOf(day.date));
}

function row(day, label, isToday) {
  const meal = day.meal;
  return h('div', { class: `row${isToday ? ' is-today' : ''}${meal ? '' : ' is-empty'}` },
    meal?.img ? h('img', { class: 'thumb', src: meal.img, alt: '' }) : h('span', { class: 'thumb' }),
    h('div', { class: 'text' },
      h('span', { class: 'day', text: label }),
      h('span', { class: 'meal', text: meal ? meal.name : 'No lunch chosen' }),
    ),
  );
}

async function render() {
  const [snap, status] = await Promise.all([NG.store.getSnapshot(), NG.store.getStatus()]);
  const list = $('list');
  $('login').hidden = status?.state !== 'login';

  if (!snap?.days?.length) {
    list.replaceChildren(h('p', { class: 'note', text: 'Open the planner once and your lunches will show up here.' }));
    return;
  }

  $('title').textContent = snap.name ? `${snap.name}’s lunches` : 'Lunches';
  $('updated').textContent = `Updated ${ago(snap.savedAt)}`;

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const todayIso = isoOf(today);
  const tomorrowIso = isoOf(tomorrow);

  const upcoming = snap.days.filter((d) => d.open && (!d.date || d.date >= todayIso));
  if (!upcoming.length) {
    list.replaceChildren(h('p', { class: 'note', text: 'Nothing saved for the days ahead. Open the planner to refresh.' }));
    return;
  }

  const missing = upcoming.filter((d) => !d.meal).length;
  const rows = upcoming.map((d) => row(d, labelFor(d, todayIso, tomorrowIso), d.date === todayIso));
  if (missing) {
    rows.push(h('p', { class: 'note is-warn', text: `${missing} ${missing === 1 ? 'day needs' : 'days need'} a lunch.` }));
  }
  list.replaceChildren(...rows);
}

$('login-btn').addEventListener('click', async () => {
  await chrome.tabs.create({ url: PORTAL_LOGIN });
  window.close();
});

$('check').addEventListener('click', async () => {
  const btn = $('check');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const status = await chrome.runtime.sendMessage({ type: 'check-now' });
    btn.textContent = status?.state === 'error' ? "Couldn't check" : 'Check now';
  } catch (err) {
    console.error('[Nourish+Green helper] check now', err);
    btn.textContent = "Couldn't check";
  }
  btn.disabled = false;
  await render();
});

$('open').addEventListener('click', async () => {
  await chrome.tabs.create({ url: PORTAL_DASHBOARD });
  window.close();
});

render().catch((err) => {
  console.error('[Nourish+Green helper] popup', err);
  $('list').replaceChildren(h('p', { class: 'note', text: "Couldn't load your lunches." }));
});
