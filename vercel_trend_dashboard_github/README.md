# Emerging Technology Atlas — read-only Vercel export

Primary snapshot: `leaf_minsample6_07` (`run-20261109-164924-644470`)

Comparison snapshot: `eom_minsample8_07` (`run-20261109-113100-111082`)

Available saved runs:
- `leaf_minsample6_07` (`run-20261109-164924-644470`)
- `eom_minsample8_07` (`run-20261109-113100-111082`)
- `leaf_minsample7_07_3` (`run-20261109-163602-374875`)
- `leaf_minsample8_07_2` (`run-20261109-115127-602704`)

This folder contains precomputed dashboard JSON and browser assets only. The synthesis lab and transcript page are hidden because they need a live backend. The included evidence text will be visible to people who can access the deployed site.

## Local check

From this folder, run `python -m http.server 8766 --bind 127.0.0.1 -d public` and open `http://127.0.0.1:8766/`.

## GitHub and Vercel

1. Create a private GitHub repository containing the contents of this folder.
2. In Vercel, import that repository and select the Other framework preset.
3. Set Root Directory to the folder containing this `vercel.json`. It sets Output Directory to `public`.
4. Review the preview deployment, then enable the desired access controls before sharing.

To publish a newer saved run, execute `export_static_site.py --output <this-folder> --primary-label <new-run-label> --comparison-label <comparison-run-label> --replace` on the analysis computer, then commit and push the changed files. Previous runs remain selectable.
