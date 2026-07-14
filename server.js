import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { scrapeStore } from "./scraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const startPort = Number.parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/output", express.static(path.join(__dirname, "output")));

let latestResult = null;

// SSE (Server-Sent Events) Endpoint for real-time logs and statistics
app.get("/api/scrape", async (req, res) => {
  const { storeUrl, downloadImages, threads, resume } = req.query || {};
  const isDownloadImages = downloadImages !== "false";
  const numThreads = parseInt(threads, 10) || 6;
  const isResume = resume === "true";

  if (!storeUrl) {
    return res.status(400).json({ ok: false, error: "storeUrl query parameter is required" });
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
      downloadImages: isDownloadImages,
      threads: numThreads,
      resume: isResume,
      onProgress: (message) => {
        console.log(message);
        sendEvent("progress", { message });
      },
      onStats: (summary) => {
        sendEvent("stats", { summary });
      }
    });

    sendEvent("complete", { result });
  } catch (error) {
    console.error(error);
    sendEvent("error", { error: error.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// Fallback POST Endpoint (JSON-only, no stream)
app.post("/api/scrape", async (req, res) => {
  try {
    const { storeUrl, downloadImages = true, threads = 6, resume = false } = req.body || {};
    const result = await scrapeStore({
      storeUrl,
      downloadImages,
      threads,
      resume,
      onProgress: (message) => console.log(message)
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
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
  const server = app.listen(port, () => {
    console.log(`Shopify web app running at http://localhost:${port}`);
  });

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
