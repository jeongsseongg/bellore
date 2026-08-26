#!/usr/bin/env python3
"""Block preview and deployment commands from a pre-release Bellore tree."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


SCRIPT_ROOT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("BELLORE_GUARD_REPO_ROOT", SCRIPT_ROOT)).resolve()
BASE_FILE = SCRIPT_ROOT / ".brain" / "LATEST_PUBLIC_BASE.json"
GUARDED_COMMAND_MARKERS = (
    "http.server",
    "npm run preview",
    "vite preview",
    "vite --host",
    "serve-preview",
    "start-preview",
    "git push",
    "pages-deploy",
    "deploy-pages",
    "firebase deploy",
    "wrangler pages deploy",
    "gh workflow run",
)


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=False
    )


def minimum_sha() -> str:
    try:
        data = json.loads(BASE_FILE.read_text(encoding="utf-8"))
        value = str(data.get("minimumPublicSha", "")).strip().lower()
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"최소 공개 기준 파일을 읽을 수 없습니다: {error}") from error
    if len(value) != 40 or any(char not in "0123456789abcdef" for char in value):
        raise RuntimeError("minimumPublicSha는 40자리 소문자 Git SHA여야 합니다.")
    return value


def assert_current_base() -> None:
    required = minimum_sha()
    exists = git("cat-file", "-e", f"{required}^{{commit}}")
    if exists.returncode != 0:
        raise RuntimeError(f"최소 공개 기준 커밋을 찾을 수 없습니다: {required}")
    ancestor = git("merge-base", "--is-ancestor", required, "HEAD")
    if ancestor.returncode != 0:
        head = git("rev-parse", "--short=12", "HEAD").stdout.strip() or "unknown"
        raise RuntimeError(
            "구버전 작업트리에서는 미리보기·배포를 실행할 수 없습니다. "
            f"현재 HEAD={head}, 최소 기준={required[:12]}"
        )


def hook_command() -> str:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return ""
    tool_input = payload.get("tool_input") or {}
    return str(tool_input.get("command") or tool_input.get("cmd") or "")


def main() -> int:
    global ROOT
    parser = argparse.ArgumentParser()
    parser.add_argument("--hook", action="store_true")
    parser.add_argument("--check-current", action="store_true")
    parser.add_argument("--repo-root")
    args = parser.parse_args()
    if args.repo_root:
        ROOT = Path(args.repo_root).resolve()
    if args.hook:
        command = hook_command().lower()
        if not any(marker in command for marker in GUARDED_COMMAND_MARKERS):
            return 0
    try:
        assert_current_base()
    except RuntimeError as error:
        print(f"BELLORE_RELEASE_BASE_BLOCKED: {error}", file=sys.stderr)
        return 86
    print("BELLORE_RELEASE_BASE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
