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

test("browser applies and clears deterministic 3D region mechanics", async (t) => {
  const edgePath = process.env.STAR_RING_EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (!existsSync(edgePath)) {
    t.skip(`Edge was not found at ${edgePath}`);
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  const resultDir = await mkdtemp(path.join(tmpdir(), "star-ring-regions-"));
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const filePath = path.resolve(projectRoot, "." + decodeURIComponent(requestPath));
      const relative = path.relative(projectRoot, filePath);
      if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error("forbidden");
      const content = await readFile(filePath);
      const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript" };
      response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await execFileAsync(edgePath, [
      "--headless=new", "--no-sandbox",
      "--user-data-dir=" + path.join(resultDir, "profile"),
      "--virtual-time-budget=30000", "--dump-dom",
      `http://127.0.0.1:${server.address().port}/tests/region-mechanics-smoke.html`
    ], { windowsHide: true });
    const marker = "REGION_MECHANICS_RESULT:";
    const markerIndex = browser.stdout.lastIndexOf(marker + "{");
    assert.notEqual(markerIndex, -1, "region mechanics page did not publish a result");
    const result = JSON.parse(browser.stdout.slice(markerIndex + marker.length).trim().split("</body>")[0]);
    assert.equal(result.error, null, result.error || "region mechanics browser test failed");
    assert.equal(result.checks.length, 17);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(resultDir, { recursive: true, force: true });
  }
});
