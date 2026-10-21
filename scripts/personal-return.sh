#!/bin/sh
# Each release substitutes its exact official source version before publication.
set -eu
version='__UPSTREAM_VERSION__'
installer=$(mktemp)
trap 'rm -f "$installer"' EXIT HUP INT TERM
curl -fsSL -A 'OpenAI File Downloader, XaiImageApiFetch/1.0' \
  "https://raw.githubusercontent.com/pingdotgg/t3code/v${version}/scripts/install.sh" > "$installer"
T3CODE_VERSION="$version" \
  T3CODE_RELEASE_BASE_URL=https://github.com/pingdotgg/t3code/releases/download \
  sh "$installer"
bin_dir="${T3CODE_INSTALL_BIN_DIR:-$HOME/.local/bin}"
T3CODE_RELEASE_BASE_URL=https://github.com/pingdotgg/t3code/releases/download \
  "$bin_dir/t3" update "$version" --allow-downgrade --yes
