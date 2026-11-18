// Inline script for the member hub home. Kept as a string so the page can ship it
// without a separate request, and so tests can read the same source.
export const HUB_HOME_SCRIPT = `(function () {
  function platform() {
    var ua = navigator.userAgent || "";
    var touch = navigator.maxTouchPoints || 0;
    var appleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && touch > 1);
    if (appleMobile) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "other";
  }
  function installed() {
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    return window.navigator.standalone === true || standalone === true;
  }
  var pointsRoot = document.getElementById("hub-points");
  function postPoints(kind) {
    if (!pointsRoot) return Promise.resolve(null);
    var body = new URLSearchParams();
    body.set("csrf", pointsRoot.getAttribute("data-csrf") || "");
    body.set("kind", kind);
    body.set("network", pointsRoot.getAttribute("data-network") || "");
    return fetch("/api/hub/points", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: body.toString(),
    }).then(function (response) {
      return response.ok ? response.json() : null;
    }).catch(function () { return null; });
  }
  function paintPoints(data) {
    if (!data || !pointsRoot) return;
    var total = pointsRoot.querySelector("[data-points-total]");
    if (total && data.total != null) total.textContent = String(data.total);
    var line = pointsRoot.querySelector("[data-points-breakdown]");
    var breakdown = data.breakdown;
    if (line && breakdown) {
      line.textContent = "Welcome bonus " + (breakdown.welcome || 0) + ". Referrals " + (breakdown.referral || 0) + ". App install " + (breakdown.install || 0) + ". Facebook " + (breakdown.facebook || 0) + ". LinkedIn " + (breakdown.linkedin || 0) + ".";
    }
    if (data.awarded && data.breakdown && data.breakdown.install) pointsRoot.setAttribute("data-installed", "1");
  }
  var installCard = document.querySelector(".install-card");
  if (installCard && installed()) installCard.hidden = true;
  if (installed() && pointsRoot && pointsRoot.getAttribute("data-installed") !== "1") {
    postPoints("install").then(paintPoints);
  }

  var steps = document.querySelector(".install-steps-list");
  if (steps && platform() === "android") {
    var android = steps.querySelector('[data-platform="android"]');
    if (android) steps.insertBefore(android, steps.firstChild);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var follow = target.closest("[data-follow]");
    if (follow) {
      if (follow.disabled) return;
      var kind = follow.getAttribute("data-follow") || "";
      follow.disabled = true;
      postPoints(kind).then(function (data) {
        paintPoints(data);
        var status = document.querySelector("[data-follow-status]");
        if (data && (data.awarded || data.already)) {
          follow.textContent = kind === "linkedin" ? "Followed on LinkedIn" : "Followed on Facebook";
          if (status) status.textContent = data.awarded ? "2 points added." : "Already recorded.";
        } else {
          follow.disabled = false;
        }
      });
      return;
    }
    var opener = target.closest("[data-open-dialog]");
    if (opener) {
      var dialog = document.getElementById(opener.getAttribute("data-open-dialog"));
      if (dialog && dialog.showModal) dialog.showModal();
      var copied = document.getElementById("invite-copied");
      if (copied) copied.hidden = true;
      return;
    }
    var closer = target.closest("[data-close-dialog]");
    if (closer && closer.closest) {
      var open = closer.closest("dialog");
      if (open && open.close) open.close();
    }
  });
  var dialogs = document.querySelectorAll("dialog.hub-dialog");
  for (var i = 0; i < dialogs.length; i++) {
    dialogs[i].addEventListener("click", function (event) {
      if (event.target === this) this.close();
    });
  }

  var deferred = null;
  var installButton = document.getElementById("install-app-button");
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferred = event;
    if (installButton) installButton.hidden = false;
  });
  if (installButton) {
    installButton.addEventListener("click", function () {
      if (!deferred) return;
      var promptEvent = deferred;
      deferred = null;
      installButton.hidden = true;
      promptEvent.prompt();
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  var textLink = document.getElementById("invite-text");
  if (textLink) {
    var iosHref = textLink.getAttribute("data-ios");
    var androidHref = textLink.getAttribute("data-android");
    textLink.setAttribute("href", platform() === "ios" ? iosHref : androidHref);
  }

  var copyButton = document.getElementById("invite-copy");
  var copiedNote = document.getElementById("invite-copied");
  if (copyButton) {
    copyButton.addEventListener("click", function () {
      var url = copyButton.getAttribute("data-url") || "";
      var showCopied = function () {
        if (copiedNote) copiedNote.hidden = false;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showCopied).catch(function () {});
      }
    });
  }

  var more = document.getElementById("invite-more");
  if (more && typeof navigator.share === "function") {
    more.hidden = false;
    more.addEventListener("click", function () {
      navigator.share({
        title: more.getAttribute("data-title") || "",
        text: more.getAttribute("data-text") || "",
        url: more.getAttribute("data-url") || "",
      }).catch(function () {});
    });
  }
})();`;
