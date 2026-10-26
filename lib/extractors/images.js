import path from "path";

/**
 * Normalizes Shopify image URLs by stripping size modifiers.
 */
export function normalizeImageUrl(url) {
  if (!url) return "";
  let fullUrl = url.trim();
  if (fullUrl.startsWith("//")) {
    fullUrl = "https:" + fullUrl;
  }
  try {
    const parsed = new URL(fullUrl);
    parsed.search = "";
    // Strips Shopify dimensions modifiers like _300x300, _150x, _x200, _800x800@2x, etc.
    parsed.pathname = parsed.pathname.replace(
      /_(\d+x\d*|x\d+)(@\d+x)?(?=\.[A-Za-z0-9]+$)/i,
      "",
    );
    return parsed.toString();
  } catch {
    return fullUrl;
  }
}

/**
 * Extracts and compiles a list of image metadata objects from Shopify/WooCommerce products.
 */
export function extractImageMetadata(products) {
  const images = [];
  const processedUrls = new Set();

  for (const product of products) {
    const title = product.title || "Product";
    
    // Shopify stores images in product.images (an array of objects)
    const productImages = Array.isArray(product.images) ? product.images : [];
    
    productImages.forEach((img, idx) => {
      let src = "";
      let width = null;
      let height = null;
      let alt = "";

      if (typeof img === "string") {
        src = img;
      } else if (img && typeof img === "object") {
        src = img.src || img.url || "";
        width = img.width || null;
        height = img.height || null;
        alt = img.alt || "";
      }

      if (!src) return;

      const normalizedSrc = normalizeImageUrl(src);

      // Prevent duplicates
      if (processedUrls.has(normalizedSrc)) return;
      processedUrls.add(normalizedSrc);

      // Extract filename from URL
      let filename = "image.jpg";
      try {
        const u = new URL(normalizedSrc);
        filename = path.basename(u.pathname) || "image.jpg";
      } catch {
        // Fallback
      }

      // Format resolution
      let resolution = "Unknown";
      if (width && height) {
        resolution = `${width}x${height}`;
      } else {
        // Try to parse dimensions from Shopify image filename if still present, or leave as Unknown
        const dimMatch = src.match(/_(\d+)x(\d+)(@2x)?(?=\.[A-Za-z0-9]+$)/);
        if (dimMatch) {
          resolution = `${dimMatch[1]}x${dimMatch[2]}`;
        }
      }

      images.push({
        id: img.id || `${product.id || "product"}_img_${idx}`,
        src: normalizedSrc,
        thumbnail: src, // Use the original src (which might be smaller) as the thumbnail
        filename,
        resolution,
        alt: alt.trim() || title,
        productTitle: title,
        productHandle: product.handle || "",
      });
    });
  }

  return images;
}
