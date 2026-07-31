// Sandbar Laundry Co. — shared site behavior

document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var isOpen = item.getAttribute('data-open') === 'true';
      item.setAttribute('data-open', isOpen ? 'false' : 'true');
      q.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });
  });

  // Waitlist form(s) — AJAX submit to Netlify Forms, honeypot spam check
  function encode(data) {
    return Object.keys(data)
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]); })
      .join('&');
  }

  document.querySelectorAll('form[data-waitlist-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var honeypot = form.querySelector('input[name="bot-field"]');
      var msg = form.parentElement.querySelector('.form-msg');
      if (honeypot && honeypot.value) {
        // Silently drop likely-bot submissions
        return;
      }

      var formData = new FormData(form);
      var payload = {};
      formData.forEach(function (value, key) { payload[key] = value; });

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(payload),
      })
        .then(function () {
          form.reset();
          if (msg) {
            msg.textContent = "You're on the list — we'll email you when Sandbar opens in Jacksonville.";
            msg.classList.remove('err');
            msg.classList.add('show', 'ok');
          }
          if (typeof gtag === 'function') {
            gtag('event', 'waitlist_signup', {
              interest: payload.interest || 'general',
              page_path: window.location.pathname,
            });
          }
        })
        .catch(function () {
          if (msg) {
            msg.textContent = 'Something went wrong on our end — please try again in a moment.';
            msg.classList.remove('ok');
            msg.classList.add('show', 'err');
          }
        });
    });
  });
});
