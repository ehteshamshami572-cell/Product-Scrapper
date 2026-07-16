import { fetchWithRetry } from "./utils/http.js";
import { detectCMS } from "./detectors/cms.js";
import { detectTechnologies } from "./detectors/tech.js";
import { detectTheme } from "./detectors/theme.js";
import { scanProductsAndCollections } from "./extractors/products.js";
import { Logger } from "./utils/logger.js";

/**
 * Extracts basic metadata (Title, Description, Generator) from HTML.
 */
function extractMetadata(html, baseUrl) {
  let title = "";
  let description = "";
  let generator = "";
  let favicon = "";

  try {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (descMatch) description = descMatch[1].trim();

    const genMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
    if (genMatch) generator = genMatch[1].trim();

    const favMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
    if (favMatch) {
      const href = favMatch[1];
      favicon = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
    } else {
      favicon = new URL("/favicon.ico", baseUrl).toString();
    }
  } catch (err) {
    Logger.error(`Error parsing page metadata: ${err.message}`);
  }

  return { title, description, generator, favicon };
}

/**
 * Analyzes a website URL and extracts tech, CMS, theme, product counts, and metadata.
 */
export async function analyzeWebsite(url, onProgress = null) {
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const parsedUrl = new URL(normalizedUrl);
  // Ensure we check the homepage for technology/CMS detection
  const homepageUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  onProgress?.(`Connecting to ${homepageUrl}...`);

  let html = "";
  let headers = {};
  
  try {
    const res = await fetchWithRetry(homepageUrl, { timeout: 10000 }, 3, onProgress);
    if (!res) {
      throw new Error("No response received from website homepage.");
    }
    
    // Parse headers
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    html = await res.text().catch(() => "");
    
    if (!res.ok) {
      onProgress?.(`Warning: Homepage returned HTTP status ${res.status}. Proceeding with analysis anyway...`);
    }
  } catch (err) {
    Logger.error(`Failed to analyze homepage for ${homepageUrl}: ${err.message}`);
    throw new Error(`Failed to connect to the website: ${err.message}`);
  }

  onProgress?.("Analyzing CMS platform...");
  const cms = detectCMS(html, headers);
  onProgress?.(`CMS Detected: ${cms.name} (${cms.confidence} confidence)`);

  onProgress?.("Scanning technology stack...");
  const technologies = detectTechnologies(html, headers);

  let theme = null;
  try {
    onProgress?.("Detecting website theme details...");
    theme = await detectTheme(cms.name, html, homepageUrl, onProgress);
  } catch (err) {
    Logger.error(`Theme detection failed: ${err.message}`);
  }

  let productsScan = { exists: false, totalProducts: 0, totalCollections: 0, source: "None" };
  try {
    onProgress?.("Scanning product availability...");
    productsScan = await scanProductsAndCollections(cms.name, homepageUrl, html, onProgress);
  } catch (err) {
    Logger.error(`Product scan failed: ${err.message}`);
  }

  const metadata = extractMetadata(html, homepageUrl);

  return {
    url: homepageUrl,
    metadata,
    cms,
    technologies,
    theme,
    products: productsScan,
  };
}
