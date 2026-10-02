import assert from "node:assert/strict";
import { test } from "node:test";

import { noticeHeadline, noticePrefix } from "../../docs/notice-rules.js";

test("a format notice keeps the warning to check the playoff format", () => {
  const headline = noticeHeadline([{ kind: "serie-c" }, { kind: "formula" }]);

  assert.equal(headline.title, "La FIP Sardegna ha pubblicato nuove comunicazioni su formula, playoff o playout.");
  assert.equal(headline.hint, "Verifica se la formula descritta qui sotto è cambiata:");
});

test("only league news and comunicati: neutral title, no format warning", () => {
  const headline = noticeHeadline([{ kind: "serie-c" }, { kind: "comunicato" }]);

  assert.equal(headline.title, "Comunicazioni della FIP Sardegna sulla Serie C regionale.");
  assert.equal(headline.hint, "");
});

test("notices saved before kinds existed count as format notices", () => {
  assert.equal(noticeHeadline([{}]).hint, "Verifica se la formula descritta qui sotto è cambiata:");
});

test("official comunicati are labelled as such, other kinds are not", () => {
  assert.equal(noticePrefix("comunicato"), "Comunicato ufficiale: ");
  for (const kind of ["formula", "serie-c", undefined, "toString"]) {
    assert.equal(noticePrefix(kind), "", String(kind));
  }
});
