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
})();
