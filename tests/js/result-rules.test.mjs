import assert from "node:assert/strict";
import { test } from "node:test";

import { resultNote } from "../../docs/result-rules.js";

test("unofficial result: short tag and a label saying it awaits validation", () => {
  assert.deepEqual(resultNote("ufficioso"), {
    tag: "ufficioso",
    label: "risultato ufficioso, in attesa di omologazione",
    warn: false,
  });
});

test("suspended validation is flagged as a warning: the result may still change", () => {
  assert.deepEqual(resultNote("sospesa"), {
    tag: "omologazione sospesa",
    label: "omologazione sospesa, il risultato può ancora cambiare",
    warn: true,
  });
});

test("validated result carries no note: it is the final one", () => {
  assert.equal(resultNote("omologata"), null);
});

test("statuses before the game carry no result note", () => {
  for (const status of ["designata", "designata-nonvisibile", "non-designata", ""]) {
    assert.equal(resultNote(status), null, status);
  }
});

test("unknown status or inherited object key is not mistaken for a note", () => {
  for (const status of ["nuovo-stato", "toString", "constructor", undefined]) {
    assert.equal(resultNote(status), null, String(status));
  }
});
