/* Small hero parallax effect — purely optional.
   If it ever causes trouble in Dreamweaver's Live view, you can
   safely delete this file and remove its <script> tag from a page. */
document.addEventListener('DOMContentLoaded', function () {
    var heroText = document.querySelector('.hero-text-panel');
    if (!heroText) return;

    document.addEventListener('mousemove', function (e) {
        var x = (window.innerWidth / 2 - e.clientX) / 50;
        var y = (window.innerHeight / 2 - e.clientY) / 50;
        heroText.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    });
});
