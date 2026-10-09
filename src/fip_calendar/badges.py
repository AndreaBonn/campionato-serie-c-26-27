import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
FAILED_TAGS = ("failure", "error")
SKIPPED_TAG = "skipped"
# lowest coverage percent for each color, checked in order
COVERAGE_COLORS = ((90, "brightgreen"), (80, "green"), (70, "yellow"), (60, "orange"))
COVERAGE_FALLBACK_COLOR = "red"


@dataclass(frozen=True)
class ResultCounts:
    passed: int
    failed: int
    skipped: int

    def __add__(self, other: "ResultCounts") -> "ResultCounts":
        return ResultCounts(
            passed=self.passed + other.passed,
            failed=self.failed + other.failed,
            skipped=self.skipped + other.skipped,
        )


def count_junit(path: Path) -> ResultCounts | None:
    """Count the test cases of a JUnit XML report (pytest or node --test).

    Returns None when the report is missing or unreadable, i.e. the runner
    crashed before writing it: that is not the same as zero failures.
    """
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        return None
    passed = failed = skipped = 0
    for case in root.iter("testcase"):
        if any(case.find(tag) is not None for tag in FAILED_TAGS):
            failed += 1
        elif case.find(SKIPPED_TAG) is not None:
            skipped += 1
        else:
            passed += 1
    return ResultCounts(passed=passed, failed=failed, skipped=skipped)


def read_coverage(path: Path) -> float | None:
    """Total percent from a `coverage json` report, None when it is missing."""
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
        return float(report["totals"]["percent_covered"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _badge(label: str, message: str, color: str) -> dict[str, Any]:
    # shields.io endpoint schema: https://shields.io/badges/endpoint-badge
    return {"schemaVersion": SCHEMA_VERSION, "label": label, "message": message, "color": color}


def badge_for_tests(counts: ResultCounts | None) -> dict[str, Any]:
    if counts is None or counts.passed + counts.failed + counts.skipped == 0:
        return _badge(label="tests", message="error", color="red")
    parts = [f"{counts.passed} passed"]
    if counts.failed:
        parts.insert(0, f"{counts.failed} failed")
    if counts.skipped:
        parts.append(f"{counts.skipped} skipped")
    color = "red" if counts.failed else "brightgreen"
    return _badge(label="tests", message=", ".join(parts), color=color)


def badge_for_coverage(percent: float | None) -> dict[str, Any]:
    # floored, so 99.6% never shows as 100%
    if percent is None:
        return _badge(label="coverage", message="unknown", color="lightgrey")
    color = next(
        (name for floor, name in COVERAGE_COLORS if percent >= floor), COVERAGE_FALLBACK_COLOR
    )
    return _badge(label="coverage", message=f"{math.floor(percent)}%", color=color)


def _total(reports: list[Path]) -> ResultCounts | None:
    counts = [count_junit(path) for path in reports]
    if not counts or any(c is None for c in counts):
        return None
    return sum((c for c in counts if c is not None), ResultCounts(passed=0, failed=0, skipped=0))


def _write_json(path: Path, content: dict[str, Any]) -> None:
    path.write_text(json.dumps(content, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write shields.io endpoint badges")
    parser.add_argument("--junit", type=Path, action="append", default=[], required=True)
    parser.add_argument("--coverage", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    tests = badge_for_tests(_total(args.junit))
    coverage = badge_for_coverage(read_coverage(args.coverage))
    _write_json(path=args.out / "tests.json", content=tests)
    _write_json(path=args.out / "coverage.json", content=coverage)
    print(f"tests: {tests['message']} | coverage: {coverage['message']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
