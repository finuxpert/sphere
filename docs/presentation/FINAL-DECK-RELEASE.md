# SPHERE iFuntastic 2026 — Final Deck Release

This document records the final competition-deck deliverable and the compatibility decisions used for Microsoft PowerPoint.

## Final deliverable

- File name: `SPHERE_iFuntastic_2026_v3_Competition_Final_POWERPOINT_SAFE.pptx`
- Slide count: **15**
- Format: **16:9 PowerPoint**
- File size: **881,915 bytes**
- SHA-256: `46d848c003260442591c80e35fe18849b29261219ed624b89351061bf3c1d09e`
- Finalization date: **2026-09-30**
- Product version represented: **SPHERE v1.34.29**
- Application source used for current-product screenshots/feature validation: `97cec128f1482dd24be3f5efbecedfd3fd851feb`

The PowerPoint binary is distributed as a presentation deliverable rather than treated as application source code. This document is the repository record for the final deck identity and validation state.

## PowerPoint compatibility

The final file is the **POWERPOINT_SAFE** build.

Do not distribute the earlier `...Final_Smooth.pptx` build. That build used presentation-transition XML that could cause Microsoft PowerPoint to show:

> PowerPoint found a problem with content.

The safe build was normalized so compatibility and editability take priority over custom transition XML.

Validation performed on the final build:

- PPTX ZIP/package opens correctly
- all 15 slides render successfully
- slide layout/overflow review passed
- deck remains editable
- final visual layout is preserved

## Competition finishing standard

The final deck intentionally avoids a generic software/AI presentation style.

Presentation rules:

- one primary message per slide
- SAP Basis / Infrastructure terminology over developer jargon
- real SAP, OS, Rundeck, and SPHERE screenshots over decorative stock imagery
- icons only when they carry a clear operational meaning
- consistent slide grid, margins, title baseline, footer, and object alignment
- no unnecessary semicolons, decorative arrows, random bullets, or mixed separators
- use `CPU | Memory | I/O Wait | Work Process` style only where a compact technical label is useful
- avoid marketing terms such as intelligent, seamless, powerful, revolutionary, or automatic root cause

Preferred wording includes:

- Application Server
- kondisi server
- penggunaan resource
- workload SAP
- Critical Work Process
- Job / Program
- riwayat monitoring
- bukti teknis
- area yang perlu diperiksa
- validasi teknis
- pengambilan data terjadwal melalui Rundeck
- korelasi kondisi server dengan workload SAP

## Evaluation boundary

The deck currently shows an initial investigation-time estimate:

- Before: **40–75 minutes**
- After: **5–15 minutes**
- Potential reduction: **70–80%**

This remains an **initial estimate** and must not be presented as the final measured competition result.

Before submission, replace it with validated incident measurements if a formal time study is completed.

## Final slide structure

1. Cover
2. Executive Summary
3. Current SAP performance investigation process
4. Problems in the current process
5. Why the improvement is needed
6. Improvement target
7. Cause analysis
8. Selected improvements
9. SPHERE improvement journey
10. Current SPHERE
11. SPHERE topology
12. Before vs After
13. Implementation evidence and example investigation flow
14. Evaluation
15. Standardization and next improvement

## Technical boundary

The final topology must remain consistent with the implemented architecture:

```text
SAP Application Servers / Infrastructure
        ↓
Rundeck
        ↓ REST API
SPHERE Backend
        ↓
PostgreSQL
        ↓
SPHERE Web UI
        ↓
SAP Basis / Infrastructure / Functional
```

SPHERE does not connect directly to SAP Application Servers for the Rundeck-integrated collection flow. Rundeck performs SAP-side collection; SPHERE consumes retained execution data through the Rundeck REST API.

Authoritative SM37 execution data remains a separate trust plane and must not be inferred from sampled Work Process observations.
