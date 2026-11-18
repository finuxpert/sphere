#!/usr/bin/env python3
"""Stage scaffold into a SPHERE checkout without overwriting any existing file."""
from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_root", type=Path, help="Existing finuxpert/sphere checkout root")
    parser.add_argument("--apply", action="store_true", help="Create NEW files only after collision preflight")
    args = parser.parse_args()

    source_root = Path(__file__).resolve().parents[3]
    source_module = source_root / "apps" / "jumphost"
    repo_root = args.repo_root.expanduser().resolve()
    if not ((repo_root / "backend").is_dir() and (repo_root / "src").is_dir()):
        parser.error("Destination must be a SPHERE checkout containing backend/ and src/")
    files = sorted(p for p in source_module.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc" and "node_modules" not in p.parts and "dist" not in p.parts)
    targets = [(p, repo_root / p.relative_to(source_root)) for p in files]
    collisions = [str(dst.relative_to(repo_root)) for _, dst in targets if dst.exists()]
    if collisions:
        print("FAIL: existing destinations (no files changed):")
        for collision in collisions:
            print(f"  {collision}")
        return 2
    print(f"PREFLIGHT=PASS NEW_FILES={len(targets)} ROOT={repo_root}")
    if not args.apply:
        print("MODE=DRY_RUN: use --apply to write new files")
        return 0
    for src, dst in targets:
        dst.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation; even if a race occurs after preflight, no overwrite.
        with dst.open("xb") as out:
            out.write(src.read_bytes())
    print(f"MODE=APPLIED NEW_FILES={len(targets)} OVERWRITES=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
