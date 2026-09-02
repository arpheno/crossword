"""Validate the repository's pinned local development toolchain."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_pin(name: str) -> str:
    for line in (ROOT / name).read_text(encoding="utf-8").splitlines():
        value = line.split("#", 1)[0].strip()
        if value:
            return value
    raise ValueError(f"{name} is empty")


def command_version(command: str, flag: str = "--version") -> str:
    result = subprocess.run(
        [command, flag],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"{command} {flag} failed: {detail}")
    return (result.stdout or result.stderr).strip().removeprefix("v")


def node_package_manager() -> str:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    value = package.get("packageManager", "")
    if "@" not in value:
        raise ValueError("package.json must declare packageManager as name@version")
    return value.rsplit("@", 1)[1]


def python_version() -> str:
    return ".".join(str(part) for part in sys.version_info[:3])


def main() -> int:
    failures: list[str] = []
    expected_node = read_pin(".node-version")
    expected_python = read_pin(".python-version")
    expected_npm = node_package_manager()

    actual_node = command_version("node")
    actual_npm = command_version("npm")
    actual_python = python_version()
    uv_version = command_version("uv")

    print(f"Node:   {actual_node} (pinned {expected_node})")
    print(f"npm:    {actual_npm} (pinned {expected_npm})")
    print(f"Python: {actual_python} (pinned {expected_python})")
    print(f"uv:     {uv_version}")

    if actual_node != expected_node:
        failures.append(f"Node mismatch: activate .node-version {expected_node}")
    if actual_npm != expected_npm:
        failures.append(f"npm mismatch: enable packageManager npm@{expected_npm}")
    if not (actual_python == expected_python or actual_python.startswith(f"{expected_python}.")):
        failures.append(f"Python mismatch: run uv sync with .python-version {expected_python}")
    if Path(sys.prefix).resolve() == Path(sys.base_prefix).resolve():
        failures.append("uv is not using the project .venv: run make setup")
    for lockfile in ("package-lock.json", "uv.lock"):
        if not (ROOT / lockfile).is_file():
            failures.append(f"Missing {lockfile}: restore the lockfile before setup")

    if failures:
        print("Doctor found problems:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("Doctor: toolchain and lockfiles are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())