/* MPTree website behaviour. Plain JS, no dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Scroll drives the record ────────────────────────────────────────
   * The disc turns as the page scrolls rather than spinning on its own, so
   * the motion is something the reader causes. Updates are batched into one
   * animation frame per scroll burst to keep it cheap.
   */
  var disc = document.querySelector(".disc");
  if (disc && !reduceMotion) {
    var DEGREES_PER_PIXEL = 0.18;
    var ticking = false;

    function apply() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      disc.style.setProperty("--rot", (y * DEGREES_PER_PIXEL).toFixed(2) + "deg");
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }, { passive: true });

    apply();
  }

  /* ── How it looks: Android or Windows ────────────────────────────────
   * Two pictures, one showing. The buttons are tabs in the accessibility
   * sense, so the chosen one is announced as selected.
   */
  var lookTabs = document.querySelectorAll("[data-look]");
  for (var t = 0; t < lookTabs.length; t++) {
    lookTabs[t].addEventListener("click", function () {
      var want = this.getAttribute("data-look");
      for (var k = 0; k < lookTabs.length; k++) {
        var name = lookTabs[k].getAttribute("data-look");
        lookTabs[k].setAttribute("aria-selected", name === want ? "true" : "false");
        var panel = document.getElementById("look-" + name);
        if (panel) panel.hidden = name !== want;
      }
    });
  }

  /* ── What it does: folded on a phone ─────────────────────────────────
   * Each feature name becomes a button that opens its line. The folding
   * itself is CSS and only applies on a narrow screen (see site.css), so on
   * a wide one the buttons change nothing.
   */
  var grid = document.querySelector("#features .grid");
  if (grid) {
    var items = grid.querySelectorAll("li");
    for (var f = 0; f < items.length; f++) {
      (function (li) {
        var h = li.querySelector("h3");
        if (!h) return;
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = h.textContent;
        b.setAttribute("aria-expanded", "false");
        h.textContent = "";
        h.appendChild(b);
        b.addEventListener("click", function () {
          var open = li.classList.toggle("open");
          b.setAttribute("aria-expanded", open ? "true" : "false");
        });
      })(items[f]);
    }
    grid.classList.add("fold");
  }

  /* The comment section used to be loaded here, lazily, from Cusdis. Their
   * service returns 521 and their repository is archived, so the whole thing
   * is gone. Nothing on the site loads from a third party any more. */
})();
