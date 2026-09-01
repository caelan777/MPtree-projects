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

  /* ── Feedback opens the reader's email app ───────────────────────────
   * The site is static, so there is nowhere to POST. Building a mailto keeps
   * it working with no backend and no third party.
   */
  var FEEDBACK_TO = "caelanverycool@gmail.com";

  var form = document.getElementById("fb");
  var field = document.getElementById("fb-text");
  var note = document.getElementById("fb-note");

  if (form && field && note) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var text = field.value.trim();
      if (!text) {
        note.textContent = "Write something first.";
        field.focus();
        return;
      }

      var url = "mailto:" + FEEDBACK_TO +
        "?subject=" + encodeURIComponent("MPTree feedback") +
        "&body=" + encodeURIComponent(text);

      // Some browsers block a plain location change here, so use a click.
      var link = document.createElement("a");
      link.href = url;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      note.textContent = "Opening your email app.";
    });
  }

  /* ── Interactive demo ────────────────────────────────────────────────
   * The app itself, in an iframe. Its src is set on open and cleared on
   * close, so the bundle is never fetched by someone who does not ask for
   * it, and the closed demo is not left running in the background.
   */
  var demoModal = document.getElementById("demo-modal");
  var demoOpen  = document.getElementById("demo-open");
  var demoFrame = document.getElementById("demo-iframe");

  if (demoModal && demoOpen && demoFrame) {
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

    demoOpen.addEventListener("click", openDemo);
    demoModal.addEventListener("click", function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute("data-demo-close")) closeDemo();
      else if (e.target.closest && e.target.closest("[data-demo-close]")) closeDemo();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !demoModal.hidden) closeDemo();
    });
  }

  /* ── Comments, loaded only when scrolled to ──────────────────────────
   * Cusdis is a third party, so its script is fetched lazily rather than on
   * every page load: someone who never scrolls that far never touches it.
   * Until an app id is filled into the markup, a plain message stands in.
   */
  var thread   = document.getElementById("cusdis_thread");
  var fallback = document.getElementById("comments-fallback");

  if (thread) {
    var appId = thread.getAttribute("data-app-id");
    var configured = appId && appId !== "CUSDIS_APP_ID";

    if (!configured) {
      thread.hidden = true;
      if (fallback) fallback.hidden = false;
    } else {
      var loaded = false;
      var load = function () {
        if (loaded) return;
        loaded = true;
        var s = document.createElement("script");
        s.src = "https://cusdis.com/js/cusdis.es.js";
        s.async = true;
        s.defer = true;
        document.body.appendChild(s);
      };

      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) { load(); io.disconnect(); return; }
          }
        }, { rootMargin: "200px" });
        io.observe(thread);
      } else {
        load();
      }
    }
  }
})();
