const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForFile(filePath, timeout = 10000) {
  const started = Date.now();
  while (!existsSync(filePath)) {
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${filePath}`);
    await delay(25);
  }
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    socket,
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
  };
}

test("mobile viewport and PointerEvents exercise the real game controls", async (t) => {
  const edgePath = process.env.STAR_RING_EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (!existsSync(edgePath)) {
    t.skip(`Edge was not found at ${edgePath}`);
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  const resultDir = await mkdtemp(path.join(tmpdir(), "star-ring-mobile-"));
  const profileDir = path.join(resultDir, "profile");
  let browserProcess;
  let browserCdp;
  let cdp;
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const relativePath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);
      const filePath = path.resolve(projectRoot, "." + relativePath);
      const relativeFilePath = path.relative(projectRoot, filePath);
      if (relativeFilePath.startsWith(".." + path.sep) || path.isAbsolute(relativeFilePath)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const content = await readFile(filePath);
      const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript" };
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    browserProcess = spawn(edgePath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--no-sandbox",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profileDir,
      "about:blank"
    ], { windowsHide: true });
    const portFile = path.join(profileDir, "DevToolsActivePort");
    await waitForFile(portFile);
    const [debugPort, browserPath] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
    browserCdp = await connectCdp(`ws://127.0.0.1:${debugPort}${browserPath}`);
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/index.html?test=1&mobileTest=1`)}`, { method: "PUT" }).then((response) => response.json());
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.bringToFront");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html?test=1&mobileTest=1` });

    let text = "";
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const evaluation = await cdp.send("Runtime.evaluate", { expression: "document.body?.textContent || ''", returnByValue: true });
      text = evaluation.result.value || "";
      if (text.includes("MOBILE_SMOKE_RESULT:")) break;
      await delay(25);
    }
    const marker = "MOBILE_SMOKE_RESULT:";
    const markerIndex = text.lastIndexOf(marker);
    assert.notEqual(markerIndex, -1, "mobile smoke page did not publish a result");
    const result = JSON.parse(text.slice(markerIndex + marker.length));
    assert.equal(result.error, null, result.error || "mobile browser test failed");
    assert.equal(result.checks.length, 11);
  } finally {
    cdp?.socket.close();
    browserCdp?.send("Browser.close").catch(() => {});
    await delay(500);
    browserCdp?.socket.close();
    browserProcess?.kill();
    if (browserProcess && browserProcess.exitCode === null) {
      await Promise.race([new Promise((resolve) => browserProcess.once("exit", resolve)), delay(3000)]);
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(resultDir, { recursive: true, force: true });
  }
});
