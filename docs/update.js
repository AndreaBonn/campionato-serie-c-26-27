// Registers the service worker and announces a new release; the rules live in update-rules.js.
import { isCheckDue, shouldAnnounce, shouldReloadOnControllerChange } from "./update-rules.js";

function setupUpdates() {
  const sw = navigator.serviceWorker;
  const notice = document.getElementById("update-notice");
  const apply = document.getElementById("update-apply");
  let registration = null;
  let lastCheck = null;
  let reloading = false;
  // false on a first visit: the first worker claiming the page is not an update
  let controlled = sw.controller !== null;

  function announce() {
    if (!registration) return;
    const waiting = registration.waiting !== null;
    if (shouldAnnounce({ waiting, controlled: sw.controller !== null })) notice.hidden = false;
  }

  // updatefound fires while the worker is still installing; "installed" is only visible here
  function watch(worker) {
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") announce();
    });
  }

  function checkForUpdate() {
    const now = Date.now();
    if (!registration || !isCheckDue({ now, lastCheck })) return;
    lastCheck = now;
    registration.update().catch((err) => console.warn("controllo aggiornamenti non riuscito", err));
  }

  apply.onclick = () => {
    // another tab already accepted: its controllerchange reload reaches this tab too
    if (!registration?.waiting) {
      notice.hidden = true;
      return;
    }
    apply.disabled = true;
    apply.textContent = "Aggiornamento…";
    // the reload happens on controllerchange, once the new version is in control
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };
  document.getElementById("update-later").onclick = () => {
    notice.hidden = true;
  };

  // fires in every open tab: all of them must leave the old code behind
  sw.addEventListener("controllerchange", () => {
    const wasControlled = controlled;
    controlled = true;
    if (!shouldReloadOnControllerChange({ hadController: wasControlled, reloading })) return;
    reloading = true;
    location.reload();
  });

  // an installed app is reopened by bringing it back to the foreground
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    announce();
    checkForUpdate();
  });

  sw.register("sw.js")
    .then((reg) => {
      registration = reg;
      if (reg.installing) watch(reg.installing);
      reg.addEventListener("updatefound", () => watch(reg.installing));
      announce();
      checkForUpdate();
    })
    .catch((err) => console.warn("service worker non registrato", err));
}

// file:// pages and old browsers have no service worker: the page works without updates
if ("serviceWorker" in navigator) setupUpdates();
