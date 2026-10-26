import JSZip from "jszip";
import { fetchWithRetry, pool } from "../utils/http.js";
import { Logger } from "../utils/logger.js";
import { normalizeImageUrl } from "../extractors/images.js";

/**
 * Escapes a cell value for CSV formatting following RFC 4180 standard.
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Helper to generate a clean URL-friendly handle/slug from text.
 */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

/**
 * Official Shopify Product CSV Header specification (51 columns).
 * Matches Shopify Admin product export & import format exactly.
 */
export const SHOPIFY_CSV_HEADERS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Google Shopping / Google Product Category",
  "Google Shopping / Gender",
  "Google Shopping / Age Group",
  "Google Shopping / MPN",
  "Google Shopping / AdWords Grouping",
  "Google Shopping / AdWords Labels",
  "Google Shopping / Condition",
  "Google Shopping / Custom Product",
  "Google Shopping / Custom Label 0",
  "Google Shopping / Custom Label 1",
  "Google Shopping / Custom Label 2",
  "Google Shopping / Custom Label 3",
  "Google Shopping / Custom Label 4",
  "Variant Image",
  "Variant Weight Unit",
  "Variant Tax Code",
  "Cost per item",
  "Price / International",
  "Compare At Price / International",
  "Status",
];

/**
 * Converts product records into official Shopify-compliant CSV format with active status.
 * Can be directly uploaded to Shopify Admin without errors.
 */
export function productsToShopifyCsv(products) {
  if (!products || !products.length) return "";

  const lines = [SHOPIFY_CSV_HEADERS.map(csvEscape).join(",")];

  for (const product of products) {
    const title = product.title || "Untitled Product";
    const handle = (product.handle || slugify(title)).toLowerCase();
    
    // Body HTML (prefer body_html, fallback to description)
    let bodyHtml = product.body_html;
    if (bodyHtml === undefined || bodyHtml === null || bodyHtml === "") {
      bodyHtml = product.description ? `<p>${product.description}</p>` : "";
    }

    const vendor = product.vendor || "";
    const productCategory = product.product_category || "";
    const productType = product.product_type || "";

    // Tags
    let tags = "";
    if (Array.isArray(product.tags)) {
      tags = product.tags.filter(Boolean).join(", ");
    } else if (typeof product.tags === "string") {
      tags = product.tags;
    }

    // Status is always active for instant Shopify publishing
    const status = "active";
    const published = "TRUE";
    const giftCard = "FALSE";
    const seoTitle = product.seo_title || title;
    const seoDescription = product.seo_description || (product.description || "").substring(0, 320);

    // Options mapping
    const options = Array.isArray(product.options) ? product.options : [];
    
    // Variants mapping
    const rawVariants = Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants
      : [{
          title: "Default Title",
          price: product.price || "0.00",
          compare_at_price: product.compare_at_price || "",
          sku: product.sku || "",
          barcode: product.barcode || "",
          option1: "Default Title",
          inventory_quantity: 1,
        }];

    // Determine option names
    const hasMultipleVariants = rawVariants.length > 1;
    const opt1Name = options[0]?.name || (hasMultipleVariants ? (rawVariants[0]?.option1_name || "Size") : "Title");
    const opt2Name = options[1]?.name || (rawVariants.some(v => v.option2) ? (rawVariants[0]?.option2_name || "Color") : "");
    const opt3Name = options[2]?.name || (rawVariants.some(v => v.option3) ? (rawVariants[0]?.option3_name || "Material") : "");

    // Images mapping
    const rawImages = Array.isArray(product.images) ? product.images : [];
    const images = rawImages.map(img => {
      let src = "";
      let alt = "";
      if (typeof img === "string") {
        src = normalizeImageUrl(img);
        alt = title;
      } else if (img && typeof img === "object") {
        src = normalizeImageUrl(img.src || img.url || "");
        alt = img.alt || title;
      }
      return { src, alt };
    }).filter(img => Boolean(img.src));

    // Map image_id to URL for variant images
    const imageMap = new Map();
    rawImages.forEach(img => {
      if (img && typeof img === "object" && img.id && img.src) {
        imageMap.set(String(img.id), normalizeImageUrl(img.src));
      }
    });

    // Total rows needed for this product in Shopify CSV
    const totalRows = Math.max(rawVariants.length, images.length, 1);

    for (let i = 0; i < totalRows; i++) {
      const isFirstRow = (i === 0);
      const variant = rawVariants[i] || null;
      const image = images[i] || null;

      // Variant image lookup
      let variantImageUrl = "";
      if (variant) {
        if (variant.image_id && imageMap.has(String(variant.image_id))) {
          variantImageUrl = imageMap.get(String(variant.image_id));
        } else if (variant.featured_image?.src) {
          variantImageUrl = normalizeImageUrl(variant.featured_image.src);
        } else if (variant.image?.src) {
          variantImageUrl = normalizeImageUrl(variant.image.src);
        }
      }

      // Option values resolution
      let opt1Val = "";
      let opt2Val = "";
      let opt3Val = "";
      if (variant) {
        if (hasMultipleVariants) {
          opt1Val = variant.option1 || variant.title || "Default Title";
          opt2Val = variant.option2 || "";
          opt3Val = variant.option3 || "";
        } else {
          opt1Val = variant.option1 || "Default Title";
        }
      }

      // Inventory quantity (default 1 to ensure stock is active upon import)
      let inventoryQty = "";
      if (variant) {
        if (variant.inventory_quantity !== undefined && variant.inventory_quantity !== null) {
          inventoryQty = String(variant.inventory_quantity);
        } else {
          inventoryQty = "1";
        }
      }

      // Price formatting
      let price = "";
      if (variant && variant.price !== undefined && variant.price !== null && variant.price !== "") {
        price = String(variant.price).replace(/[^0-9.]/g, "");
      }

      let compareAtPrice = "";
      if (variant && variant.compare_at_price !== undefined && variant.compare_at_price !== null && variant.compare_at_price !== "") {
        compareAtPrice = String(variant.compare_at_price).replace(/[^0-9.]/g, "");
      }

      const rowData = {
        "Handle": handle,
        "Title": isFirstRow ? title : "",
        "Body (HTML)": isFirstRow ? bodyHtml : "",
        "Vendor": isFirstRow ? vendor : "",
        "Product Category": isFirstRow ? productCategory : "",
        "Type": isFirstRow ? productType : "",
        "Tags": isFirstRow ? tags : "",
        "Published": isFirstRow ? published : "",
        "Option1 Name": variant ? opt1Name : "",
        "Option1 Value": variant ? opt1Val : "",
        "Option2 Name": (variant && opt2Name) ? opt2Name : "",
        "Option2 Value": variant ? opt2Val : "",
        "Option3 Name": (variant && opt3Name) ? opt3Name : "",
        "Option3 Value": variant ? opt3Val : "",
        "Variant SKU": variant ? (variant.sku || "") : "",
        "Variant Grams": variant ? (variant.grams ?? 0) : "",
        "Variant Inventory Tracker": variant ? "shopify" : "",
        "Variant Inventory Qty": inventoryQty,
        "Variant Inventory Policy": variant ? "deny" : "",
        "Variant Fulfillment Service": variant ? "manual" : "",
        "Variant Price": price,
        "Variant Compare At Price": compareAtPrice,
        "Variant Requires Shipping": variant ? (variant.requires_shipping === false ? "FALSE" : "TRUE") : "",
        "Variant Taxable": variant ? (variant.taxable === false ? "FALSE" : "TRUE") : "",
        "Variant Barcode": variant ? (variant.barcode || "") : "",
        "Image Src": image ? image.src : "",
        "Image Position": image ? (i + 1) : "",
        "Image Alt Text": image ? (image.alt || title) : "",
        "Gift Card": isFirstRow ? giftCard : "",
        "SEO Title": isFirstRow ? seoTitle : "",
        "SEO Description": isFirstRow ? seoDescription : "",
        "Google Shopping / Google Product Category": "",
        "Google Shopping / Gender": "",
        "Google Shopping / Age Group": "",
        "Google Shopping / MPN": "",
        "Google Shopping / AdWords Grouping": "",
        "Google Shopping / AdWords Labels": "",
        "Google Shopping / Condition": "",
        "Google Shopping / Custom Product": "",
        "Google Shopping / Custom Label 0": "",
        "Google Shopping / Custom Label 1": "",
        "Google Shopping / Custom Label 2": "",
        "Google Shopping / Custom Label 3": "",
        "Google Shopping / Custom Label 4": "",
        "Variant Image": variantImageUrl,
        "Variant Weight Unit": variant ? (variant.weight_unit || "kg") : "",
        "Variant Tax Code": "",
        "Cost per item": "",
        "Price / International": "",
        "Compare At Price / International": "",
        "Status": isFirstRow ? status : "",
      };

      const line = SHOPIFY_CSV_HEADERS.map((header) => csvEscape(rowData[header])).join(",");
      lines.push(line);
    }
  }

  // Prepend UTF-8 BOM so Excel and Shopify read UTF-8 characters without encoding glitches
  return "\uFEFF" + lines.join("\r\n");
}

/**
 * Backward-compatible export pointing to Shopify standard format.
 */
export const productsToCsv = productsToShopifyCsv;

/**
 * Downloads a list of media items (Images + Videos) and bundles them into an organized ZIP buffer.
 * Automatically sorts into folders: products/images, products/videos, website/images, website/videos.
 */
export async function generateMediaZip(items, onProgress = null, options = {}) {
  if (!items || !items.length) {
    throw new Error("No media items provided for ZIP generation.");
  }

  const zip = new JSZip();
  let count = 0;
  const total = items.length;

  onProgress?.(`Starting bundle generation for ${total} media assets (Images & Videos)...`);

  // Detect whether to use subfolder organization
  const hasMultipleCategories = items.some(item => item.category === "website") && items.some(item => item.category === "product");
  const hasMixedTypes = items.some(item => item.type === "video") && items.some(item => item.type === "image");
  const useFolders = options.useFolders ?? (hasMultipleCategories || hasMixedTypes);

  // Fetch media items concurrently (concurrency limit = 4)
  await pool(items, 4, async (item) => {
    try {
      const { src, filename, type = "image", category = "product" } = item;
      if (!src) return;

      const isVideo = type === "video" || /\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(src);
      const timeout = isVideo ? 45000 : 15000;

      const res = await fetchWithRetry(src, { timeout }, 2).catch(() => null);
      if (res && res.ok) {
        const buffer = await res.arrayBuffer();

        // Determine destination folder inside zip
        let folderPrefix = "";
        if (useFolders) {
          const catFolder = category === "website" ? "website" : "products";
          const typeFolder = isVideo ? "videos" : "images";
          folderPrefix = `${catFolder}/${typeFolder}/`;
        }

        // Clean & deduplicate filename inside zip
        let safeName = filename || (isVideo ? "video.mp4" : "image.jpg");
        safeName = safeName.replace(/[^A-Za-z0-9._-]+/g, "_");

        let zipPath = `${folderPrefix}${safeName}`;
        let index = 1;

        while (zip.file(zipPath)) {
          const ext = safeName.includes(".") ? safeName.split(".").pop() : (isVideo ? "mp4" : "jpg");
          const base = safeName.includes(".") ? safeName.substring(0, safeName.lastIndexOf(".")) : safeName;
          zipPath = `${folderPrefix}${base}_${index}.${ext}`;
          index += 1;
        }

        zip.file(zipPath, buffer);
        count += 1;
        onProgress?.(`Downloaded & zipped [${isVideo ? "Video" : "Image"}] ${count}/${total}: ${zipPath}`);
      } else {
        onProgress?.(`Failed to download ${isVideo ? "video" : "image"}: ${src} (Status: ${res ? res.status : "Error"})`);
      }
    } catch (err) {
      Logger.error(`Error zipping media item: ${err.message}`);
      onProgress?.(`Error downloading ${item.filename || item.src}: ${err.message}`);
    }
  });

  if (count === 0) {
    throw new Error("No media items were successfully downloaded to bundle.");
  }

  onProgress?.(`Compressing ZIP archive (${count} files included)...`);
  return await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/**
 * Backward-compatible export for image ZIP generation.
 */
export const generateImagesZip = generateMediaZip;

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
    `Product gallery images: ${summary.totalProductImages || 0}`,
    `Website images & banners: ${summary.totalWebsiteImages || 0}`,
    `Videos discovered (MP4/WebM): ${summary.totalVideos || 0}`,
    `Failures encountered: ${summary.totalFailures || 0}`,
    `Elapsed time: ${(summary.elapsedSeconds || 0).toFixed(2)} seconds`,
    "=========================================",
  ].join("\n");
}
