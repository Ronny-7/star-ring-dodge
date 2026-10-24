const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2] || 8123);
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const filePath = path.resolve(root, "." + decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath));
    const relative = path.relative(root, filePath);
    if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      response.writeHead(403);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));