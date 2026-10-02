// Pure rules on how final a fip.it result is: no DOM, no browser API, tested with node --test.

// fip.it status classes of a played game the Giudice Sportivo has not validated (yet).
// "omologata" needs no note: it is the final result. Its fip.it text ("con provvedimenti
// disciplinari") is the legend of the whole status class, not a fact about that game.
const RESULT_NOTES = {
  ufficioso: {
    tag: "ufficioso",
    label: "risultato ufficioso, in attesa di omologazione",
    warn: false,
  },
  sospesa: {
    tag: "omologazione sospesa",
    label: "omologazione sospesa, il risultato può ancora cambiare",
    warn: true,
  },
};

export function resultNote(status) {
  return Object.hasOwn(RESULT_NOTES, status) ? RESULT_NOTES[status] : null;
}
