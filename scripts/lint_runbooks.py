#!/usr/bin/env python3
"""Fails if any runbooks/**/*.md is missing a mandatory section (see
authoring-templates/runbook-template.md) or its YAML front matter, or if any
adr/*.md is missing an ADR front-matter field. Run from the repo root:

    python3 scripts/lint_runbooks.py
"""
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

MANDATORY_RUNBOOK_SECTIONS = [
    "## Alert Açıklaması",
    "## Olası Nedenler",
    "## İlk Müdahale Adımları",
    "## Escalation Kriteri",
    "## İlgili Dashboard Linki",
    "## Post-Incident Aksiyonlar",
]

MANDATORY_RUNBOOK_FRONTMATTER = ["title", "service_type", "alert_types", "severity"]
MANDATORY_ADR_FRONTMATTER = ["title", "status", "date", "deciders"]

FRONTMATTER_PATTERN = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)


def parse_frontmatter_keys(text: str) -> set[str]:
    match = FRONTMATTER_PATTERN.match(text)
    if not match:
        return set()
    keys = set()
    for line in match.group(1).splitlines():
        if ":" in line and not line.startswith(" ") and not line.startswith("-"):
            keys.add(line.split(":", 1)[0].strip())
    return keys


def lint_runbooks() -> list[str]:
    errors = []
    for path in sorted((REPO_ROOT / "docs" / "runbooks").glob("**/*.md")):
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO_ROOT)

        missing_sections = [s for s in MANDATORY_RUNBOOK_SECTIONS if s not in text]
        if missing_sections:
            errors.append(f"{rel}: missing section(s): {', '.join(missing_sections)}")

        keys = parse_frontmatter_keys(text)
        missing_fm = [k for k in MANDATORY_RUNBOOK_FRONTMATTER if k not in keys]
        if missing_fm:
            errors.append(f"{rel}: missing front matter field(s): {', '.join(missing_fm)}")
    return errors


def lint_adrs() -> list[str]:
    errors = []
    for path in sorted((REPO_ROOT / "docs" / "adr").glob("*.md")):
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO_ROOT)
        keys = parse_frontmatter_keys(text)
        missing_fm = [k for k in MANDATORY_ADR_FRONTMATTER if k not in keys]
        if missing_fm:
            errors.append(f"{rel}: missing front matter field(s): {', '.join(missing_fm)}")
    return errors


def main() -> int:
    errors = lint_runbooks() + lint_adrs()
    if errors:
        print("obs-docs-runbooks lint failed:\n")
        for error in errors:
            print(f"  - {error}")
        print(f"\n{len(errors)} problem(s). See authoring-templates/runbook-template.md and authoring-templates/adr-template.md.")
        return 1
    print("obs-docs-runbooks lint passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
