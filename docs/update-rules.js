// Pure rules of the update notice: no DOM, no browser API, tested with node --test.

// switching between apps fires visibilitychange often: ask the server at most every 10 minutes
export const MIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;

// A waiting worker on a page nobody controlled yet is the first install, not an update.
export function shouldAnnounce({ waiting, controlled }) {
  return waiting && controlled;
}

export function isCheckDue({ now, lastCheck }) {
  return lastCheck === null || now - lastCheck >= MIN_CHECK_INTERVAL_MS;
}

// Every tab reloads when the accepted version takes over, once, and never on a first visit.
export function shouldReloadOnControllerChange({ hadController, reloading }) {
  return hadController && !reloading;
}
