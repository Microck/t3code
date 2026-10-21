# Personal releases

This fork follows official nightly releases and carries the pending fixes in
`scripts/personal-release.ts`. The `personal-updates` branch owns automation;
the older `main` branch is preserved. The scheduled workflow checks every six
hours and can also be dispatched manually.

Each build starts from an official release, not upstream main. A fix is omitted
only when that release contains its upstream merge commit. Copilot resolves
cherry-pick conflicts in the files changed by that fix. It cannot change release
automation. Build and regression failures block publication. Failed runs create
or update a single issue on this fork; the installed version remains available.

Set the Actions secret `COPILOT_GITHUB_TOKEN` to a fine-grained token with the
account permission **Copilot Requests**. Repository writes use the separate
built-in Actions token. Never use a general repository token as Copilot's token.

The workflow builds Windows x64 desktop, Linux x64 (for its embedded WSL
runtime), and Linux ARM64 (for Ashburn). It reuses upstream's packaging and smoke
checks. Windows builds are unsigned because this fork has no signing identity.
The build preserves T3's app ID, install identity, data directory, and database
format. T3 Connect uses upstream's public client configuration.

Fork nightly build numbers reserve the last five digits for this workflow run:
upstream `3473` becomes `347300001` on run 1. The release notes record both
versions. Separate runtime directories prevent official and fork binaries with
the same version from being mistaken for one another.

## Switch back to official T3 Code

Every release includes `return-to-official.ps1` for the Windows desktop and
`return-to-official.sh` for Ashburn. Download the appropriate script from the
installed fork release and run it. Each script is pinned to that build's exact
official source version, so it does not guess which database version to use.
The Windows script verifies the official installer's signature before opening
it; the server installer verifies the official archive's SHA-256 checksum.

Switching distributions does not require exporting or importing chats. Do not
uninstall T3 or delete its data. Use the official release named in the fork's
release notes, or a newer official nightly. Avoid older upstream releases:
database downgrades are not promised by T3.

On Windows, close T3 and install the official Windows x64 installer over the
existing installation. The official installer restores the official update feed
and continues using the same chats, settings, and connected environments.

For Ashburn, run the official installer with the corresponding upstream version
from the release notes, then run that official executable's update command:

```sh
export T3CODE_VERSION=0.1.2-nightly.20261021.3473 # replace with the recorded upstream version
export T3CODE_RELEASE_BASE_URL=https://github.com/pingdotgg/t3code/releases/download
curl -fsSL -A 'OpenAI File Downloader, XaiImageApiFetch/1.0' https://t3.codes/install.sh | sh
"$HOME/.local/bin/t3" update "$T3CODE_VERSION" --allow-downgrade --yes
unset T3CODE_VERSION T3CODE_RELEASE_BASE_URL
```

The official command retains the same T3 home and rebinds its background service.
The numeric downgrade flag is needed because fork build numbers are larger; the
upstream source and database format are the same. After returning, future
updates come from official T3. No fork environment variable is persisted.

Initial publication does not install anything or restart a daily-driver server.
