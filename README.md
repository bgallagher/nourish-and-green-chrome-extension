# Nourish + Green Helper

A personal Chrome extension that makes it quicker to choose school lunches on the [Nourish + Green parent portal](https://portal.nourishandgreen.ie).

This is an unofficial extension that isn't affiliated with Nourish + Green. It only works on the portal while you're logged in.

## Features

- **Week planner:** replaces the dashboard carousel with every upcoming day shown at once, grouped by week, with meal photos and progress badges.
- **Choose in a side drawer:** tap a day to see its menu as picture tiles, tap a picture to choose it, and the drawer moves on to the next empty day.
- **Favourites and hidden meals:** heart meals to keep them at the front, and hide ones you never want to see.
- **Quick-look popup:** click the toolbar icon to see the upcoming lunches without opening the portal.
- **Daily check:** once a day the extension checks the dashboard in the background. An amber dot on the icon means a day needs a lunch. A red **!** means you need to log in again.

## Install

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repo folder.
4. Log in to the portal and open the dashboard.

After pulling changes, click the reload button on the extension's card in `chrome://extensions`.

## How it works

The portal has no public API, so the extension reads the portal's own pages. It also saves choices the same way the site's **Choose Item** button does. Everything uses your existing login in the browser, and the extension never sees or stores your password.

| Path | What it does |
|---|---|
| `src/planner.*` | Week planner and drawer on the dashboard |
| `src/portal.js` | Reads the dashboard and menus, and submits choices |
| `src/selectors.js` | Every page selector in one place, to update if the site's layout changes |
| `src/meal-page.*`, `src/page-hook.js` | Hearts and hiding on the site's own day pages, as a fallback |
| `background.js`, `offscreen/` | Daily check and icon badge |
| `popup/` | Quick-look popup |

## Privacy

- Favourites, hidden meals and the last-seen week are stored in `chrome.storage.local` on your machine.
- The extension only talks to the portal, about once a day in the background. The planner and popup also load their fonts from Google Fonts.
