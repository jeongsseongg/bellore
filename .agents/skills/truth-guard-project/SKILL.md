---
name: truth-guard-project
description: Execute the already-installed, version-pinned Truth Guard HIGH/LOW/NONE answer protocol in this repository. Use for a hook-mandated HIGH turn, deterministic answer hashing, ledger scaffolding, or an installed-state evidence gate. Do not use it to install, update, remove, or claim real-world truth.
---

# Truth Guard Project

This repository pins bundle `tools/truth-guard/bundles/f5a1423e5d2ec2a3688bedd12cf275de9999d5ce6565c887ecacb1f4c21823a6/truth-guard.pyz` at SHA-256 `f5a1423e5d2ec2a3688bedd12cf275de9999d5ce6565c887ecacb1f4c21823a6`. It checks declared evidence integrity only; real-world `truth_status` remains `NOT_MEASURED`.

1. Work from this Git root or a child directory. First read [references/HIGH_ROUTE.md](references/HIGH_ROUTE.md).
2. Before every bundle execution, independently hash the bundle and require the exact pinned SHA.
3. For a HIGH draft, use `high canonicalize`, then `high scaffold`. A factual scaffold is incomplete until every exact span and pinned capture is declared. The `--unknown-next-action` route is only for a whole-answer scoped abstention.
4. Run `gate` separately. Append the HIGH marker only after gate `PASS`; LOW/NONE never declare a ledger.
5. Never fabricate evidence or a PASS result. Hooks, local manifests, and captures are bypassable or locally unanchored; they do not prove reality.
6. Installation, update, audit, and removal belong to the global `$truth-guard` management skill, not this project skill.
