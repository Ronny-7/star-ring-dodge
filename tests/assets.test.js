const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

test("browser renders the procedural fighter with the real asset debug API", async (t) => {
  const edgePath = process.env.STAR_RING_EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (!existsSync(edgePath)) {
    t.skip(`Edge was not found at ${edgePath}`);
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  const resultDir = await mkdtemp(path.join(tmpdir(), "star-ring-assets-"));
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
    const browser = await execFileAsync(edgePath, [
      "--headless=new",
      "--no-sandbox",
      "--user-data-dir=" + path.join(resultDir, "profile"),
      "--virtual-time-budget=30000",
      "--window-size=1280,900",
      "--dump-dom",
      `http://127.0.0.1:${port}/tests/asset-smoke.html`
    ], { windowsHide: true });

    const marker = "ASSET_SMOKE_RESULT:";
    const markerIndex = browser.stdout.lastIndexOf(marker);
    assert.notEqual(markerIndex, -1, "asset page did not publish a result");
    const result = JSON.parse(browser.stdout.slice(markerIndex + marker.length).trim().split("</body>")[0]);
    assert.equal(result.error, null, result.error || "browser asset test failed");
    assert.equal(result.checks.length, 10);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(resultDir, { recursive: true, force: true });
  }
});
