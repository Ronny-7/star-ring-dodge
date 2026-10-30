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

test("missing Edge fails unless explicitly opted out", async () => {
  const env = { ...process.env, STAR_RING_EDGE: path.join(__filename, "missing-edge.exe") };
  // This child must run independently, not inherit the parent test worker context.
  delete env.NODE_TEST_CONTEXT;
  const run = (skip) => execFileAsync(process.execPath, [
    "--test", "--test-name-pattern=^browser applies", __filename
  ], {
    env: { ...env, STAR_RING_SKIP_EDGE: skip },
    windowsHide: true,
    timeout: 10000
  });
  await assert.rejects(run("0"), (error) => error.code === 1 && /Set STAR_RING_EDGE/.test(error.stdout));
  const skipped = await run("1");
  assert.match(skipped.stdout, /skipped 1/);
});

test("browser applies and clears deterministic 3D region mechanics", async (t) => {
  const edgePath = process.env.STAR_RING_EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (!existsSync(edgePath)) {
    if (process.env.STAR_RING_SKIP_EDGE === "1") {
      t.skip(`Edge was explicitly skipped because it was not found at ${edgePath}`);
      return;
    }
    assert.fail(`Edge was not found at ${edgePath}. Set STAR_RING_EDGE to its executable or STAR_RING_SKIP_EDGE=1 to opt out.`);
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
    assert.equal(result.checks.length, 27);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(resultDir, { recursive: true, force: true });
  }
});
