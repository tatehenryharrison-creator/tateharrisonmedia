/* Site-wide JS.

   Links that are still waiting for a real address (href="#") are hidden on the
   live site, so visitors never meet a button that goes nowhere. Dreamweaver's
   Design view doesn't run this script, so you can still see and edit them.
   To turn one on, select it and paste the real address into the Link box. */
(function () {
    var waiting = document.querySelectorAll('a[href="#"][data-needs-link]');
    for (var i = 0; i < waiting.length; i++) waiting[i].hidden = true;
})();

/* Mark the current page in the menu (for screen readers, and the gold underline). */
(function () {
    var here = window.location.pathname.replace(/index\.html$/, '');
    var links = document.querySelectorAll('nav .nav-links a');
    for (var i = 0; i < links.length; i++) {
        var target = links[i].pathname.replace(/index\.html$/, '');
        if (links[i].hash) continue;
        if (target === here || (target.length > 1 && here.indexOf(target) === 0 && target.slice(-1) === '/')) {
            links[i].setAttribute('aria-current', 'page');
        }
    }
})();
