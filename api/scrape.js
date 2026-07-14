import { scrapeStore } from "../scraper.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const {
      storeUrl,
      downloadImages = false,
      threads = 4,
      resume = false,
      cloudMode = true
    } = req.body || {};

    if (!storeUrl) {
      res.status(400).json({ ok: false, error: "storeUrl is required" });
      return;
    }

    const result = await scrapeStore({
      storeUrl,
      downloadImages,
      threads,
      resume,
      cloudMode,
      onProgress: () => {},
      onStats: () => {}
    });

    res.status(200).json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Scrape failed" });
  }
}
