const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const API_PROXY_URL = process.env.API_PROXY_URL || `http://localhost:${process.env.API_PORT || 3001}`;
const API_ROUTE_PREFIXES = [
  "/auth",
  "/listings",
  "/providers",
  "/marketplace-accounts",
  "/publication-jobs",
  "/media",
  "/health",
];

function isApiRoute(pathname) {
  return API_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function proxyToApi(req, res, url) {
  const target = new URL(`${url.pathname}${url.search}`, API_PROXY_URL);
  const client = target.protocol === "https:" ? https : http;

  const proxyReq = client.request(target, {
    method: req.method,
    headers: {
      ...req.headers,
      "x-forwarded-host": req.headers.host || "",
      "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "API proxy request failed", detail: error.message }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname;

  if (isApiRoute(url.pathname)) {
    proxyToApi(req, res, url);
    return;
  }

  if (filePath === "/" || filePath === "") {
    filePath = "/index.html";
  }

  const routeMap = {
    "/create-listing": "/create-listing.html",
    "/login": "/login.html",
    "/register": "/register.html",
  };

  if (routeMap[filePath]) {
    filePath = routeMap[filePath];
  }

  const fullPath = path.join(__dirname, "public", filePath);

  const extMap = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
  };

  const ext = path.extname(fullPath);
  const contentType = extMap[ext] || "text/plain";

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Page not found");
      } else {
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(3000, () => {
  console.log("Frontend running at http://localhost:3000");
});
