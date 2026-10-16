/* Site-wide JS.

   Links that are still waiting for a real address (href="#") are hidden on the
   live site, so visitors never meet a button that goes nowhere. Dreamweaver's
   Design view doesn't run this script, so you can still see and edit them.
   To turn one on, select it and paste the real address into the Link box. */
(function () {
    var waiting = document.querySelectorAll('a[href="#"][data-needs-link]');
    for (var i = 0; i < waiting.length; i++) waiting[i].hidden = true;
})();
