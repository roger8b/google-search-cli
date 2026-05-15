#!/usr/bin/env bash
set -euo pipefail

# gscli installer
# Usage: bash install.sh [--local [src]] [--no-setup]

REPO_URL="https://github.com/roger8b/google-search-cli"
INSTALL_DIR="${HOME}/.gscli"
USE_LOCAL=false
LOCAL_SOURCE=""
RUN_SETUP=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --local)    USE_LOCAL=true
                if [[ $# -gt 1 && "${2:0:2}" != "--" ]]; then
                  LOCAL_SOURCE="$2"; shift 2
                else
                  # default: current working directory if it looks like the repo
                  if [[ -f "$PWD/package.json" ]]; then
                    LOCAL_SOURCE="$PWD"
                  fi
                  shift
                fi ;;
    --no-setup) RUN_SETUP=false; shift ;;
    --help|-h)  cat <<EOF
Usage: $0 [--local [src]] [--no-setup]

  --local [src]   Use local checkout instead of cloning. If 'src' given,
                  syncs from that path into ~/.google-search-cli/.
  --no-setup      Skip the Chrome login setup at the end.
EOF
                exit 0 ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }
dim()  { echo -e "${DIM}  $*${NC}"; }

echo ""
echo "  gscli installer"
echo ""

# prerequisites
command -v node >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org (>=18 required)."
command -v npm  >/dev/null 2>&1 || err "npm not found. Install from https://nodejs.org."

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [[ $NODE_MAJOR -lt 18 ]]; then
  err "Node.js >=18 required (found $NODE_MAJOR)."
fi
ok "Node.js $(node --version)"

# optional but strongly recommended: agent-browser
if command -v agent-browser >/dev/null 2>&1; then
  ok "agent-browser found at $(command -v agent-browser)"
else
  warn "agent-browser not on PATH — gscli search will fail until it is installed"
  dim "install: see https://agent-browser.dev/  (or set AGENT_BROWSER_BIN)"
fi

# install / sync
if $USE_LOCAL; then
  if [[ -n "$LOCAL_SOURCE" ]]; then
    [[ -d "$LOCAL_SOURCE" ]] || err "local source not found: $LOCAL_SOURCE"
    [[ -f "$LOCAL_SOURCE/package.json" ]] || err "no package.json at $LOCAL_SOURCE"
    dim "syncing $LOCAL_SOURCE → $INSTALL_DIR …"
    mkdir -p "$INSTALL_DIR"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude chrome-profile "$LOCAL_SOURCE/" "$INSTALL_DIR/"
    else
      (cd "$LOCAL_SOURCE" && tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=chrome-profile -cf - .) | (cd "$INSTALL_DIR" && tar -xf -)
    fi
  else
    [[ -d "$INSTALL_DIR" ]] || err "no local install at $INSTALL_DIR. Run with --local <src> first."
    dim "using existing $INSTALL_DIR"
  fi
elif [[ -d "$INSTALL_DIR/.git" ]]; then
  warn "existing install at $INSTALL_DIR — pulling latest"
  git -C "$INSTALL_DIR" pull --quiet || warn "git pull failed — continuing"
elif [[ -d "$INSTALL_DIR" ]]; then
  warn "$INSTALL_DIR exists but not a git checkout — leaving as-is"
else
  dim "cloning to $INSTALL_DIR …"
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
dim "installing dependencies …"
npm install --silent
dim "building …"
npm run build --silent
if ! npm link 2>&1 | tail -5; then
  warn "npm link failed — try: sudo npm link  (or check 'npm config get prefix' is in PATH)"
fi

# Verify gscli is on PATH
if ! command -v gscli >/dev/null 2>&1; then
  NPM_PREFIX="$(npm config get prefix 2>/dev/null || echo '')"
  warn "gscli not on PATH"
  dim "npm bin dir: ${NPM_PREFIX}/bin"
  dim "add to your shell rc:  export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
fi

ok "gscli installed ($(gscli --version 2>/dev/null || echo 'ok'))"

# Chrome setup
if $RUN_SETUP; then
  echo ""
  echo "  Next: log in to Google so future searches reuse the session."
  echo ""
  dim "running: gscli setup"
  echo ""
  gscli setup || warn "setup did not complete — run 'gscli setup' manually when ready"
fi

echo ""
echo -e "${GREEN}All done.${NC}"
echo ""
echo "  Try:"
echo "    gscli \"agent-browser cdp mode\""
echo "    gscli --help"
echo ""
