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
import { compileAllMedia } from "./lib/extractors/media.js";
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
      /_(\d+x\d*|x\d+)(@\d+x)?(?=\.[A-Za-z0-9]+$)/i,
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
 * Main orchestrator for scraping store products, extracting images,
 * and discovering all website media (hero banners, site images, logos, and MP4/WebM videos).
 * Generates official Shopify import-ready CSV with active status.
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

  // 3. Normalize products and preserve all required Shopify fields
  onProgress(`Formatting ${products.length} products for official Shopify import...`);
  
  const formattedRecords = products.map((product) => {
    const bodyHtml = product.body_html || "";
    const description = product.description || bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = Array.isArray(product.images) ? product.images : [];
    const options = Array.isArray(product.options) ? product.options : [];
    const media = Array.isArray(product.media) ? product.media : [];

    return {
      id: product.id ?? null,
      handle: product.handle || safeFilename(product.title),
      title: product.title || "",
      vendor: product.vendor || "",
      product_category: product.product_category || "",
      product_type: product.product_type || "",
      tags: Array.isArray(product.tags) ? product.tags : (product.tags ? String(product.tags).split(",").map(t => t.trim()) : []),
      status: "active", // Required: status is always active for direct Shopify import
      published_at: product.published_at || new Date().toISOString(),
      created_at: product.created_at || "",
      updated_at: product.updated_at || "",
      body_html: bodyHtml || `<p>${description}</p>`,
      description: description,
      options: options,
      media: media,
      price: variants[0]?.price || product.price || "",
      compare_at_price: variants[0]?.compare_at_price || product.compare_at_price || "",
      variants: variants.map((v, vIdx) => ({
        id: v.id || "",
        title: v.title || (variants.length === 1 ? "Default Title" : `Variant ${vIdx + 1}`),
        price: v.price || "",
        compare_at_price: v.compare_at_price || "",
        sku: v.sku || "",
        barcode: v.barcode || "",
        option1: v.option1 || (variants.length === 1 ? "Default Title" : (v.title || "Default Title")),
        option2: v.option2 || "",
        option3: v.option3 || "",
        grams: v.grams ?? 0,
        weight_unit: v.weight_unit || "kg",
        inventory_quantity: (v.inventory_quantity !== undefined && v.inventory_quantity !== null) ? v.inventory_quantity : 1,
        requires_shipping: v.requires_shipping !== false,
        taxable: v.taxable !== false,
        image_id: v.image_id || null,
        featured_image: v.featured_image || null,
      })),
      images: images.map((img, idx) => ({
        id: img.id || `${product.id || "product"}_img_${idx}`,
        src: normalizeImageUrl(typeof img === "string" ? img : (img.src || img.url || "")),
        alt: (typeof img === "object" ? img.alt : "") || product.title || "",
        width: (typeof img === "object" ? img.width : null) || null,
        height: (typeof img === "object" ? img.height : null) || null,
      })),
      product_url: product.product_url || `${baseUrl}/products/${product.handle}`,
    };
  });

  // 4. Extract product gallery images
  const imagesMetadata = extractImageMetadata(formattedRecords);

  // 5. Compile all website media (hero banners, site images, logos, background graphics, and MP4/WebM videos)
  const mediaCompilation = await compileAllMedia({
    baseUrl,
    homepageHtml: analysis.homepageHtml || "",
    products: formattedRecords,
    productGalleryImages: imagesMetadata,
    onProgress,
  });

  // 6. Build Scrape Summary
  const elapsedSeconds = (Date.now() - started) / 1000;
  const summary = {
    totalProductsFound: formattedRecords.length,
    totalProductsScraped: formattedRecords.length,
    totalVariants: formattedRecords.reduce((acc, p) => acc + (p.variants?.length || 0), 0),
    totalProductImages: imagesMetadata.length,
    totalWebsiteImages: mediaCompilation.websiteMedia.images.length,
    totalVideos: mediaCompilation.allVideos.length,
    totalMediaFound: mediaCompilation.allMedia.length,
    totalFailures: 0,
    elapsedSeconds,
  };

  onStats(summary);

  // 7. Save Shopify-compliant CSV file to disk if local mode
  let outputDir = "";
  let files = { csv: "" };

  if (!cloudMode) {
    const outputBase = path.join(process.cwd(), "output");
    outputDir = path.join(outputBase, safeFilename(new URL(baseUrl).hostname));
    await fs.mkdir(outputDir, { recursive: true });

    // Generate products CSV with active status and Shopify spec
    const csvContent = productsToCsv(formattedRecords);
    const csvPath = path.join(outputDir, "products.csv");
    await fs.writeFile(csvPath, csvContent, "utf8");
    files.csv = path.relative(process.cwd(), csvPath);
    onProgress(`Shopify import-ready CSV saved locally to: ${files.csv}`);
  }

  onProgress("Scrape complete! Products and all website media extracted.");

  return {
    sourceMode,
    summary,
    analysis,
    records: formattedRecords,
    images: imagesMetadata,
    websiteMedia: mediaCompilation.websiteMedia,
    productMedia: mediaCompilation.productMedia,
    videos: mediaCompilation.allVideos,
    allMedia: mediaCompilation.allMedia,
    outputDir: cloudMode ? "(temporary cloud storage)" : outputDir,
    files,
  };
}
