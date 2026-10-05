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

  /* The mailto feedback form was removed: the comment section covers the same
   * ground without making anyone open an email client. The address is still in
   * the privacy policy for anything private. */

  /* ── Interactive demo ────────────────────────────────────────────────
   * The app itself, in an iframe. Its src is set on open and cleared on
   * close, so the bundle is never fetched by someone who does not ask for
   * it, and the closed demo is not left running in the background.
   */
  var demoModal = document.getElementById("demo-modal");
  var demoOpeners = document.querySelectorAll("[data-demo-open]");
  var demoFrame = document.getElementById("demo-iframe");

  if (demoModal && demoOpeners.length && demoFrame) {
    var openDemo = function () {
      if (demoFrame.getAttribute("src") !== "demo/index.html") {
        demoFrame.setAttribute("src", "demo/index.html");
      }
      demoModal.hidden = false;
      document.body.style.overflow = "hidden";
    };
    var closeDemo = function () {
      demoModal.hidden = true;
      document.body.style.overflow = "";
      // Unload it, or the demo keeps ticking behind the page.
      demoFrame.setAttribute("src", "about:blank");
    };

    // Every phone in the row opens the same demo.
    for (var i = 0; i < demoOpeners.length; i++) {
      demoOpeners[i].addEventListener("click", openDemo);
    }
    demoModal.addEventListener("click", function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute("data-demo-close")) closeDemo();
      else if (e.target.closest && e.target.closest("[data-demo-close]")) closeDemo();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !demoModal.hidden) closeDemo();
    });
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

  /* The comment section used to be loaded here, lazily, from Cusdis. Their
   * service returns 521 and their repository is archived, so the whole thing
   * is gone. Nothing on the site loads from a third party any more. */
})();
