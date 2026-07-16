import { fetchWithRetry } from "../utils/http.js";
import { Logger } from "../utils/logger.js";

/**
 * Extracts Shopify theme data from raw HTML.
 */
export function detectShopifyTheme(html) {
  try {
    // Look for Shopify.theme assignment
    // e.g. Shopify.theme = {"name":"Dawn","id":120063541312,"theme_store_id":887,"role":"main"};
    const match = html.match(/Shopify\.theme\s*=\s*(\{.*?\});/);
    if (match) {
      const themeData = JSON.parse(match[1]);
      return {
        name: themeData.name || "Unknown Theme",
        version: themeData.version || "Unknown",
        id: themeData.id || "",
        storeId: themeData.theme_store_id || "",
        role: themeData.role || "",
      };
    }
  } catch (err) {
    Logger.error(`Failed to parse Shopify theme: ${err.message}`);
  }

  // Fallback: look in script tags or comments
  const genericMatch = html.match(/theme_store_id\s*:\s*(\d+)/i);
  if (genericMatch) {
    return {
      name: "Shopify Theme",
      version: "Unknown",
      id: "",
      storeId: genericMatch[1],
    };
  }

  return null;
}

/**
 * Extracts WordPress theme folder and fetches style.css to parse metadata.
 */
export async function detectWordPressTheme(html, baseUrl, onProgress = null) {
  try {
    // Look for stylesheet link like /wp-content/themes/twentytwentyfour/style.css
    const themeRegex = /\/wp-content\/themes\/([a-zA-Z0-9_-]+)\/style\.css/i;
    const match = html.match(themeRegex);
    if (!match) return null;

    const themeFolder = match[1];
    const themeNameClean = themeFolder.replace(/-+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    // Resolve absolute URL to the stylesheet
    const stylesheetUrl = new URL(`/wp-content/themes/${themeFolder}/style.css`, baseUrl).toString();
    onProgress?.(`Found WordPress theme folder: ${themeFolder}. Fetching style.css for metadata...`);

    const res = await fetchWithRetry(stylesheetUrl, { timeout: 8000 }, 2).catch(() => null);
    if (res && res.ok) {
      const text = await res.text();
      
      const themeNameMatch = text.match(/Theme Name:\s*([^\r\n]+)/i);
      const versionMatch = text.match(/Version:\s*([^\r\n]+)/i);
      const authorMatch = text.match(/Author:\s*([^\r\n]+)/i);
      const descriptionMatch = text.match(/Description:\s*([^\r\n]+)/i);

      return {
        name: themeNameMatch ? themeNameMatch[1].trim() : themeNameClean,
        version: versionMatch ? versionMatch[1].trim() : "Unknown",
        author: authorMatch ? authorMatch[1].trim() : "Unknown",
        description: descriptionMatch ? descriptionMatch[1].trim() : "",
        id: themeFolder,
      };
    }

    return {
      name: themeNameClean,
      version: "Unknown",
      id: themeFolder,
    };
  } catch (err) {
    Logger.error(`Failed to parse WordPress theme: ${err.message}`);
  }
  return null;
}

/**
 * General theme detector dispatcher.
 */
export async function detectTheme(cmsName, html, baseUrl, onProgress = null) {
  if (cmsName === "Shopify") {
    return detectShopifyTheme(html);
  }
  if (cmsName === "WordPress" || cmsName === "WooCommerce") {
    return await detectWordPressTheme(html, baseUrl, onProgress);
  }
  return null;
}
