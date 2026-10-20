# Area: Release

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-33f378ac — Release notes are one file per tag

Status: active
Scope: area:release
Subject: MC-SUBJ-20261020-b6d4abda
Facet: workflow

Evidence:
- repo:scripts/load-release-notes.mjs

Constraint:
Release notes live at `docs/releases/<tag>.md`; the workflow reads that file and fails when it is absent or empty. Do not inline notes in `release.yml` again, and do not enable `generateReleaseNotes` while an authored body is passed.
