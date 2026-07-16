process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs/promises";
import path from "path";
import { analyzeWebsite } from "./lib/analyzer.js";
import {
  extractShopifyProductsApi,
  extractShopifyProductsPlaywright,
  extractWooCommerceProducts,
  extractGenericProducts,
} from "./lib/extractors/products.js";
import { extractImageMetadata } from "./lib/extractors/images.js";
import { productsToCsv } from "./lib/managers/download.js";
import { Logger } from "./lib/utils/logger.js";

// Re-export helpers for test compatibility
export function normalizeStoreUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Store URL is required");
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeImageUrl(url) {
  if (!url) return "";
  let fullUrl = url.trim();
  if (fullUrl.startsWith("//")) {
    fullUrl = "https:" + fullUrl;
  }
  try {
    const parsed = new URL(fullUrl);
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(
      /_(\d+)x(\d+)(@2x)?(?=\.[A-Za-z0-9]+$)/,
      "",
    );
    return parsed.toString();
  } catch {
    return fullUrl;
  }
}

function safeFilename(value, fallback = "item") {
  return (
    String(value || "")
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-._\s]+|[-._\s]+$/g, "") || fallback
  );
}

/**
 * Main orchestrator for scraping store products and extracting image details.
 * No automatic image downloads to disk are performed during scrape.
 * Generates only Product CSV in local mode.
 */
export async function scrapeStore({
  storeUrl,
  threads = 4,
  resume = false,
  onProgress = () => {},
  onStats = () => {},
  cloudMode = false,
}) {
  const started = Date.now();
  const baseUrl = normalizeStoreUrl(storeUrl);
  onProgress(`Analyzing site before scraping: ${baseUrl}`);

  // 1. Analyze website to get CMS and details
  const analysis = await analyzeWebsite(baseUrl, onProgress);
  const cmsName = analysis.cms.name;
  
  let products = [];
  let sourceMode = "api";

  // 2. Route extraction based on CMS
  if (cmsName === "Shopify") {
    // Check if it's a single product page
    const parsedUrl = new URL(baseUrl);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const isSingleProduct = pathParts.length >= 2 && pathParts[pathParts.length - 2] === "products";

    if (isSingleProduct) {
      onProgress("Detected single Shopify product URL. Fetching direct details...");
      const handle = pathParts[pathParts.length - 1];
      const detailUrl = `${parsedUrl.origin}/products/${handle}.js`;
      const res = await fetch(detailUrl).catch(() => null);
      if (res && res.ok) {
        const product = await res.json();
        product.product_url = baseUrl;
        products.push(product);
        sourceMode = "single";
      } else {
        throw new Error(`Failed to fetch details for single Shopify product: ${handle}`);
      }
    } else {
      // Fetch all products via API
      products = await extractShopifyProductsApi(baseUrl, onProgress, cloudMode);
      
      // Fallback to Playwright if API returned nothing and not in cloud mode
      if (products.length === 0) {
        if (cloudMode) {
          throw new Error("This Shopify store blocks public API. Scraping is restricted in cloud mode.");
        } else {
          onProgress("Shopify API returned no products or is blocked. Falling back to Playwright crawler...");
          products = await extractShopifyProductsPlaywright(baseUrl, onProgress);
          sourceMode = "crawl";
        }
      }
    }
  } else if (cmsName === "WooCommerce") {
    products = await extractWooCommerceProducts(baseUrl, onProgress, cloudMode);
    sourceMode = "woocommerce_api";
  } else {
    onProgress(`CMS "${cmsName}" detected. Attempting generic schema-based product extraction...`);
    products = await extractGenericProducts(baseUrl, onProgress, cloudMode);
    sourceMode = "generic_crawl";
  }

  if (products.length === 0) {
    throw new Error("No products could be extracted from this store.");
  }

  // 3. Normalize products and extract images list
  onProgress(`Formatting ${products.length} products and compiling image list...`);
  
  // Format variants and details for Shopify
  const formattedRecords = products.map((product) => {
    // If it's already normalized (e.g. WooCommerce mapped), keep it
    if (product.body_html !== undefined && Array.isArray(product.variants)) {
      return product;
    }

    // Shopify raw JSON format mapping
    const bodyHtml = product.body_html || "";
    const description = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = Array.isArray(product.images) ? product.images : [];

    return {
      id: product.id ?? null,
      handle: product.handle || "",
      title: product.title || "",
      vendor: product.vendor || "",
      product_type: product.product_type || "",
      tags: Array.isArray(product.tags) ? product.tags : (product.tags ? String(product.tags).split(",").map(t => t.trim()) : []),
      status: product.status || (product.published_at ? "active" : "draft"),
      published_at: product.published_at || "",
      created_at: product.created_at || "",
      updated_at: product.updated_at || "",
      description: description,
      price: variants[0]?.price || "",
      compare_at_price: variants[0]?.compare_at_price || "",
      variants: variants.map(v => ({
        id: v.id || "",
        title: v.title || "Default Title",
        price: v.price || "",
        compare_at_price: v.compare_at_price || "",
        sku: v.sku || "",
        barcode: v.barcode || "",
      })),
      images: images.map(img => ({
        id: img.id || "",
        src: img.src || "",
        alt: img.alt || "",
        width: img.width || null,
        height: img.height || null,
      })),
      product_url: product.product_url || `${baseUrl}/products/${product.handle}`,
    };
  });

  // Extract images
  const imagesMetadata = extractImageMetadata(formattedRecords);

  // 4. Build Scrape Summary
  const elapsedSeconds = (Date.now() - started) / 1000;
  const summary = {
    totalProductsFound: formattedRecords.length,
    totalProductsScraped: formattedRecords.length,
    totalVariants: formattedRecords.reduce((acc, p) => acc + (p.variants?.length || 0), 0),
    totalImagesDownloaded: 0, // Images are not auto-downloaded
    totalFailures: 0,
    elapsedSeconds,
  };

  onStats(summary);

  // 5. Save only CSV file to disk if local mode
  let outputDir = "";
  let files = { csv: "" };

  if (!cloudMode) {
    const outputBase = path.join(process.cwd(), "output");
    outputDir = path.join(outputBase, safeFilename(new URL(baseUrl).hostname));
    await fs.mkdir(outputDir, { recursive: true });

    // Generate products CSV
    const csvContent = productsToCsv(formattedRecords);
    const csvPath = path.join(outputDir, "products.csv");
    await fs.writeFile(csvPath, csvContent, "utf8");
    files.csv = path.relative(process.cwd(), csvPath);
    onProgress(`CSV saved locally to: ${files.csv}`);
  }

  onProgress("Scrape complete!");

  return {
    sourceMode,
    summary,
    analysis,
    records: formattedRecords,
    images: imagesMetadata,
    outputDir: cloudMode ? "(temporary cloud storage)" : outputDir,
    files,
  };
}
