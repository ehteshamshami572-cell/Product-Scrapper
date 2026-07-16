process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { scrapeStore } from "../scraper.js";

export default async function handler(req, res) {
  // Support GET for SSE stream
  if (req.method === "GET") {
    const { storeUrl, threads } = req.query || {};
    const numThreads = parseInt(threads, 10) || 4;

    if (!storeUrl) {
      res.status(400).json({ ok: false, error: "storeUrl query parameter is required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

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
        cloudMode: true, // Vercel is always cloud mode
        onProgress: (message) => {
          console.log(`[Vercel Scrape Progress] ${message}`);
          sendEvent("progress", { message });
        },
        onStats: (summary) => {
          sendEvent("stats", { summary });
        }
      });

      sendEvent("complete", { result });
    } catch (error) {
      console.error("Vercel Scrape error:", error);
      sendEvent("error", { error: error.message || "An error occurred during the scrape." });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
    return;
  }

  // Fallback POST method returning JSON
  if (req.method === "POST") {
    try {
      const { storeUrl, threads = 4 } = req.body || {};
      if (!storeUrl) {
        res.status(400).json({ ok: false, error: "storeUrl is required" });
        return;
      }
      const result = await scrapeStore({
        storeUrl,
        threads,
        cloudMode: true,
        onProgress: (msg) => console.log(msg),
        onStats: () => {}
      });
      res.status(200).json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "Scrape failed" });
    }
    return;
  }

  res.status(405).json({ ok: false, error: "Method not allowed" });
}
