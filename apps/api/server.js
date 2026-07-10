const http = require("http");
const { APP_VERSION } = require("../../packages/config/app-version");

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === "/" || path === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: "ok",
      service: "MultiPortal Listing Manager API",
      version: APP_VERSION,
      endpoints: {
        "GET /listings": "List all listing drafts",
        "POST /listings": "Create a listing draft",
        "GET /listings/:id": "Get a listing draft by ID",
        "PUT /listings/:id": "Update a listing draft",
        "DELETE /listings/:id": "Delete a listing draft",
        "POST /auth/dev-login": "Developer login (creates test user)",
        "POST /publication-jobs": "Create a publication job",
        "GET /publication-jobs/:id": "Get publication job status",
        "POST /media/upload-url": "Get a presigned upload URL",
      }
    }, null, 2));
  } else if (path === "/listings" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ listings: [], message: "Listings endpoint ready. Connect to PostgreSQL for data." }));
  } else if (path === "/listings" && req.method === "POST") {
    const body = [];
    req.on("data", chunk => body.push(chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(Buffer.concat(body).toString());
        res.writeHead(201);
        res.end(JSON.stringify({ id: `draft-${Date.now()}`, ...data, status: "draft", createdAt: new Date().toISOString() }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  } else if (path.startsWith("/listings/") && req.method === "GET") {
    const id = path.split("/")[2];
    res.writeHead(200);
    res.end(JSON.stringify({ id, title: "Sample listing", description: "A draft listing", price: 99.99, status: "draft" }));
  } else if (path.startsWith("/listings/") && req.method === "PUT") {
    const id = path.split("/")[2];
    const body = [];
    req.on("data", chunk => body.push(chunk));
    req.on("end", () => {
      const data = JSON.parse(Buffer.concat(body).toString());
      res.writeHead(200);
      res.end(JSON.stringify({ id, ...data, updatedAt: new Date().toISOString() }));
    });
  } else if (path.startsWith("/listings/") && req.method === "DELETE") {
    const id = path.split("/")[2];
    res.writeHead(200);
    res.end(JSON.stringify({ deleted: true, id }));
  } else if (path === "/auth/dev-login" && req.method === "POST") {
    res.writeHead(200);
    res.end(JSON.stringify({
      userId: "dev-user-1",
      email: "dev@multiportal.local",
      name: "Developer",
      token: "dev-jwt-token-placeholder"
    }));
  } else if (path === "/publication-jobs" && req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({
      id: `job-${Date.now()}`,
      idempotencyKey: `key-${Date.now()}`,
      status: "pending",
      createdAt: new Date().toISOString()
    }));
  } else if (path.match(/^\/publication-jobs\/.+/) && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({
      id: path.split("/")[2],
      status: "published",
      externalId: "mock-12345",
      externalUrl: "https://mock.example.com/listings/123"
    }));
  } else if (path === "/media/upload-url" && req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({
      uploadUrl: "https://localhost:9000/multiportal-media/upload-key",
      key: `media-${Date.now()}`
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found", path }));
  }
});

server.listen(3001, () => {
  console.log(`MultiPortal API running at http://localhost:3001 (v${APP_VERSION})`);
  console.log("Endpoints available:");
  console.log("  GET  /health");
  console.log("  GET  /listings");
  console.log("  POST /listings");
  console.log("  GET  /listings/:id");
  console.log("  PUT  /listings/:id");
  console.log("  DELETE /listings/:id");
  console.log("  POST /auth/dev-login");
  console.log("  POST /publication-jobs");
  console.log("  GET  /publication-jobs/:id");
  console.log("  POST /media/upload-url");
});
