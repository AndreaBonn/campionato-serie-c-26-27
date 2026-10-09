import json
from pathlib import Path

from fip_calendar import badges
from fip_calendar.badges import (
    ResultCounts,
    badge_for_coverage,
    badge_for_tests,
    count_junit,
    read_coverage,
)

PYTEST_XML = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="4">
<testcase classname="t" name="ok1"/>
<testcase classname="t" name="ok2"/>
<testcase classname="t" name="bad"><failure message="x">trace</failure></testcase>
<testcase classname="t" name="skip"><skipped message="s"/></testcase>
</testsuite></testsuites>
"""

NODE_XML = """<?xml version="1.0" encoding="utf-8"?>
<testsuites>
<testcase name="a" classname="test"/>
<testcase name="b" classname="test"><error message="boom"/></testcase>
</testsuites>
"""


def write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def test_count_junit_sorts_cases_into_passed_failed_skipped(tmp_path: Path) -> None:
    report = write(tmp_path / "pytest.xml", PYTEST_XML)

    assert count_junit(report) == ResultCounts(passed=2, failed=1, skipped=1)


def test_count_junit_counts_errors_as_failures_in_node_layout(tmp_path: Path) -> None:
    report = write(tmp_path / "node.xml", NODE_XML)

    assert count_junit(report) == ResultCounts(passed=1, failed=1, skipped=0)


def test_count_junit_missing_report_is_none(tmp_path: Path) -> None:
    assert count_junit(tmp_path / "absent.xml") is None


def test_count_junit_truncated_report_is_none(tmp_path: Path) -> None:
    report = write(tmp_path / "cut.xml", "<testsuites><testcase name=")

    assert count_junit(report) is None


def test_test_counts_add_up_across_suites() -> None:
    first = ResultCounts(passed=2, failed=1, skipped=0)
    second = ResultCounts(passed=3, failed=0, skipped=1)

    total = first + second

    assert total == ResultCounts(passed=5, failed=1, skipped=1)


def test_tests_badge_all_passing_is_green_with_count() -> None:
    badge = badge_for_tests(ResultCounts(passed=455, failed=0, skipped=0))

    assert badge["message"] == "455 passed"
    assert badge["color"] == "brightgreen"
    assert badge["label"] == "tests"
    assert badge["schemaVersion"] == 1


def test_tests_badge_with_failures_is_red_and_shows_both_counts() -> None:
    badge = badge_for_tests(ResultCounts(passed=450, failed=5, skipped=0))

    assert badge["message"] == "5 failed, 450 passed"
    assert badge["color"] == "red"


def test_tests_badge_reports_skipped_without_turning_red() -> None:
    badge = badge_for_tests(ResultCounts(passed=10, failed=0, skipped=2))

    assert badge["message"] == "10 passed, 2 skipped"
    assert badge["color"] == "brightgreen"


def test_tests_badge_without_reports_says_error() -> None:
    badge = badge_for_tests(None)

    assert badge["message"] == "error"
    assert badge["color"] == "red"


def test_tests_badge_with_no_tests_run_says_error() -> None:
    assert badge_for_tests(ResultCounts(passed=0, failed=0, skipped=0))["message"] == "error"


def test_read_coverage_takes_the_exact_total(tmp_path: Path) -> None:
    report = write(tmp_path / "coverage.json", json.dumps({"totals": {"percent_covered": 92.64}}))

    assert read_coverage(report) == 92.64


def test_read_coverage_missing_report_is_none(tmp_path: Path) -> None:
    assert read_coverage(tmp_path / "absent.json") is None


def test_coverage_badge_formats_percent_and_picks_color() -> None:
    assert badge_for_coverage(92.64) == {
        "schemaVersion": 1,
        "label": "coverage",
        "message": "92%",
        "color": "brightgreen",
    }
    assert badge_for_coverage(85.0)["color"] == "green"
    assert badge_for_coverage(72.0)["color"] == "yellow"
    assert badge_for_coverage(40.0)["color"] == "red"


def test_coverage_badge_never_rounds_up_to_full_coverage() -> None:
    assert badge_for_coverage(99.6)["message"] == "99%"


def test_coverage_badge_without_report_says_unknown() -> None:
    badge = badge_for_coverage(None)

    assert badge["message"] == "unknown"
    assert badge["color"] == "lightgrey"


def test_main_writes_both_badge_files(tmp_path: Path) -> None:
    py = write(tmp_path / "pytest.xml", PYTEST_XML)
    node = write(tmp_path / "node.xml", NODE_XML)
    cov = write(tmp_path / "coverage.json", json.dumps({"totals": {"percent_covered": 90.2}}))
    out = tmp_path / "badges"

    code = badges.main(
        ["--junit", str(py), "--junit", str(node), "--coverage", str(cov), "--out", str(out)]
    )

    assert code == 0
    tests = json.loads((out / "tests.json").read_text(encoding="utf-8"))
    coverage = json.loads((out / "coverage.json").read_text(encoding="utf-8"))
    assert tests["message"] == "2 failed, 3 passed, 1 skipped"
    assert coverage["message"] == "90%"


def test_main_with_one_report_missing_says_error(tmp_path: Path) -> None:
    py = write(tmp_path / "pytest.xml", PYTEST_XML)
    out = tmp_path / "badges"

    badges.main(
        [
            "--junit",
            str(py),
            "--junit",
            str(tmp_path / "absent.xml"),
            "--coverage",
            str(tmp_path / "absent.json"),
            "--out",
            str(out),
        ]
    )

    tests = json.loads((out / "tests.json").read_text(encoding="utf-8"))
    assert tests["message"] == "error"
