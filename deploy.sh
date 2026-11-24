#!/usr/bin/env bash
# One-command deploy to GitHub Pages (needs the GitHub CLI, logged in: `gh auth login`).
#   npm run deploy            -> creates <you>/taskmarket-pulse, enables Pages, starts the first build
#   npm run deploy -- my-name -> same, with another repo name
# The workflow in .github/workflows/pages.yml then rebuilds from the API every 30 minutes.
set -euo pipefail
NAME="${1:-taskmarket-pulse}"
OWNER="$(gh api user -q .login)"
[ -d .git ] || { git init -q -b main && git add -A && git commit -qm "Taskmarket Pulse"; }
if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$NAME.git"
  git push -u origin HEAD:main
else
  gh repo create "$OWNER/$NAME" --public --source . --remote origin --push
fi
gh api -X POST "repos/$OWNER/$NAME/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$OWNER/$NAME/pages" -f build_type=workflow >/dev/null
gh workflow run pages.yml -R "$OWNER/$NAME" --ref main
echo "Deploying. Live in about 2 minutes at https://$(echo "$OWNER" | tr 'A-Z' 'a-z').github.io/$NAME/"
