import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCheckDue,
  MIN_CHECK_INTERVAL_MS,
  shouldAnnounce,
  shouldReloadOnControllerChange,
} from "../../docs/update-rules.js";

test("announces a waiting version when the page was already controlled", () => {
  assert.equal(shouldAnnounce({ waiting: true, controlled: true }), true);
});

test("first visit: nothing to announce even while the first worker installs", () => {
  assert.equal(shouldAnnounce({ waiting: true, controlled: false }), false);
});

test("nothing waiting: nothing to announce", () => {
  assert.equal(shouldAnnounce({ waiting: false, controlled: true }), false);
});

test("first check of the session is always due", () => {
  assert.equal(isCheckDue({ now: 1_000, lastCheck: null }), true);
});

test("quick app switches do not hit the server again", () => {
  const lastCheck = 1_000_000;

  assert.equal(isCheckDue({ now: lastCheck + MIN_CHECK_INTERVAL_MS - 1, lastCheck }), false);
});

test("a check is due again once the interval has passed", () => {
  const lastCheck = 1_000_000;

  assert.equal(isCheckDue({ now: lastCheck + MIN_CHECK_INTERVAL_MS, lastCheck }), true);
});

test("control handover after an accepted update reloads the page", () => {
  assert.equal(shouldReloadOnControllerChange({ hadController: true, reloading: false }), true);
});

test("first visit: the first worker claiming the page does not reload it", () => {
  assert.equal(shouldReloadOnControllerChange({ hadController: false, reloading: false }), false);
});

test("a repeated handover does not reload twice", () => {
  assert.equal(shouldReloadOnControllerChange({ hadController: true, reloading: true }), false);
});
