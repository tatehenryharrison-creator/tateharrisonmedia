/* Hero parallax — matches the mechanic on the live tatehenryharrison-creator
   site: the background layer drifts slightly as you scroll past the hero. */
document.addEventListener('DOMContentLoaded', function () {
    var heroParallax = document.querySelector('.hero-parallax');
    if (!heroParallax) return;

    window.addEventListener('scroll', function () {
        heroParallax.style.transform = 'translateY(' + (window.scrollY * 0.35) + 'px)';
    }, { passive: true });
});
