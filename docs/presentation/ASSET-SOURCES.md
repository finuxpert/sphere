# SPHERE iFuntastic 2026 Asset Sources

This document records approved presentation asset sources and screenshot handling rules.

## Branding assets

Use repository assets from `public/branding/`.

Preferred SPHERE logo:

- `public/branding/logo/sphere-logo-horizontal-light.png`
- source size in repository: 1255 × 266 px

Available supporting assets:

- `public/branding/icon/`
- `public/branding/logo/sphere-wordmark-light.png`
- `public/branding/logo/sphere-wordmark-dark.png`

Do not rebuild the SPHERE logo from screenshots when the repository asset is available.

## Historical screenshots

Historical screenshots from the original SPHERE concept deck may be used when clearly presented as development evidence.

Recommended uses:

- ST03N screenshot → initial analysis / As-Is evidence
- Linux / OS snapshot → manual evidence collection
- WP-SCOUT snapshot → collection evolution
- Rundeck successful execution → automation implementation
- early SPHERE dashboard → development timeline

Do not present wireframes or old RCA-era screens as the current product.

## Current screenshots

For current-product slides, prefer screenshots captured from the currently validated DEV build.

At the 2026-09-30 presentation audit, the branch HEAD was:

`97cec128f1482dd24be3f5efbecedfd3fd851feb`

Recent History/Workload Explorer changes on that branch include:

- anchoring historical workload ranges to the selected period
- using the Workload Explorer backend fixture in QA
- pinning historical charts to the requested time window

When screenshots are refreshed, record the Git SHA used for the capture.

## Security / sanitization

Before putting operational screenshots into a public or competition deck:

- remove credentials and tokens
- remove sensitive URLs if required
- avoid exposing internal secrets
- review hostnames/IP addresses for presentation scope
- do not commit raw SAP logs or secret-bearing screenshots to GitHub

## Screenshot presentation rules

- crop tightly to the feature being discussed
- do not shrink full-screen UI until text becomes unreadable
- use at most 2–3 callouts on one screenshot
- keep current UI and historical UI visually distinguishable
- captions should explain why the screenshot matters, not repeat the slide title
