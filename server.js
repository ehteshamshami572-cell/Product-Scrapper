process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { scrapeStore } from "./scraper.js";
import { analyzeWebsite } from "./lib/analyzer.js";
import { productsToCsv, generateImagesZip } from "./lib/managers/download.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const startPort = Number.parseInt(process.env.PORT || "3000", 10);

// Increase payloads limits to support sending products/images arrays back for exports
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/output", express.static(path.join(__dirname, "output")));

let latestResult = null;

// Endpoint 1: Fast website analysis (CMS, Tech Stack, Theme, Metadata, Product scan)
app.get("/api/analyze", async (req, res) => {
  const { storeUrl } = req.query;
  if (!storeUrl) {
    return res
      .status(400)
      .json({ ok: false, error: "storeUrl query parameter is required" });
  }

  try {
    const result = await analyzeWebsite(storeUrl, (msg) => {});
    res.json({ ok: true, result });
  } catch (error) {
    console.error("Analysis failed:", error);
    res
      .status(500)
      .json({ ok: false, error: error.message || "Failed to analyze website" });
  }
});

// Endpoint 2: Full Product Scrape with SSE (Server-Sent Events) for real-time progress
app.get("/api/scrape", async (req, res) => {
  const { storeUrl, threads } = req.query || {};
  const numThreads = parseInt(threads, 10) || 4;
  const isVercelRuntime =
    process.env.VERCEL === "1" || req.headers.host?.includes("vercel.app");

  if (!storeUrl) {
    return res
      .status(400)
      .json({ ok: false, error: "storeUrl query parameter is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    res.write(":\n\n");
  }, 15000);

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const result = await scrapeStore({
      storeUrl,
      threads: numThreads,
      cloudMode: isVercelRuntime,
      onProgress: (message) => {
        sendEvent("progress", { message });
      },
      onStats: (summary) => {
        sendEvent("stats", { summary });
      },
    });

    latestResult = result;
    sendEvent("complete", { result });
  } catch (error) {
    console.error("Scrape error:", error);
    sendEvent("error", {
      error: error.message || "An error occurred during the scrape.",
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// Endpoint 3: Stateless Export (Generates CSV or ZIP files dynamically)
app.post("/api/export", async (req, res) => {
  const { format, products, images, host = "export" } = req.body || {};

  if (!format) {
    return res.status(400).json({ ok: false, error: "format is required" });
  }

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeHost = host.replace(/[^A-Za-z0-9._-]+/g, "_");

    if (format === "csv") {
      if (!Array.isArray(products)) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "products array is required for csv export",
          });
      }
      const csv = productsToCsv(products);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeHost}_${stamp}_products.csv"`,
      );
      return res.send(csv);
    }

    if (format === "zip") {
      if (!Array.isArray(images)) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "images array is required for zip export",
          });
      }

      const zipBuffer = await generateImagesZip(images, (msg) => {});

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeHost}_${stamp}_images.zip"`,
      );
      return res.send(zipBuffer);
    }

    return res
      .status(400)
      .json({ ok: false, error: `Unsupported export format: ${format}` });
  } catch (error) {
    console.error("Export generation failed:", error);
    res
      .status(500)
      .json({
        ok: false,
        error: error.message || "Failed to generate export file",
      });
  }
});

app.post("/api/scrape/latest", (req, res) => {
  latestResult = req.body;
  res.json({ ok: true });
});

app.get("/api/scrape/latest", (req, res) => {
  if (latestResult) {
    res.json({ ok: true, result: latestResult });
  } else {
    res.json({ ok: false, error: "No scrape results available" });
  }
});

function startServer(port) {
  const server = app.listen(port, () => {});

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1);
      return;
    }
    throw error;
  });
}

startServer(Number.isFinite(startPort) ? startPort : 3000);
