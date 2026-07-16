process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { analyzeWebsite } from "../lib/analyzer.js";

export default async function handler(req, res) {
  // Support both GET and POST
  const storeUrl = req.method === "POST" ? req.body?.storeUrl : req.query?.storeUrl;

  if (!storeUrl) {
    res.status(400).json({ ok: false, error: "storeUrl query parameter is required" });
    return;
  }

  try {
    const result = await analyzeWebsite(storeUrl, (msg) => {
      console.log(`[Vercel Analyze] ${msg}`);
    });
    
    // Set caching headers for serverless efficiency
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error("Analysis failed:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to analyze website" });
  }
}
