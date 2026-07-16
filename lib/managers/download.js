import JSZip from "jszip";
import { fetchWithRetry, pool } from "../utils/http.js";
import { Logger } from "../utils/logger.js";

/**
 * Escapes a cell value for CSV formatting.
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Converts product objects into a clean CSV string.
 */
export function productsToCsv(products) {
  if (!products || !products.length) return "";

  const headers = [
    "id",
    "handle",
    "title",
    "vendor",
    "product_type",
    "tags",
    "status",
    "published_at",
    "created_at",
    "updated_at",
    "description",
    "price",
    "compare_at_price",
    "sku",
    "barcode",
    "featured_image",
    "image_urls",
    "product_url",
  ];

  const lines = [headers.map(csvEscape).join(",")];

  for (const product of products) {
    // Map product data to the standard headers
    const row = headers.map((key) => {
      let val = product[key];
      
      // Extract first element or join array properties
      if (key === "price" && Array.isArray(product.variants) && product.variants.length > 0) {
        val = product.variants[0].price || "";
      } else if (key === "compare_at_price" && Array.isArray(product.variants) && product.variants.length > 0) {
        val = product.variants[0].compare_at_price || "";
      } else if (key === "sku" && Array.isArray(product.variants) && product.variants.length > 0) {
        val = product.variants.map(v => v.sku).filter(Boolean).join(" | ");
      } else if (key === "barcode" && Array.isArray(product.variants) && product.variants.length > 0) {
        val = product.variants.map(v => v.barcode).filter(Boolean).join(" | ");
      } else if (Array.isArray(val)) {
        val = val.join(", ");
      } else if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      
      return val;
    });

    lines.push(row.map(csvEscape).join(","));
  }

  return lines.join("\n");
}

/**
 * Downloads a list of image URLs and bundles them into a ZIP buffer.
 */
export async function generateImagesZip(images, onProgress = null) {
  const zip = new JSZip();
  let count = 0;
  const total = images.length;

  onProgress?.(`Starting bundle generation for ${total} images...`);

  // Use a pool to fetch images concurrently (concurrency limit = 5)
  await pool(images, 5, async (img) => {
    try {
      const { src, filename } = img;
      if (!src) return;

      const res = await fetchWithRetry(src, { timeout: 12000 }, 2).catch(() => null);
      if (res && res.ok) {
        const buffer = await res.arrayBuffer();
        
        // Deduplicate filename inside the zip
        let name = filename;
        let index = 1;
        while (zip.file(name)) {
          const ext = name.includes(".") ? name.split(".").pop() : "jpg";
          const base = name.includes(".") ? name.substring(0, name.lastIndexOf(".")) : name;
          name = `${base}_${index}.${ext}`;
          index += 1;
        }

        zip.file(name, buffer);
        count += 1;
        onProgress?.(`Downloaded & zipped image ${count}/${total}: ${name}`);
      } else {
        onProgress?.(`Failed to download image: ${src} (Status: ${res ? res.status : "Error"})`);
      }
    } catch (err) {
      Logger.error(`Error zipping image: ${err.message}`);
      onProgress?.(`Error downloading image: ${err.message}`);
    }
  });

  if (count === 0) {
    throw new Error("No images were successfully downloaded to bundle.");
  }

  onProgress?.("Generating ZIP file compression...");
  return await zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Generates a text-based scrape report summary.
 */
export function generateReport(summary) {
  return [
    "=========================================",
    "       WEBSITE SCRAPER RUN REPORT        ",
    "=========================================",
    `Timestamp: ${new Date().toISOString()}`,
    `Products found: ${summary.totalProductsFound || 0}`,
    `Products scraped: ${summary.totalProductsScraped || 0}`,
    `Variants processed: ${summary.totalVariants || 0}`,
    `Failures encountered: ${summary.totalFailures || 0}`,
    `Elapsed time: ${(summary.elapsedSeconds || 0).toFixed(2)} seconds`,
    "=========================================",
  ].join("\n");
}
