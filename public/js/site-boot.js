/* Public website: price toggles, mobile menu and contact form. */
(function () {
  var el = document.getElementById('site-boot');
  var boot = {};
  try { boot = el ? JSON.parse(el.textContent) : {}; } catch (e) { boot = {}; }
  var root = document.querySelector('.sf-site');
  if (!root || !window.SFSite) return;
  window.SFSite.wire(root, boot, {
    onContact: function (data) {
      return fetch('/api/public/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not send. Please try again.'); return j.message; }); });
    },
  });
})();
