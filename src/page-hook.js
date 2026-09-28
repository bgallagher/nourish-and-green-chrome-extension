// Runs in the page's MAIN world so it can wrap the site's AjaxCart handler.
// On a successful Hot Lunch pick it suppresses the site's follow-up (redirect to Little Break)
// and tells the isolated content script, which navigates to the next day.
(() => {
  const HOT_LUNCH = /\/student\/editstudentcart\/\d+\/1\/\d+/;
  if (!HOT_LUNCH.test(location.pathname)) return;

  let tries = 0;
  const timer = setInterval(() => {
    const cart = window.AjaxCart;
    if (cart && typeof cart.success_process === 'function') {
      clearInterval(timer);
      wrap(cart);
    } else if (++tries > 50) {
      clearInterval(timer);
      console.error('[Nourish+Green helper] AjaxCart.success_process not found; auto-advance disabled.');
    }
  }, 100);

  function wrap(cart) {
    const original = cart.success_process;
    cart.success_process = function (response, ...rest) {
      if (response && response.success) {
        window.dispatchEvent(new CustomEvent('ng:picked', { detail: { message: response.message || '' } }));
        return;
      }
      return original.call(this, response, ...rest);
    };
  }
})();
