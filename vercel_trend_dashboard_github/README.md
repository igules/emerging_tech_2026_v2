# Emerging Technology Atlas — read-only Vercel export

Primary snapshot: `leaf_minsample8_07_2` (`run-20261109-115127-602704`)

Comparison snapshot: `eom_minsample8_07` (`run-20261109-113100-111082`)

This folder contains precomputed dashboard JSON and browser assets only. The synthesis lab and transcript page are hidden because they need a live backend. The included evidence text will be visible to people who can access the deployed site.

## Local check

From this folder, run `python -m http.server 8766 --bind 127.0.0.1 -d public` and open `http://127.0.0.1:8766/`.

## GitHub and Vercel

1. Create a private GitHub repository containing the contents of this folder.
2. In Vercel, import that repository and select the Other framework preset.
3. Keep Root Directory as the repository root. `vercel.json` sets Output Directory to `public`.
4. Review the preview deployment, then enable the desired access controls before sharing.

To publish a newer analysis, rerun `export_static_site.py` to a fresh output folder and replace this repository's generated files.
