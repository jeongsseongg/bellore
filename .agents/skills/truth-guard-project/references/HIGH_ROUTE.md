# Installed HIGH route

## Verify installed state before execution

Resolve the exact Git root. The expected bundle is `tools/truth-guard/bundles/f5a1423e5d2ec2a3688bedd12cf275de9999d5ce6565c887ecacb1f4c21823a6/truth-guard.pyz` and its SHA-256 is `f5a1423e5d2ec2a3688bedd12cf275de9999d5ce6565c887ecacb1f4c21823a6`. Use an external stdlib/native hash check before running the archive. On PowerShell:

```powershell
$RepoRoot = (& git rev-parse --show-toplevel).Trim()
$Expected = 'f5a1423e5d2ec2a3688bedd12cf275de9999d5ce6565c887ecacb1f4c21823a6'
$Bundle = Join-Path $RepoRoot 'tools\truth-guard\bundles\f5a1423e5d2ec2a3688bedd12cf275de9999d5ce6565c887ecacb1f4c21823a6\truth-guard.pyz'
$Actual = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw 'Truth Guard bundle SHA-256 mismatch before execution.' }
python -B -I -S $Bundle verify-bundle --expected-sha $Expected
```

If the bundle, project skill, install manifest, or hook objects drift, stop and ask the global `$truth-guard` skill to audit. Do not execute the archive to decide whether its own bytes are trusted.

## Deterministic draft and ledger

Keep the marker out of the draft. Canonicalization is CRLF/CR to LF, trailing whitespace removed per line, outer whitespace stripped, then exactly one final LF. Unicode is not normalized. Spans are Python Unicode code-point `[start,end)` offsets in that canonical body.

```powershell
python -B -I -S $Bundle high canonicalize --repo-root $RepoRoot --answer-file <draft>
python -B -I -S $Bundle high scaffold --repo-root $RepoRoot --answer-file <draft>
```

Both are read-only by default. `high scaffold --write` creates, without overwriting, the canonical draft, an incomplete ledger, and an empty source manifest under `.truth-guard/`. Fill factual spans and evidence from the installed templates. The command never infers claim meaning.

For a complete whole-answer abstention, explicitly supply the next verification action:

```powershell
python -B -I -S $Bundle high scaffold --repo-root $RepoRoot --answer-file <draft> --unknown-next-action '<specific next check>' --write
```

This produces an `UNKNOWN` ledger with `gate_status=NOT_RUN`; it is not a PASS. Run the gate separately using the exact reported paths:

```powershell
python -B -I -S $Bundle gate <canonical-draft> --ledger <ledger>
```

Only after gate `PASS`, append exactly the reported HIGH marker as the final non-whitespace content. The Stop hook recomputes the canonical body SHA and requires the ledger filename stem and `answer_sha256` to match.

## Evidence boundaries

- `assets/LEDGER.template.json` and `assets/SOURCE_MANIFEST.template.json` define the declared fields.
- Use `fetch` to create bounded HTTP captures; inspect source identity, owner, redirect chain, date, license, and limitations yourself.
- Every factual claim must be an exact document slice and must be supported by one pinned evidence record that independently passes all applicable deterministic checks.
- If support is insufficient, revise to an explicit unknown or scoped abstention. Never relabel an unsupported fact as opinion.
- Gate `PASS` means only the declared direct-quote/capture contract passed. Free-text semantics, sycophancy behavior, and real-world truth are not measured.

For LOW or NONE, append exactly one final marker and no ledger:

```text
<!-- truth-guard:v1 route=LOW -->
<!-- truth-guard:v1 route=NONE -->
```
