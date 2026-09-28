// Offscreen page: parses dashboard HTML for the background check (service workers have no DOMParser).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'parse-dashboard') return;
  try {
    const doc = new DOMParser().parseFromString(msg.html, 'text/html');
    if (doc.querySelector(NG.SEL.loginForm)) {
      sendResponse({ loginPage: true });
      return;
    }
    const days = NG.portal.parseDashboardDays(doc);
    const studentId = days.find((d) => d.link)?.link.studentId;
    sendResponse({
      loginPage: false,
      snapshot: days.length ? NG.portal.toSnapshot(days, studentId ? NG.portal.studentName(doc, studentId) : '', msg.origin) : null,
      dayOrder: studentId
        ? { studentId, days: days.filter((d) => d.link).map((d) => d.link.dayOfWeekId) }
        : null,
    });
  } catch (err) {
    sendResponse({ error: String(err.message || err) });
  }
});
