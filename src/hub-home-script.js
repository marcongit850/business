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
  var installCard = document.querySelector(".install-card");
  if (installCard && installed()) installCard.hidden = true;

  var steps = document.querySelector(".install-steps-list");
  if (steps && platform() === "android") {
    var android = steps.querySelector('[data-platform="android"]');
    if (android) steps.insertBefore(android, steps.firstChild);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
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
