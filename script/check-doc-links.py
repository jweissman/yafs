#!/usr/bin/env python3
"""Verify markdown cross-links within a set of docs resolve to real files
and, for anchors, real headings (GitHub-style slugified).

Usage: python3 check_doc_links.py <doc1.md> [doc2.md ...]
"""
import re
import sys
from pathlib import Path

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$", re.MULTILINE)


def slugify(heading: str) -> str:
    heading = re.sub(r"`([^`]*)`", r"\1", heading)
    slug = heading.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    return slug


def anchors_for(path: Path) -> set[str]:
    text = path.read_text()
    return {slugify(h) for h in HEADING_RE.findall(text)}


def main(paths: list[str]) -> int:
    docs = [Path(p) for p in paths]
    by_name = {p.name: p for p in docs}
    broken = 0
    for doc in docs:
        text = doc.read_text()
        for match in LINK_RE.finditer(text):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            file_part, _, anchor = target.partition("#")
            target_path = (doc.parent / file_part) if file_part else doc
            if file_part and not target_path.exists():
                print(f"{doc}: broken file link -> {target}")
                broken += 1
                continue
            if anchor and target_path.suffix == ".md":
                if anchor not in anchors_for(target_path):
                    print(f"{doc}: broken anchor -> {target}")
                    broken += 1
    print(f"{broken} broken link(s) across {len(docs)} file(s)")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
