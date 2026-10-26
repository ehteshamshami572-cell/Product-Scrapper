import path from "path";
import { normalizeImageUrl } from "./images.js";
import { fetchWithRetry } from "../utils/http.js";
import { Logger } from "../utils/logger.js";

/**
 * Normalizes video URLs (handles protocol-relative, resolves relative to baseUrl, strips query noise).
 */
export function normalizeVideoUrl(url, baseUrl = "") {
  if (!url) return "";
  let fullUrl = String(url).trim().replace(/\\\/+/g, "/"); // Unescape escaped slashes like \/

  if (fullUrl.startsWith("//")) {
    fullUrl = "https:" + fullUrl;
  } else if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
    if (baseUrl) {
      try {
        fullUrl = new URL(fullUrl, baseUrl).toString();
      } catch {
        return "";
      }
    } else {
      fullUrl = `https://${fullUrl.replace(/^\/+/, "")}`;
    }
  }

  try {
    const parsed = new URL(fullUrl);
    // Keep protocol and host, clean hash
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fullUrl;
  }
}

/**
 * Normalizes any image or asset URL relative to baseUrl.
 */
export function normalizeAssetUrl(url, baseUrl = "") {
  if (!url) return "";
  let fullUrl = String(url).trim().replace(/\\\/+/g, "/");

  // Skip tiny data URIs or tracking pixels
  if (fullUrl.startsWith("data:") && fullUrl.length < 200) return "";
  if (fullUrl.includes("facebook.com/tr") || fullUrl.includes("google-analytics.com") || fullUrl.includes("doubleclick.net")) {
    return "";
  }

  if (fullUrl.startsWith("//")) {
    fullUrl = "https:" + fullUrl;
  } else if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://") && !fullUrl.startsWith("data:")) {
    if (baseUrl) {
      try {
        fullUrl = new URL(fullUrl, baseUrl).toString();
      } catch {
        return "";
      }
    } else {
      fullUrl = `https://${fullUrl.replace(/^\/+/, "")}`;
    }
  }

  return normalizeImageUrl(fullUrl);
}

/**
 * Helper to get clean safe filename from URL.
 */
export function getSafeFilename(urlStr, fallback = "media_item") {
  try {
    const parsed = new URL(urlStr);
    const base = path.basename(parsed.pathname);
    if (base && base.includes(".")) {
      const clean = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
      if (clean) return clean;
    }
  } catch {}
  return fallback;
}

/**
 * Extracts candidate URLs from srcset attributes and returns the highest resolution candidate.
 */
function getBestUrlFromSrcset(srcset, baseUrl) {
  if (!srcset || typeof srcset !== "string") return "";
  const parts = srcset.split(",").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return "";

  let bestUrl = "";
  let maxWeight = -1;

  for (const part of parts) {
    const tokens = part.split(/\s+/);
    const candidateUrl = tokens[0];
    const descriptor = tokens[1] || "";

    let weight = 0;
    if (descriptor.endsWith("w")) {
      weight = parseInt(descriptor, 10) || 0;
    } else if (descriptor.endsWith("x")) {
      weight = (parseFloat(descriptor) || 1) * 1000;
    }

    if (weight > maxWeight) {
      maxWeight = weight;
      bestUrl = candidateUrl;
    }
  }

  return normalizeAssetUrl(bestUrl || parts[parts.length - 1].split(/\s+/)[0], baseUrl);
}

/**
 * Extracts all images and videos from raw HTML content (e.g. Homepage, Landing page, Section HTML).
 */
export function extractMediaFromHtml(html, baseUrl, defaultCategory = "website") {
  if (!html || typeof html !== "string") return { images: [], videos: [] };

  const images = [];
  const videos = [];
  const processedImageUrls = new Set();
  const processedVideoUrls = new Set();

  // -------------------------------------------------------------
  // 1. EXTRACT VIDEOS
  // -------------------------------------------------------------

  // A. <video> tags with src or <source> child tags
  const videoTagMatches = [...html.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)];
  for (const match of videoTagMatches) {
    const videoAttrs = match[1];
    const innerHtml = match[2];

    // Poster
    const posterMatch = videoAttrs.match(/poster=["']([^"']+)["']/i);
    const poster = posterMatch ? normalizeAssetUrl(posterMatch[1], baseUrl) : "";

    // Direct src in video tag
    const srcMatch = videoAttrs.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      const videoUrl = normalizeVideoUrl(srcMatch[1], baseUrl);
      if (videoUrl && !processedVideoUrls.has(videoUrl)) {
        processedVideoUrls.add(videoUrl);
        const filename = getSafeFilename(videoUrl, `video_${videos.length + 1}.mp4`);
        videos.push({
          id: `vid_${videos.length + 1}`,
          src: videoUrl,
          thumbnail: poster || "",
          filename,
          type: "video",
          category: defaultCategory,
          format: filename.split(".").pop() || "mp4",
          resolution: "HD Video",
          alt: "Website Video",
        });
      }
    }

    // Child <source> tags
    const sourceMatches = [...innerHtml.matchAll(/<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
    for (const sMatch of sourceMatches) {
      const videoUrl = normalizeVideoUrl(sMatch[1], baseUrl);
      if (videoUrl && !processedVideoUrls.has(videoUrl)) {
        processedVideoUrls.add(videoUrl);
        const filename = getSafeFilename(videoUrl, `video_${videos.length + 1}.mp4`);
        videos.push({
          id: `vid_${videos.length + 1}`,
          src: videoUrl,
          thumbnail: poster || "",
          filename,
          type: "video",
          category: defaultCategory,
          format: filename.split(".").pop() || "mp4",
          resolution: "HD Video",
          alt: "Website Video",
        });
      }
    }
  }

  // B. Regex scan for direct video links in HTML & JavaScript/JSON (including escaped slashes)
  // Catches: Shopify CDN videos, MP4, WebM, MOV, M4V
  const videoRegex = /(?:https?:)?(?:\\\/\\\/|\/\/)[^\s"'<>]+\.(?:mp4|webm|mov|m4v)(?:\?[^"'\s\\]*)?/gi;
  const rawVideoMatches = [...html.matchAll(videoRegex)];
  for (const m of rawVideoMatches) {
    const rawUrl = m[0];
    const videoUrl = normalizeVideoUrl(rawUrl, baseUrl);
    if (videoUrl && !processedVideoUrls.has(videoUrl)) {
      processedVideoUrls.add(videoUrl);
      const filename = getSafeFilename(videoUrl, `video_${videos.length + 1}.mp4`);
      videos.push({
        id: `vid_${videos.length + 1}`,
        src: videoUrl,
        thumbnail: "",
        filename,
        type: "video",
        category: defaultCategory,
        format: filename.split(".").pop() || "mp4",
        resolution: "HD Video",
        alt: "Website Video Asset",
      });
    }
  }

  // -------------------------------------------------------------
  // 2. EXTRACT IMAGES
  // -------------------------------------------------------------

  // A. <img> tags (src, data-src, srcset, alt)
  const imgTagMatches = [...html.matchAll(/<img\b([^>]*)>/gi)];
  for (const match of imgTagMatches) {
    const attrs = match[1];

    let src = "";
    // Check high-res srcset first
    const srcsetMatch = attrs.match(/\b(?:data-srcset|srcset)=["']([^"']+)["']/i);
    if (srcsetMatch) {
      src = getBestUrlFromSrcset(srcsetMatch[1], baseUrl);
    }

    // Check data-src, data-original, data-high-res-src
    if (!src) {
      const dataSrcMatch = attrs.match(/\b(?:data-src|data-original|data-high-res-src|data-full-src)=["']([^"']+)["']/i);
      if (dataSrcMatch) {
        src = normalizeAssetUrl(dataSrcMatch[1], baseUrl);
      }
    }

    // Fallback to standard src
    if (!src) {
      const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
      if (srcMatch) {
        src = normalizeAssetUrl(srcMatch[1], baseUrl);
      }
    }

    if (!src || processedImageUrls.has(src)) continue;
    if (src.startsWith("data:") && src.length < 500) continue; // Ignore tiny base64 placeholders

    // Extract alt
    const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1].trim() : "Website Image";

    // Extract width/height
    const widthMatch = attrs.match(/\bwidth=["']?(\d+)["']?/i);
    const heightMatch = attrs.match(/\bheight=["']?(\d+)["']?/i);
    const resolution = (widthMatch && heightMatch) ? `${widthMatch[1]}x${heightMatch[1]}` : "Standard";

    processedImageUrls.add(src);
    const filename = getSafeFilename(src, `site_img_${images.length + 1}.jpg`);

    images.push({
      id: `site_img_${images.length + 1}`,
      src,
      thumbnail: src,
      filename,
      type: "image",
      category: defaultCategory,
      resolution,
      alt: alt || "Website Image",
    });
  }

  // B. <picture> <source srcset="...">
  const pictureSourceMatches = [...html.matchAll(/<source\b[^>]*\b(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi)];
  for (const match of pictureSourceMatches) {
    const src = getBestUrlFromSrcset(match[1], baseUrl);
    if (src && !processedImageUrls.has(src)) {
      processedImageUrls.add(src);
      const filename = getSafeFilename(src, `site_banner_${images.length + 1}.jpg`);
      images.push({
        id: `site_img_${images.length + 1}`,
        src,
        thumbnail: src,
        filename,
        type: "image",
        category: defaultCategory,
        resolution: "High-Res Banner",
        alt: "Website Banner",
      });
    }
  }

  // C. CSS Background Images in style attributes: style="...url('...')..."
  const cssUrlMatches = [...html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)];
  for (const match of cssUrlMatches) {
    const rawUrl = match[1];
    if (rawUrl.startsWith("data:") && rawUrl.length < 500) continue;
    const src = normalizeAssetUrl(rawUrl, baseUrl);
    if (src && !processedImageUrls.has(src)) {
      // Check if image extension or shopify cdn
      if (/\.(jpe?g|png|webp|gif|svg|avif)(?:\?|$)/i.test(src) || src.includes("/cdn/shop/") || src.includes("/s/files/")) {
        processedImageUrls.add(src);
        const filename = getSafeFilename(src, `bg_img_${images.length + 1}.jpg`);
        images.push({
          id: `site_img_${images.length + 1}`,
          src,
          thumbnail: src,
          filename,
          type: "image",
          category: defaultCategory,
          resolution: "Background Graphic",
          alt: "Website Background Image",
        });
      }
    }
  }

  // D. Meta OpenGraph & Twitter image tags
  const ogImageMatches = [...html.matchAll(/<meta\b[^>]*\b(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/gi)];
  for (const match of ogImageMatches) {
    const src = normalizeAssetUrl(match[1], baseUrl);
    if (src && !processedImageUrls.has(src)) {
      processedImageUrls.add(src);
      const filename = getSafeFilename(src, `social_share_${images.length + 1}.jpg`);
      images.push({
        id: `site_img_${images.length + 1}`,
        src,
        thumbnail: src,
        filename,
        type: "image",
        category: defaultCategory,
        resolution: "Social Banner",
        alt: "Website Social Media Image",
      });
    }
  }

  // E. Shopify Theme Asset Images found in JSON or theme script tags
  const shopifyCdnImgRegex = /(?:https?:)?(?:\\\/\\\/|\/\/)[^\s"'<>]+\/s\/files\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif|svg|avif)(?:\?[^"'\s\\]*)?/gi;
  const rawShopifyImgMatches = [...html.matchAll(shopifyCdnImgRegex)];
  for (const m of rawShopifyImgMatches) {
    const src = normalizeAssetUrl(m[0], baseUrl);
    if (src && !processedImageUrls.has(src)) {
      processedImageUrls.add(src);
      const filename = getSafeFilename(src, `asset_${images.length + 1}.jpg`);
      images.push({
        id: `site_img_${images.length + 1}`,
        src,
        thumbnail: src,
        filename,
        type: "image",
        category: defaultCategory,
        resolution: "Theme Asset",
        alt: "Shopify Theme Asset Image",
      });
    }
  }

  return { images, videos };
}

/**
 * Extracts product videos and embedded description media from product objects.
 */
export function extractProductVideosAndMedia(products) {
  const videos = [];
  const extraImages = [];
  const processedVideoUrls = new Set();
  const processedImageUrls = new Set();

  for (const product of products) {
    const title = product.title || "Product";
    const handle = product.handle || "product";

    // 1. Shopify Media array (e.g. from GraphQL / API)
    if (Array.isArray(product.media)) {
      for (const item of product.media) {
        if (item.media_type === "video" && Array.isArray(item.sources)) {
          // Find highest resolution MP4
          const mp4Sources = item.sources.filter(s => s.format === "mp4" || s.mime_type?.includes("mp4"));
          const bestSource = (mp4Sources.length > 0)
            ? mp4Sources.sort((a, b) => (b.width || 0) - (a.width || 0))[0]
            : item.sources[0];

          if (bestSource?.url) {
            const videoUrl = normalizeVideoUrl(bestSource.url);
            if (videoUrl && !processedVideoUrls.has(videoUrl)) {
              processedVideoUrls.add(videoUrl);
              const previewImg = item.preview_image?.src ? normalizeImageUrl(item.preview_image.src) : "";
              const filename = `${handle}_video_${videos.length + 1}.mp4`;
              videos.push({
                id: `prod_vid_${videos.length + 1}`,
                src: videoUrl,
                thumbnail: previewImg,
                filename,
                type: "video",
                category: "product",
                format: "mp4",
                resolution: bestSource.width ? `${bestSource.width}x${bestSource.height}` : "HD",
                alt: `${title} Video`,
                productTitle: title,
                productHandle: handle,
              });
            }
          }
        }
      }
    }

    // 2. Scan body_html for embedded videos and images
    const bodyHtml = product.body_html || "";
    if (bodyHtml) {
      const extracted = extractMediaFromHtml(bodyHtml, "", "product");

      for (const v of extracted.videos) {
        if (!processedVideoUrls.has(v.src)) {
          processedVideoUrls.add(v.src);
          v.id = `prod_vid_${videos.length + 1}`;
          v.filename = `${handle}_${v.filename}`;
          v.productTitle = title;
          v.productHandle = handle;
          videos.push(v);
        }
      }

      for (const img of extracted.images) {
        if (!processedImageUrls.has(img.src)) {
          processedImageUrls.add(img.src);
          img.id = `prod_desc_img_${extraImages.length + 1}`;
          img.filename = `${handle}_desc_${img.filename}`;
          img.productTitle = title;
          img.productHandle = handle;
          extraImages.push(img);
        }
      }
    }
  }

  return { videos, extraImages };
}

/**
 * Orchestrator to compile all website and product media (Images + Videos).
 */
export async function compileAllMedia({
  baseUrl,
  homepageHtml = "",
  products = [],
  productGalleryImages = [],
  onProgress = null,
}) {
  onProgress?.("Extracting website images, banners, logos, and videos...");

  // 1. Website media from homepage HTML
  let websiteImages = [];
  let websiteVideos = [];

  if (homepageHtml) {
    const siteMedia = extractMediaFromHtml(homepageHtml, baseUrl, "website");
    websiteImages = siteMedia.images;
    websiteVideos = siteMedia.videos;
  }

  // 2. Product videos and embedded description media
  onProgress?.("Scanning products for videos and embedded media...");
  const { videos: productVideos, extraImages: productDescImages } = extractProductVideosAndMedia(products);

  // 3. Mark product gallery images with standard structure
  const formattedProductImages = productGalleryImages.map((img, idx) => ({
    id: img.id || `prod_img_${idx + 1}`,
    src: img.src,
    thumbnail: img.thumbnail || img.src,
    filename: img.filename || `product_${idx + 1}.jpg`,
    type: "image",
    category: "product",
    resolution: img.resolution || "Original",
    alt: img.alt || img.productTitle || "Product Image",
    productTitle: img.productTitle,
    productHandle: img.productHandle,
  }));

  // 4. Combine all images and videos
  const allImages = [...formattedProductImages, ...productDescImages, ...websiteImages];
  const allVideos = [...productVideos, ...websiteVideos];
  const allMedia = [...allImages, ...allVideos];

  onProgress?.(
    `Discovered total ${allMedia.length} media items (${formattedProductImages.length} product images, ${websiteImages.length} website banners/images, ${allVideos.length} videos).`
  );

  return {
    websiteMedia: {
      images: websiteImages,
      videos: websiteVideos,
      total: websiteImages.length + websiteVideos.length,
    },
    productMedia: {
      images: formattedProductImages,
      videos: productVideos,
      extraImages: productDescImages,
      total: formattedProductImages.length + productVideos.length + productDescImages.length,
    },
    allVideos,
    allImages,
    allMedia,
  };
}
