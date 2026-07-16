process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { productsToCsv, generateImagesZip } from "../lib/managers/download.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const { format, products, images, host = "export" } = req.body || {};

  if (!format) {
    res.status(400).json({ ok: false, error: "format is required" });
    return;
  }

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeHost = host.replace(/[^A-Za-z0-9._-]+/g, "_");

    if (format === "csv") {
      if (!Array.isArray(products)) {
        res.status(400).json({ ok: false, error: "products array is required for csv export" });
        return;
      }
      const csv = productsToCsv(products);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeHost}_${stamp}_products.csv"`);
      res.status(200).send(csv);
      return;
    } 
    
    if (format === "zip") {
      if (!Array.isArray(images)) {
        res.status(400).json({ ok: false, error: "images array is required for zip export" });
        return;
      }
      
      const zipBuffer = await generateImagesZip(images, (msg) => {
        console.log(`[Vercel ZIP progress] ${msg}`);
      });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${safeHost}_${stamp}_images.zip"`);
      res.status(200).send(zipBuffer);
      return;
    }

    res.status(400).json({ ok: false, error: `Unsupported export format: ${format}` });
  } catch (error) {
    console.error("Export generation failed:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to generate export file" });
  }
}
