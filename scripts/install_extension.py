#!/usr/bin/env python3
"""Publish a complete GNOME extension directory without exposing partial files.

GNOME Shell reads extension metadata at login.  Writing metadata.json in place
with `install` can therefore expose a zero-byte file if the Shell scans while an
upgrade is running.  This helper stages and validates the whole extension next
to the extensions directory, then publishes it with directory renames.  If the
final rename fails, the previous complete directory is restored.

Only the extension payload is handled here.  Settings/shelf data live elsewhere
and are never touched.  Linux-only (GNOME Shell target).
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def _remove(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)


def _validate_metadata(source: Path, uuid: str) -> dict:
    metadata = json.loads((source / "metadata.json").read_text(encoding="utf-8"))
    if not isinstance(metadata, dict):
        raise ValueError("metadata.json must contain an object")
    if metadata.get("uuid") != uuid:
        raise ValueError(f"metadata UUID does not match {uuid}")
    for key in ("name", "description"):
        if not isinstance(metadata.get(key), str) or not metadata[key]:
            raise ValueError(f"metadata.json is missing a valid {key!r}")
    versions = metadata.get("shell-version")
    if (
        not isinstance(versions, list)
        or not versions
        or not all(isinstance(v, str) for v in versions)
    ):
        raise ValueError("metadata.json is missing a valid shell-version array")
    if not isinstance(metadata.get("version"), int):
        raise ValueError("metadata.json is missing an integer build version")
    for name in ("extension.js", "prefs.js", "stylesheet.css"):
        if not (source / name).is_file():
            raise ValueError(f"Extension payload is missing {name}")
    if not (source / "schemas").is_dir():
        raise ValueError("Extension payload is missing schemas/")
    return metadata


def _fsync_tree(root: Path) -> None:
    for directory, _dirs, files in os.walk(root, topdown=False):
        for name in files:
            path = Path(directory) / name
            if path.is_symlink():
                continue
            with path.open("rb") as handle:
                os.fsync(handle.fileno())
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _recover_stale_transactions(shell_dir: Path, target: Path, uuid: str) -> None:
    """Recover a previous install interrupted between backup and publish."""
    for stale in shell_dir.glob(f".{uuid}.install-*"):
        if not stale.is_dir() or stale.is_symlink():
            continue
        previous = stale / "previous"
        if not target.exists() and previous.exists():
            previous.rename(target)
        _remove(stale)


def install_extension(
    source: Path, data_dir: Path, uuid: str, compile_schemas: bool = False
) -> Path:
    source = source.resolve()
    _validate_metadata(source, uuid)
    shell_dir = data_dir / "gnome-shell"
    extensions_dir = shell_dir / "extensions"
    extensions_dir.mkdir(parents=True, exist_ok=True)
    target = extensions_dir / uuid
    lock_path = shell_dir / f".{uuid}.install.lock"

    with lock_path.open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        _recover_stale_transactions(shell_dir, target, uuid)
        staging = Path(tempfile.mkdtemp(prefix=f".{uuid}.install-", dir=shell_dir))
        payload = staging / uuid
        previous = staging / "previous"
        moved_previous = False
        try:
            shutil.copytree(source, payload, symlinks=False)
            _validate_metadata(payload, uuid)
            if compile_schemas:
                subprocess.run(
                    ["glib-compile-schemas", "--strict", str(payload / "schemas")],
                    check=True,
                )
            _fsync_tree(payload)
            if target.exists() or target.is_symlink():
                target.rename(previous)
                moved_previous = True
            try:
                payload.rename(target)
            except BaseException:
                if moved_previous and not target.exists():
                    previous.rename(target)
                raise
            _validate_metadata(target, uuid)
        finally:
            _remove(staging)
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--uuid", required=True)
    parser.add_argument("--compile-schemas", action="store_true")
    args = parser.parse_args(argv)
    try:
        target = install_extension(args.source, args.data_dir, args.uuid, args.compile_schemas)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Extension install failed: {exc}", file=sys.stderr)
        return 1
    print(f"Published complete extension: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
