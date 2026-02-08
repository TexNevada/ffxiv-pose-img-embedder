"""
Simple test runner that runs every Python file under `tests/tests/`.

Usage (from repo root on Windows PowerShell):
    python .\tests\run-tests.py

It will execute each test file in the `tests/` directory (so relative test assets like
`./test-files/*` resolve correctly), print a PASS/FAIL per test, and exit with
non-zero code if any test failed.
"""
from __future__ import annotations
import sys
import subprocess
from pathlib import Path
import argparse
from typing import List, Tuple


def discover_tests(tests_tests_dir: Path) -> List[Path]:
    """Return all .py files under tests_tests_dir (recursively), skipping __init__.py."""
    if not tests_tests_dir.exists():
        return []
    files = sorted(p for p in tests_tests_dir.rglob("*.py") if p.name != "__init__.py")
    return files


def run_test(test_path: Path, cwd: Path, timeout: int = 300) -> Tuple[int, str, str]:
    """Run a single test file in a subprocess.

    Returns (exit_code, stdout, stderr). Timeout is in seconds.
    """
    cmd = [sys.executable, str(test_path)]
    try:
        completed = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return completed.returncode, completed.stdout, completed.stderr
    except subprocess.TimeoutExpired as exc:
        # subprocess.run doesn't produce stdout/stderr when timed out in this except branch
        out = getattr(exc, "output", "") or ""
        err = getattr(exc, "stderr", "") or f"Test timed out after {timeout} seconds."
        return 124, out, err
    except Exception as exc:  # pragma: no cover - defensive
        return 125, "", f"Runner error: {exc!r}"


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run all Python test scripts under tests/tests/")
    parser.add_argument("--fail-fast", action="store_true", help="Stop on first failure")
    parser.add_argument("--pattern", type=str, default=None, help="Only run tests with this substring in filename")
    parser.add_argument("--timeout", type=int, default=300, help="Per-test timeout in seconds")
    args = parser.parse_args(argv)

    # Determine paths relative to this script file.
    tests_root = Path(__file__).resolve().parent  # .../tests
    tests_tests_dir = tests_root / "tests"

    if not tests_tests_dir.exists():
        print(f"Error: expected tests directory at {tests_tests_dir}")
        return 2

    tests = discover_tests(tests_tests_dir)
    if args.pattern:
        tests = [t for t in tests if args.pattern in t.name]

    if not tests:
        print("No test files found under", tests_tests_dir)
        return 0

    total = len(tests)
    failed = 0

    print(f"Running {total} tests from {tests_tests_dir} (cwd for tests: {tests_root})")

    for test in tests:
        print("\n---")
        print(f"Running: {test.relative_to(tests_root.parent)}")
        rc, out, err = run_test(test, cwd=tests_root, timeout=args.timeout)
        if rc == 0:
            print(f"PASS: {test.name}")
        else:
            failed += 1
            print(f"FAIL: {test.name} (exit code {rc})")
            if out:
                print("--- stdout ---")
                print(out)
            if err:
                print("--- stderr ---")
                print(err)
            if args.fail_fast:
                print("Fail-fast engaged, stopping.")
                break

    print("\n=== Summary ===")
    print(f"Total: {total}")
    print(f"Passed: {total - failed}")
    print(f"Failed: {failed}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

