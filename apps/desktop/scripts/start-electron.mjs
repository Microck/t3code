import { spawn } from "node:child_process";

import { desktopDir, resolveElectronPath } from "./electron-launcher.mjs";

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
const passthroughArgs = process.argv.slice(2);

const child = spawn(resolveElectronPath(), ["dist-electron/main.js", ...passthroughArgs], {
  stdio: "inherit",
  cwd: desktopDir,
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
