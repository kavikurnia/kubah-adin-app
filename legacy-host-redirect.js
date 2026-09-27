/* Hosting migration only. Existing accounts and business data remain in Firebase. */
(function () {
  'use strict';
  const loc = window.location;
  const github = loc.hostname === 'kavikurnia.github.io';
  const staging = loc.hostname === 'srv2013282.hstgr.cloud';
  if (!github && !staging) return;
  const prefix = '/kubah-adin-app/';
  if (github && !loc.pathname.startsWith(prefix)) return;
  const page = github ? loc.pathname.slice(prefix.length) : loc.pathname.slice(1);
  const routes = {
    '': github ? '/admin' : '/katalog',
    'index.html': '/admin', 'admin': '/admin', 'admin/': '/admin',
    'toko.html': '/katalog', 'katalog': '/katalog', 'katalog/': '/katalog',
    'kurir.html': '/kurir', 'kurir': '/kurir', 'kurir/': '/kurir',
    'planning-admin.html': '/planning-admin.html',
    'admin-website.html': '/admin-website.html',
    'reseller-admin.html': '/reseller-admin.html',
    'reseller.html': '/reseller.html', 'informasi.html': '/informasi.html'
  };
  if (!Object.prototype.hasOwnProperty.call(routes, page)) return;
  // An explicit old-origin review keeps its cart/draft available in this tab.
  // Never copy authentication or browser storage to another origin.
  const review = new URLSearchParams(loc.search).get('legacy');
  try {
    if (review === '0') sessionStorage.removeItem('kubahLegacyReview');
    if (review === '1') sessionStorage.setItem('kubahLegacyReview', '1');
    if (review === '1' || sessionStorage.getItem('kubahLegacyReview') === '1') return;
  } catch (_) { if (review === '1') return; }
  loc.replace('https://kubahnabawistore.com' + routes[page] + loc.search + loc.hash);
})();
