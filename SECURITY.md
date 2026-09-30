# Sicurezza

## Versioni supportate

Il progetto non ha release numerate. Le correzioni di sicurezza si applicano all'ultimo commit su `main`, che è anche la versione pubblicata su GitHub Pages.

## Segnalare una vulnerabilità

Per segnalare una vulnerabilità usa [GitHub Security Advisories](https://github.com/AndreaBonn/campionato-serie-c-26-27/security/advisories/new), non una issue pubblica.

Includi:

- descrizione del problema;
- passi per riprodurlo;
- comportamento atteso e comportamento osservato;
- cosa potrebbe ottenere chi lo sfrutta.

Tempi di risposta:

- presa in carico entro 72 ore;
- correzione dei problemi critici entro 30 giorni;
- divulgazione pubblica concordata dopo la correzione.

## Superficie

La pagina è statica e non ha login, form, cookie né segreti lato client. L'unico input esterno sono i dati letti da fip.it e dall'API WordPress della FIP Sardegna durante la sincronizzazione su GitHub Actions.

## Misure di sicurezza implementate

- **Escape dell'HTML**: i testi provenienti da fip.it passano per la funzione `esc` prima di essere inseriti con `innerHTML` (`docs/index.html:180`).
- **Filtro sui link esterni**: le comunicazioni della FIP Sardegna vengono accettate solo se il link inizia con `https://sardegna.fip.it/`, perché la pagina lo usa come `href` (`src/fip_calendar/notices.py:33`).
- **Permessi minimi del workflow**: `contents: read` come default, `contents: write` solo per il job di sincronizzazione, `pages: write` e `id-token: write` solo per il deploy (`.github/workflows/sync-fip.yml`).
- **Action pinnate a SHA** e checkout con `persist-credentials: false` (`.github/workflows/sync-fip.yml`).
- **Dipendenze bloccate**: `uv.lock` versionato, installato in CI con `uv sync --frozen`.

Mancano una Content-Security-Policy sulla pagina e una scansione automatica delle dipendenze (Dependabot o simili).

## Fuori ambito

- Errori o ritardi nei dati pubblicati dalla FIP.
- Self-XSS, cioè attacchi che richiedono alla vittima di incollare codice nella propria console.
- Vulnerabilità già note in dipendenze di terze parti: vanno segnalate ai rispettivi manutentori.
- Disponibilità di GitHub Pages e GitHub Actions.

---

[Torna al README](./README.md)
