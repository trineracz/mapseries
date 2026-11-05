/**
 * The save bar (#saveBar) is fixed to the bottom of the window; its left edge
 * follows the page, which moves when the side menu is shrunk, hidden or shown.
 */
(function () {
    function follow() {
        var bar = document.getElementById("saveBar"), page = document.querySelector(".page");
        if (!bar || !page) { return; }
        var place = function () { bar.style.left = Math.max(0, page.getBoundingClientRect().left) + "px"; };
        place();
        if (window.ResizeObserver) { new ResizeObserver(place).observe(page); }
        window.addEventListener("resize", place);
        page.addEventListener("transitionend", place);
    }
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", follow); } else { follow(); }
})();
