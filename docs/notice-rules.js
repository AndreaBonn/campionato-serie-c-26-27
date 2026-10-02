// Pure rules of the FIP Sardegna notices box: no DOM, no browser API, tested with node --test.

// data.json `kind` values (notices.py KIND_*); notices saved before kinds existed have none
const FORMULA = "formula";
const COMUNICATO = "comunicato";

const isFormula = (notice) => (notice.kind ?? FORMULA) === FORMULA;

// The format warning only makes sense when a notice is about format, playoff or playout.
export function noticeHeadline(notices) {
  if (notices.some(isFormula)) {
    return {
      title: "La FIP Sardegna ha pubblicato nuove comunicazioni su formula, playoff o playout.",
      hint: "Verifica se la formula descritta qui sotto è cambiata:",
    };
  }
  return { title: "Comunicazioni della FIP Sardegna sulla Serie C regionale.", hint: "" };
}

export function noticePrefix(kind) {
  return kind === COMUNICATO ? "Comunicato ufficiale: " : "";
}
