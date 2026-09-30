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

USER_AGENT = "campionato-serie-c-26-27 calendar sync (personal project)"
REQUEST_TIMEOUT_S = 30
REQUEST_DELAY_S = 1.0

PAGE_URL = "https://andreabonn.github.io/campionato-serie-c-26-27/"
ICS_PATH = ROOT / "docs" / "calendario.ics"

FIP_SARDEGNA_POSTS_URL = "https://sardegna.fip.it/wp-json/wp/v2/posts"
# Full-text searches that may surface the 2026/27 format; titles are filtered afterwards
NOTICE_SEARCH_TERMS = ("formula", "playoff", "playout")
# Posts before the 2026/27 calendar (23/09/2026) belong to the previous season
NOTICE_SINCE = "2026-09-23T00:00:00"
NOTICE_SEARCH_LIMIT = 20
# Last successful sync; not committed, published with the Pages artifact on every run
STATUS_PATH = ROOT / "docs" / "status.json"
