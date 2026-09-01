/* Renders release data from versions.js.
 *
 * Two jobs, one file: the "latest version" badge on the homepage, and the full
 * list on versions.html. Both read the same array, so a release is described in
 * exactly one place.
 */
(function () {
  "use strict";

  var releases = window.MPTREE_VERSIONS || [];
  var repo     = window.MPTREE_REPO || "";
  if (!releases.length) return;

  var latest = releases[0];

  // Points at the version-stamped asset, not the plain MPTree.apk that the main
  // Download button uses. GitHub is a different origin, so the `download`
  // attribute cannot rename the file: without a distinct name on the release
  // itself, grabbing two versions here just yields MPTree.apk and MPTree (1).apk.
  function apkUrl(rel) {
    return "https://github.com/" + repo + "/releases/download/" + rel.tag +
           "/MPTree-" + rel.version + ".apk";
  }

  // "2026-09-01" → "1 September 2026". Built from the parts rather than parsed
  // as a Date, so it reads the same in every timezone.
  var MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
  function pretty(iso) {
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return Number(p[2]) + " " + MONTHS[Number(p[1]) - 1] + " " + p[0];
  }

  // ── Homepage badge ───────────────────────────────────────────────────────
  var badge = document.getElementById("latest-version");
  if (badge) {
    badge.textContent = "Version " + latest.version;
    var dateEl = document.getElementById("latest-date");
    if (dateEl) dateEl.textContent = pretty(latest.date);
  }

  // ── versions.html list ───────────────────────────────────────────────────
  var list = document.getElementById("rel-list");
  if (!list) return;

  list.innerHTML = "";
  releases.forEach(function (rel, i) {
    var li = document.createElement("li");
    li.className = "rel";

    var head = document.createElement("div");
    head.className = "rel-head";

    var left = document.createElement("div");
    var h3 = document.createElement("h3");
    h3.textContent = rel.version;
    left.appendChild(h3);

    var meta = document.createElement("p");
    meta.className = "rel-meta";
    meta.textContent = pretty(rel.date);
    left.appendChild(meta);
    head.appendChild(left);

    var tags = document.createElement("div");
    tags.className = "rel-tags";
    if (i === 0) {
      var cur = document.createElement("span");
      cur.className = "rel-tag rel-tag-now";
      cur.textContent = "Latest";
      tags.appendChild(cur);
    }
    var ch = document.createElement("span");
    ch.className = "rel-tag";
    ch.textContent = rel.channel === "beta" ? "Beta, website only" : "Play Store";
    tags.appendChild(ch);
    head.appendChild(tags);
    li.appendChild(head);

    if (rel.notes && rel.notes.length) {
      var ul = document.createElement("ul");
      ul.className = "rel-notes";
      rel.notes.forEach(function (n) {
        var item = document.createElement("li");
        item.textContent = n;
        ul.appendChild(item);
      });
      li.appendChild(ul);
    }

    var a = document.createElement("a");
    a.className = i === 0 ? "btn btn-sm" : "btn btn-sm btn-ghost";
    a.href = apkUrl(rel);
    a.textContent = "Download " + rel.version;
    li.appendChild(a);

    list.appendChild(li);
  });
})();
