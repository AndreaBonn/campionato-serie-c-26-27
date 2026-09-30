from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CALENDAR_PATH = ROOT / "data" / "calendario-comunicato.json"
OUTPUT_PATH = ROOT / "docs" / "data.json"

FIP_RESULTS_URL = "https://fip.it/risultati/"
# Serie C regionale Sardegna 2026/27, read from the fip.it/risultati menu
FIP_QUERY = {
    "group": "campionati-regionali",
    "regione_codice": "SA",
    "comitato_codice": "RSA",
    "sesso": "M",
    "codice_campionato": "C1",
    "codice_fase": "1",
    "codice_girone": "85305",
}
FIRST_HALF_CODE = 1  # fip.it uses codice_ar=1 for andata, 0 for ritorno
SECOND_HALF_CODE = 0

USER_AGENT = "campionato-serie-c-26-27 calendar sync (personal, 6 runs/day)"
REQUEST_TIMEOUT_S = 30
REQUEST_DELAY_S = 1.0
