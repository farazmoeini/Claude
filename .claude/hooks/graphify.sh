#!/bin/bash
# Wrapper für graphify-Hooks: installiert die CLI bei Sitzungsstart nach,
# falls sie fehlt (z. B. frischer Cloud-Container), und tut sonst nichts.
export PATH="$HOME/.local/bin:$PATH"
if [ "$1" = "ensure" ]; then
  command -v graphify >/dev/null 2>&1 \
    || uv tool install -q graphifyy >/dev/null 2>&1 \
    || pipx install graphifyy >/dev/null 2>&1
  exit 0
fi
command -v graphify >/dev/null 2>&1 || exit 0
exec graphify hook-guard "$@"
