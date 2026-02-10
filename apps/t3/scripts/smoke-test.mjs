import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Could not resolve free port."));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", (error) => reject(error));
  });
}

function waitForProcessExit(processRef) {
  return new Promise((resolve) => {
    processRef.once("exit", (code) => resolve(code));
  });
}

async function terminateProcess(processRef, timeoutMs = 5_000) {
  if (processRef.exitCode !== null || processRef.signalCode !== null) {
    return;
  }

  processRef.kill("SIGTERM");
  const exited = await Promise.race([
    waitForProcessExit(processRef).then(() => true),
    new Promise((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);

  if (exited) {
    return;
  }

  processRef.kill("SIGKILL");
  await waitForProcessExit(processRef);
}

function waitForUnauthorizedCloseWithoutMessages(socket, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let messageCount = 0;
    const timer = setTimeout(() => {
      reject(new Error("Smoke test failed: websocket close event timed out."));
    }, timeoutMs);

    socket.addEventListener("message", () => {
      messageCount += 1;
    });
    socket.addEventListener("close", (event) => {
      clearTimeout(timer);
      if (event.code !== 4001) {
        reject(
          new Error(
            `Smoke test failed: expected unauthorized close code 4001, received ${event.code}.`,
          ),
        );
        return;
      }
      if (messageCount > 0) {
        reject(
          new Error(
            `Smoke test failed: unauthorized websocket received ${messageCount} message(s) before close.`,
          ),
        );
        return;
      }
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Smoke test failed: websocket client error before close."));
    });
  });
}

function waitForStartupUrl(readOutput, processRef, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearInterval(timer);
      processRef.off("exit", onExit);
      callback(value);
    };
    const onExit = (code) => {
      finish(
        reject,
        new Error(
          `Smoke test failed: CLI exited before startup URL was printed (exit code ${String(code)}).`,
        ),
      );
    };
    processRef.once("exit", onExit);

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const output = readOutput();
      const match = output.match(/CodeThing is running at (http:\/\/[^\s]+)/);
      if (match?.[1]) {
        finish(resolve, match[1]);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        finish(reject, new Error("Smoke test failed: did not observe startup URL in CLI output."));
      }
    }, 100);
  });
}

async function main() {
  const [backendPort, webPort] = await Promise.all([getFreePort(), getFreePort()]);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = path.resolve(scriptDir, "..");
  const distCli = path.join(appRoot, "dist", "cli.js");
  if (!fs.existsSync(distCli)) {
    throw new Error("Missing dist/cli.js. Run `bun run --cwd apps/t3 build` first.");
  }

  const child = spawn(
    process.execPath,
    [
      distCli,
      "-o=0",
      "--backend-port",
      String(backendPort),
      "--web-port",
      String(webPort),
    ],
    {
      cwd: appRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    const appUrl = await waitForStartupUrl(() => output, child);
    const parsedAppUrl = new URL(appUrl);

    const page = await fetch(parsedAppUrl);
    if (page.status !== 200) {
      throw new Error(`Smoke test failed: expected web status 200, received ${page.status}.`);
    }
    if (page.headers.get("x-content-type-options") !== "nosniff") {
      throw new Error("Smoke test failed: expected x-content-type-options=nosniff.");
    }
    if ((page.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error("Smoke test failed: expected x-frame-options=DENY.");
    }
    if ((page.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error("Smoke test failed: expected referrer-policy=no-referrer.");
    }
    if ((page.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected CORP header to be same-origin.");
    }
    if ((page.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected COOP header to be same-origin.");
    }
    if ((page.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error(
        `Smoke test failed: expected cache-control=no-store, got ${String(
          page.headers.get("cache-control"),
        )}.`,
      );
    }
    if ((page.headers.get("accept-ranges") ?? "").toLowerCase() !== "bytes") {
      throw new Error("Smoke test failed: expected accept-ranges=bytes on HTML response.");
    }
    if ((page.headers.get("vary") ?? "").toLowerCase() !== "range") {
      throw new Error("Smoke test failed: expected vary=range on HTML response.");
    }
    const html = await page.text();
    const assetMatch = html.match(/(?:src|href)="(\/assets\/[^"]+)"/);
    if (!assetMatch?.[1]) {
      throw new Error("Smoke test failed: could not locate built asset path in HTML.");
    }
    const assetUrl = new URL(assetMatch[1], parsedAppUrl);
    const assetResponse = await fetch(assetUrl);
    if (assetResponse.status !== 200) {
      throw new Error(
        `Smoke test failed: expected built asset status 200, received ${assetResponse.status}.`,
      );
    }
    const assetCacheControl = (assetResponse.headers.get("cache-control") ?? "").toLowerCase();
    if (!assetCacheControl.includes("immutable")) {
      throw new Error(
        `Smoke test failed: expected immutable cache-control on built asset, got ${String(
          assetResponse.headers.get("cache-control"),
        )}.`,
      );
    }
    if (!assetCacheControl.includes("max-age=31536000")) {
      throw new Error(
        `Smoke test failed: expected max-age=31536000 on built asset, got ${String(
          assetResponse.headers.get("cache-control"),
        )}.`,
      );
    }
    if ((assetResponse.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
      throw new Error("Smoke test failed: expected nosniff on built asset response.");
    }
    if ((assetResponse.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error("Smoke test failed: expected x-frame-options=DENY on built asset response.");
    }
    if ((assetResponse.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error("Smoke test failed: expected referrer-policy=no-referrer on built asset response.");
    }
    if ((assetResponse.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected CORP header on built asset response.");
    }
    if ((assetResponse.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected COOP header on built asset response.");
    }
    if ((assetResponse.headers.get("accept-ranges") ?? "").toLowerCase() !== "bytes") {
      throw new Error("Smoke test failed: expected accept-ranges=bytes on built asset response.");
    }
    if ((assetResponse.headers.get("vary") ?? "").toLowerCase() !== "range") {
      throw new Error("Smoke test failed: expected vary=range on built asset response.");
    }
    const assetContentLength = Number(assetResponse.headers.get("content-length") ?? "0");
    if (!Number.isFinite(assetContentLength) || assetContentLength <= 0) {
      throw new Error(
        `Smoke test failed: expected positive content-length on built asset response, got ${String(
          assetResponse.headers.get("content-length"),
        )}.`,
      );
    }
    const rangeEnd = Math.min(15, assetContentLength - 1);
    const rangedAsset = await fetch(assetUrl, {
      headers: {
        Range: `bytes=0-${rangeEnd}`,
      },
    });
    if (rangedAsset.status !== 206) {
      throw new Error(
        `Smoke test failed: expected ranged asset status 206, received ${rangedAsset.status}.`,
      );
    }
    const expectedContentRange = `bytes 0-${rangeEnd}/${assetContentLength}`;
    if (rangedAsset.headers.get("content-range") !== expectedContentRange) {
      throw new Error(
        `Smoke test failed: expected content-range ${expectedContentRange}, got ${String(
          rangedAsset.headers.get("content-range"),
        )}.`,
      );
    }
    const rangedContentLength = Number(rangedAsset.headers.get("content-length") ?? "0");
    if (!Number.isFinite(rangedContentLength) || rangedContentLength !== rangeEnd + 1) {
      throw new Error(
        `Smoke test failed: expected ranged content-length ${String(
          rangeEnd + 1,
        )}, got ${String(rangedAsset.headers.get("content-length"))}.`,
      );
    }
    if ((rangedAsset.headers.get("accept-ranges") ?? "").toLowerCase() !== "bytes") {
      throw new Error("Smoke test failed: expected accept-ranges=bytes on ranged asset response.");
    }
    if ((rangedAsset.headers.get("vary") ?? "").toLowerCase() !== "range") {
      throw new Error("Smoke test failed: expected vary=range on ranged asset response.");
    }
    const unsatisfiableRange = await fetch(assetUrl, {
      headers: {
        Range: `bytes=${assetContentLength}-${assetContentLength + 10}`,
      },
    });
    if (unsatisfiableRange.status !== 416) {
      throw new Error(
        `Smoke test failed: expected unsatisfiable range status 416, received ${unsatisfiableRange.status}.`,
      );
    }
    if (unsatisfiableRange.headers.get("content-range") !== `bytes */${assetContentLength}`) {
      throw new Error(
        `Smoke test failed: expected unsatisfiable content-range bytes */${String(
          assetContentLength,
        )}, got ${String(unsatisfiableRange.headers.get("content-range"))}.`,
      );
    }
    if ((unsatisfiableRange.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error(
        "Smoke test failed: expected cache-control=no-store on unsatisfiable range response.",
      );
    }
    const headAssetResponse = await fetch(assetUrl, { method: "HEAD" });
    if (headAssetResponse.status !== 200) {
      throw new Error(
        `Smoke test failed: expected HEAD asset status 200, received ${headAssetResponse.status}.`,
      );
    }
    const headAssetContentLength = Number(headAssetResponse.headers.get("content-length") ?? "0");
    if (!Number.isFinite(headAssetContentLength) || headAssetContentLength <= 0) {
      throw new Error(
        `Smoke test failed: expected positive content-length on HEAD asset response, got ${String(
          headAssetResponse.headers.get("content-length"),
        )}.`,
      );
    }
    const headAssetCacheControl = (headAssetResponse.headers.get("cache-control") ?? "").toLowerCase();
    if (!headAssetCacheControl.includes("immutable")) {
      throw new Error(
        `Smoke test failed: expected immutable cache-control on HEAD asset response, got ${String(
          headAssetResponse.headers.get("cache-control"),
        )}.`,
      );
    }
    if ((headAssetResponse.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
      throw new Error("Smoke test failed: expected nosniff on HEAD asset response.");
    }
    if ((headAssetResponse.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error("Smoke test failed: expected x-frame-options=DENY on HEAD asset response.");
    }
    if ((headAssetResponse.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error("Smoke test failed: expected referrer-policy=no-referrer on HEAD asset response.");
    }
    if (
      (headAssetResponse.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !==
      "same-origin"
    ) {
      throw new Error("Smoke test failed: expected CORP on HEAD asset response.");
    }
    if (
      (headAssetResponse.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !==
      "same-origin"
    ) {
      throw new Error("Smoke test failed: expected COOP on HEAD asset response.");
    }
    if ((headAssetResponse.headers.get("accept-ranges") ?? "").toLowerCase() !== "bytes") {
      throw new Error("Smoke test failed: expected accept-ranges=bytes on HEAD asset response.");
    }
    if ((headAssetResponse.headers.get("vary") ?? "").toLowerCase() !== "range") {
      throw new Error("Smoke test failed: expected vary=range on HEAD asset response.");
    }
    const headRangedAsset = await fetch(assetUrl, {
      method: "HEAD",
      headers: {
        Range: `bytes=0-${rangeEnd}`,
      },
    });
    if (headRangedAsset.status !== 206) {
      throw new Error(
        `Smoke test failed: expected HEAD ranged asset status 206, received ${headRangedAsset.status}.`,
      );
    }
    if (headRangedAsset.headers.get("content-range") !== expectedContentRange) {
      throw new Error(
        `Smoke test failed: expected HEAD ranged content-range ${expectedContentRange}, got ${String(
          headRangedAsset.headers.get("content-range"),
        )}.`,
      );
    }
    const headRangedContentLength = Number(headRangedAsset.headers.get("content-length") ?? "0");
    if (!Number.isFinite(headRangedContentLength) || headRangedContentLength !== rangeEnd + 1) {
      throw new Error(
        `Smoke test failed: expected HEAD ranged content-length ${String(
          rangeEnd + 1,
        )}, got ${String(headRangedAsset.headers.get("content-length"))}.`,
      );
    }
    if ((headRangedAsset.headers.get("accept-ranges") ?? "").toLowerCase() !== "bytes") {
      throw new Error(
        "Smoke test failed: expected accept-ranges=bytes on HEAD ranged asset response.",
      );
    }
    if ((headRangedAsset.headers.get("vary") ?? "").toLowerCase() !== "range") {
      throw new Error("Smoke test failed: expected vary=range on HEAD ranged asset response.");
    }
    const headUnsatisfiableRange = await fetch(assetUrl, {
      method: "HEAD",
      headers: {
        Range: `bytes=${assetContentLength}-${assetContentLength + 1}`,
      },
    });
    if (headUnsatisfiableRange.status !== 416) {
      throw new Error(
        `Smoke test failed: expected HEAD unsatisfiable range status 416, received ${headUnsatisfiableRange.status}.`,
      );
    }
    if (headUnsatisfiableRange.headers.get("content-range") !== `bytes */${assetContentLength}`) {
      throw new Error(
        `Smoke test failed: expected HEAD unsatisfiable content-range bytes */${String(
          assetContentLength,
        )}, got ${String(headUnsatisfiableRange.headers.get("content-range"))}.`,
      );
    }
    if ((headUnsatisfiableRange.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error(
        "Smoke test failed: expected cache-control=no-store on HEAD unsatisfiable range response.",
      );
    }
    const missingAssetUrl = new URL("/assets/missing-bundle.js", parsedAppUrl);
    const missingAsset = await fetch(missingAssetUrl);
    if (missingAsset.status !== 404) {
      throw new Error(
        `Smoke test failed: expected missing asset status 404, received ${missingAsset.status}.`,
      );
    }
    if ((missingAsset.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
      throw new Error("Smoke test failed: expected nosniff on missing asset response.");
    }
    if ((missingAsset.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error("Smoke test failed: expected x-frame-options=DENY on missing asset response.");
    }
    if ((missingAsset.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error("Smoke test failed: expected referrer-policy=no-referrer on missing asset.");
    }
    if (
      (missingAsset.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !==
      "same-origin"
    ) {
      throw new Error("Smoke test failed: expected CORP header on missing asset response.");
    }
    if (
      (missingAsset.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !==
      "same-origin"
    ) {
      throw new Error("Smoke test failed: expected COOP header on missing asset response.");
    }
    if ((missingAsset.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error("Smoke test failed: expected cache-control=no-store on missing asset.");
    }
    const headMissingAsset = await fetch(missingAssetUrl, { method: "HEAD" });
    if (headMissingAsset.status !== 404) {
      throw new Error(
        `Smoke test failed: expected HEAD missing asset status 404, received ${headMissingAsset.status}.`,
      );
    }
    if ((headMissingAsset.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error(
        "Smoke test failed: expected cache-control=no-store on HEAD missing asset response.",
      );
    }
    const headMissingAssetContentLength = Number(
      headMissingAsset.headers.get("content-length") ?? "0",
    );
    if (!Number.isFinite(headMissingAssetContentLength) || headMissingAssetContentLength <= 0) {
      throw new Error(
        `Smoke test failed: expected positive content-length on HEAD missing asset response, got ${String(
          headMissingAsset.headers.get("content-length"),
        )}.`,
      );
    }
    if ((headMissingAsset.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
      throw new Error("Smoke test failed: expected nosniff on HEAD missing asset response.");
    }
    if ((headMissingAsset.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error(
        "Smoke test failed: expected x-frame-options=DENY on HEAD missing asset response.",
      );
    }
    if ((headMissingAsset.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error(
        "Smoke test failed: expected referrer-policy=no-referrer on HEAD missing asset response.",
      );
    }
    if (
      (headMissingAsset.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !==
      "same-origin"
    ) {
      throw new Error("Smoke test failed: expected CORP on HEAD missing asset response.");
    }
    if (
      (headMissingAsset.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !==
      "same-origin"
    ) {
      throw new Error("Smoke test failed: expected COOP on HEAD missing asset response.");
    }
    const postPage = await fetch(parsedAppUrl, {
      method: "POST",
      body: "noop",
    });
    if (postPage.status !== 405) {
      throw new Error(`Smoke test failed: expected POST status 405, received ${postPage.status}.`);
    }
    if ((postPage.headers.get("allow") ?? "").toLowerCase() !== "get, head") {
      throw new Error(
        `Smoke test failed: expected Allow header 'GET, HEAD', got ${String(
          postPage.headers.get("allow"),
        )}.`,
      );
    }
    if ((postPage.headers.get("content-type") ?? "").toLowerCase() !== "text/plain; charset=utf-8") {
      throw new Error(
        `Smoke test failed: expected plain-text POST error content-type, got ${String(
          postPage.headers.get("content-type"),
        )}.`,
      );
    }
    const postContentLength = Number(postPage.headers.get("content-length") ?? "0");
    if (!Number.isFinite(postContentLength) || postContentLength <= 0) {
      throw new Error(
        `Smoke test failed: expected positive content-length on POST response, got ${String(
          postPage.headers.get("content-length"),
        )}.`,
      );
    }
    if ((postPage.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error("Smoke test failed: expected cache-control=no-store on POST response.");
    }
    if ((postPage.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
      throw new Error("Smoke test failed: expected nosniff on POST response.");
    }
    if ((postPage.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error("Smoke test failed: expected x-frame-options=DENY on POST response.");
    }
    if ((postPage.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error("Smoke test failed: expected referrer-policy=no-referrer on POST response.");
    }
    if ((postPage.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected CORP header on POST response.");
    }
    if ((postPage.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected COOP header on POST response.");
    }
    const headPage = await fetch(parsedAppUrl, { method: "HEAD" });
    if (headPage.status !== 200) {
      throw new Error(
        `Smoke test failed: expected HEAD web status 200, received ${headPage.status}.`,
      );
    }
    if ((headPage.headers.get("cache-control") ?? "").toLowerCase() !== "no-store") {
      throw new Error(
        `Smoke test failed: expected HEAD cache-control=no-store, got ${String(
          headPage.headers.get("cache-control"),
        )}.`,
      );
    }
    if ((headPage.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
      throw new Error("Smoke test failed: expected nosniff on HEAD app response.");
    }
    if ((headPage.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") {
      throw new Error("Smoke test failed: expected x-frame-options=DENY on HEAD app response.");
    }
    if ((headPage.headers.get("referrer-policy") ?? "").toLowerCase() !== "no-referrer") {
      throw new Error("Smoke test failed: expected referrer-policy=no-referrer on HEAD app response.");
    }
    if ((headPage.headers.get("cross-origin-resource-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected CORP header on HEAD app response.");
    }
    if ((headPage.headers.get("cross-origin-opener-policy") ?? "").toLowerCase() !== "same-origin") {
      throw new Error("Smoke test failed: expected COOP header on HEAD app response.");
    }
    if ((headPage.headers.get("accept-ranges") ?? "").toLowerCase() !== "bytes") {
      throw new Error("Smoke test failed: expected accept-ranges=bytes on HEAD app response.");
    }
    if ((headPage.headers.get("vary") ?? "").toLowerCase() !== "range") {
      throw new Error("Smoke test failed: expected vary=range on HEAD app response.");
    }
    const headContentLength = Number(headPage.headers.get("content-length") ?? "0");
    if (!Number.isFinite(headContentLength) || headContentLength <= 0) {
      throw new Error(
        `Smoke test failed: expected positive content-length for HEAD response, got ${String(
          headPage.headers.get("content-length"),
        )}.`,
      );
    }

    const wsUrl = parsedAppUrl.searchParams.get("ws");
    if (!wsUrl) {
      throw new Error("Smoke test failed: launch URL did not include ws runtime parameter.");
    }
    const parsedWsUrl = new URL(wsUrl);
    if (parsedWsUrl.port !== String(backendPort)) {
      throw new Error(
        `Smoke test failed: expected backend port ${backendPort}, got ${parsedWsUrl.port}.`,
      );
    }
    if (!parsedWsUrl.searchParams.get("token")) {
      throw new Error("Smoke test failed: websocket URL is missing runtime auth token.");
    }

    const unauthorizedWsUrl = `${parsedWsUrl.origin}${parsedWsUrl.pathname}`;
    const unauthorizedWs = new WebSocket(unauthorizedWsUrl);
    await waitForUnauthorizedCloseWithoutMessages(unauthorizedWs);

    const wrongTokenWs = new WebSocket(
      `${parsedWsUrl.origin}${parsedWsUrl.pathname}?token=wrong-token`,
    );
    await waitForUnauthorizedCloseWithoutMessages(wrongTokenWs);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      let sawHello = false;
      let sawHealthResponse = false;
      const tryResolve = () => {
        if (sawHello && sawHealthResponse) {
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(
        () => reject(new Error("Smoke test failed: websocket did not respond in time.")),
        20_000,
      );
      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            type: "request",
            id: "smoke",
            method: "app.health",
          }),
        );
      });
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "hello") {
          if (message.version !== 1) {
            clearTimeout(timer);
            reject(
              new Error(
                `Smoke test failed: expected hello version 1, got ${String(message.version)}.`,
              ),
            );
            return;
          }
          if (message.launchCwd !== appRoot) {
            clearTimeout(timer);
            reject(
              new Error(
                `Smoke test failed: expected hello launch cwd ${appRoot}, got ${String(
                  message.launchCwd,
                )}.`,
              ),
            );
            return;
          }
          sawHello = true;
          tryResolve();
          return;
        }
        if (message.type !== "response" || message.id !== "smoke" || message.ok !== true) {
          return;
        }
        if (message.result?.status !== "ok") {
          return;
        }
        if (message.result?.launchCwd !== appRoot) {
          clearTimeout(timer);
          reject(
            new Error(
              `Smoke test failed: expected launch cwd ${appRoot}, got ${String(
                message.result?.launchCwd,
              )}.`,
            ),
          );
          return;
        }
        if (message.result?.activeClientConnected !== true) {
          clearTimeout(timer);
          reject(
            new Error(
              "Smoke test failed: app.health did not report active websocket client connectivity.",
            ),
          );
          return;
        }
        if (!Number.isInteger(message.result?.sessionCount) || message.result.sessionCount < 0) {
          clearTimeout(timer);
          reject(
            new Error(
              `Smoke test failed: expected non-negative integer sessionCount, got ${String(
                message.result?.sessionCount,
              )}.`,
            ),
          );
          return;
        }

        sawHealthResponse = true;
        tryResolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Smoke test failed: websocket client error."));
      });
    });
    ws.close();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Smoke test failed."}\n`);
    process.stderr.write(output);
    process.exitCode = 1;
  } finally {
    await terminateProcess(child);
  }
}

await main();
