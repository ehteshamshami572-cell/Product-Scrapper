import { fetchWithRetry, pool } from "../utils/http.js";
import { Logger } from "../utils/logger.js";

// Vercel/Cloud mode maximum products to limit execution time
const CLOUD_MAX_PRODUCTS = 30;

/**
 * Counts URLs matching a regex in a sitemap file.
 */
async function countSitemapUrls(sitemapUrl, pattern) {
  try {
    const res = await fetchWithRetry(sitemapUrl, { timeout: 8000 }, 2);
    if (!res || !res.ok) return 0;
    const xml = await res.text();
    const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)];
    if (!pattern) return matches.length;
    return matches.filter(m => pattern.test(m[1])).length;
  } catch (err) {
    Logger.error(`Sitemap count failed for ${sitemapUrl}: ${err.message}`);
    return 0;
  }
}

/**
 * Fast scan for product/collection presence and estimations (API / Analyze phase).
 */
export async function scanShopifyProducts(baseUrl, onProgress = null) {
  let productCount = 0;
  let collectionCount = 0;
  let apiAvailable = false;
  let source = "API Check";

  onProgress?.("Scanning Shopify store for products and collections...");

  const productsSitemapUrl = new URL("/sitemap_products_1.xml", baseUrl).toString();
  productCount = await countSitemapUrls(productsSitemapUrl, /\/products\//);

  if (productCount > 0) {
    source = "Sitemap XML";
    const collectionsSitemapUrl = new URL("/sitemap_collections_1.xml", baseUrl).toString();
    collectionCount = await countSitemapUrls(collectionsSitemapUrl, /\/collections\//);
  } else {
    const testApiUrl = new URL("/products.json?limit=1", baseUrl).toString();
    try {
      const res = await fetchWithRetry(testApiUrl, { timeout: 6000 }, 2);
      if (res && res.ok) {
        const data = await res.json();
        apiAvailable = true;
        source = "Products API";
        const colRes = await fetchWithRetry(new URL("/collections.json", baseUrl).toString(), { timeout: 6000 }, 2).catch(() => null);
        if (colRes && colRes.ok) {
          const colData = await colRes.json();
          collectionCount = colData.collections?.length || 0;
        }
      }
    } catch {
      // Ignored
    }
  }

  return {
    exists: productCount > 0 || apiAvailable,
    totalProducts: productCount || (apiAvailable ? "Available (API Open)" : 0),
    totalCollections: collectionCount,
    source,
  };
}

export async function scanWooCommerceProducts(baseUrl, onProgress = null) {
  let productCount = 0;
  let categoryCount = 0;
  let source = "Sitemap Scan";

  onProgress?.("Scanning WooCommerce store for products and categories...");

  const wcApiUrl = new URL("/wp-json/wc/store/v1/products?per_page=1", baseUrl).toString();
  try {
    const res = await fetchWithRetry(wcApiUrl, { timeout: 8000 }, 2);
    if (res && res.ok) {
      const totalHeader = res.headers.get("X-WP-Total");
      if (totalHeader) {
        productCount = parseInt(totalHeader, 10);
        source = "WooCommerce REST API";

        const catRes = await fetchWithRetry(new URL("/wp-json/wc/store/v1/products/categories?per_page=100", baseUrl).toString(), { timeout: 5000 }, 2).catch(() => null);
        if (catRes && catRes.ok) {
          const cats = await catRes.json();
          categoryCount = cats.length;
        }
        return {
          exists: true,
          totalProducts: productCount,
          totalCollections: categoryCount,
          source,
        };
      }
    }
  } catch {
    // Fall back
  }

  const sitemaps = [
    "/product-sitemap.xml",
    "/sitemap_products.xml",
    "/sitemap.xml",
  ];

  for (const path of sitemaps) {
    const sUrl = new URL(path, baseUrl).toString();
    const count = await countSitemapUrls(sUrl, /\/product\//);
    if (count > 0) {
      productCount = count;
      source = `Sitemap (${path})`;
      break;
    }
  }

  return {
    exists: productCount > 0,
    totalProducts: productCount,
    totalCollections: 0,
    source,
  };
}

export async function scanGenericProducts(baseUrl, html, onProgress = null) {
  onProgress?.("Scanning site sitemaps for products...");
  let productCount = 0;
  let source = "Heuristic Sitemap Scan";

  const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
  try {
    const res = await fetchWithRetry(sitemapUrl, { timeout: 8000 }, 2);
    if (res && res.ok) {
      const xml = await res.text();
      const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)];
      const productUrls = matches.filter(m => {
        const url = m[1].toLowerCase();
        return url.includes("/product/") || url.includes("/products/") || url.includes("/shop/") || url.includes("/item/") || url.includes("/p/");
      });
      productCount = productUrls.length;
      if (productCount > 0) {
        source = "Sitemap Heuristic";
      }
    }
  } catch {
    // Ignored
  }

  const hasProductSchema = html.toLowerCase().includes("\"@type\": \"product\"") || html.toLowerCase().includes("\"@type\":\"product\"");

  return {
    exists: productCount > 0 || hasProductSchema,
    totalProducts: productCount || (hasProductSchema ? "Detected via Schema" : 0),
    totalCollections: 0,
    source,
  };
}

export async function scanProductsAndCollections(cmsName, baseUrl, html, onProgress = null) {
  if (cmsName === "Shopify") {
    return await scanShopifyProducts(baseUrl, onProgress);
  }
  if (cmsName === "WordPress" || cmsName === "WooCommerce") {
    return await scanWooCommerceProducts(baseUrl, onProgress);
  }
  return await scanGenericProducts(baseUrl, html, onProgress);
}

// ==========================================
// FULL EXTRACTION IMPLEMENTATIONS
// ==========================================

/**
 * Full Shopify Product API Extraction
 */
export async function extractShopifyProductsApi(baseUrl, onProgress = null, cloudMode = false) {
  const products = [];
  let page = 1;
  const limit = 250;

  onProgress?.("Fetching products from Shopify API...");

  while (true) {
    const url = `${baseUrl}/products.json?limit=${limit}&page=${page}`;
    const res = await fetchWithRetry(url, { timeout: 12000 }, 3, onProgress).catch(() => null);
    if (!res || !res.ok) {
      onProgress?.(`Shopify Products API returned status ${res ? res.status : "Error"}. Stopping batch fetch.`);
      break;
    }
    
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      onProgress?.(`Failed to parse API JSON response: ${err.message}`);
      break;
    }

    const batch = payload?.products || [];
    if (!batch.length) break;

    products.push(...batch);
    onProgress?.(`Fetched ${products.length} products from API...`);

    if (cloudMode && products.length >= CLOUD_MAX_PRODUCTS) {
      onProgress?.(`Cloud limit reached (${CLOUD_MAX_PRODUCTS} products).`);
      break;
    }

    if (batch.length < limit) break;
    page += 1;
  }

  return products;
}

/**
 * Full Shopify Playwright Crawling Extraction (Fallback for Local mode only)
 */
export async function extractShopifyProductsPlaywright(baseUrl, onProgress = null) {
  onProgress?.("Launching Playwright headless browser for product crawling...");
  
  let playwright;
  try {
    playwright = await import("playwright");
  } catch (err) {
    throw new Error("Playwright is not installed. Run 'npx playwright install' to enable crawling.");
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  });
  
  const productUrls = new Set();
  const queue = [
    baseUrl,
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/collections/all`
  ];
  const visited = new Set();

  try {
    while (queue.length && productUrls.size < 100) { // Limit local crawl to 100 products for performance
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);

      onProgress?.(`Crawling page: ${current}`);
      try {
        await page.goto(current, { waitUntil: "networkidle", timeout: 25000 });
      } catch (err) {
        onProgress?.(`Failed to load page ${current}: ${err.message}`);
        continue;
      }

      const html = await page.content();
      if (current.endsWith("sitemap.xml")) {
        const matches = [...html.matchAll(/<loc>(https?:\/\/[^<]+\/products\/[^<]+)<\/loc>/gi)];
        for (const match of matches) {
          productUrls.add(match[1]);
        }
      }
      
      const hrefMatches = [...html.matchAll(/href=["']([^"']*\/products\/[^"']+)["']/gi)];
      for (const match of hrefMatches) {
        productUrls.add(new URL(match[1], baseUrl).toString());
      }

      // Find other collection/sitemap pages
      const links = [...html.matchAll(/href=["']([^"']*(?:\/collections\/|\/pages\/)[^"']+)["']/gi)];
      for (const match of links) {
        try {
          const candidate = new URL(match[1], baseUrl).toString();
          if (candidate.startsWith(baseUrl) && !visited.has(candidate) && !queue.includes(candidate)) {
            queue.push(candidate);
          }
        } catch {
          // Ignored
        }
      }
    }
  } finally {
    await browser.close();
  }

  onProgress?.(`Discovered ${productUrls.size} product links. Fetching individual details...`);

  const results = [];
  const urls = [...productUrls];
  
  // Fetch details using pool
  await pool(urls, 6, async (pUrl) => {
    try {
      const parsed = new URL(pUrl);
      const handle = parsed.pathname.split("/").pop();
      const detailUrl = `${parsed.origin}/products/${handle}.js`;

      const res = await fetchWithRetry(detailUrl, { timeout: 8000 }, 2).catch(() => null);
      if (res && res.ok) {
        const product = await res.json();
        product.product_url = pUrl;
        results.push(product);
        onProgress?.(`Extracted details for product: ${product.title || handle}`);
      }
    } catch (err) {
      // Ignore failures for individual products
    }
  });

  return results;
}

/**
 * Full WooCommerce Store API Product Extraction
 */
export async function extractWooCommerceProducts(baseUrl, onProgress = null, cloudMode = false) {
  const products = [];
  let page = 1;
  const limit = 100;

  onProgress?.("Fetching products from WooCommerce Store API...");

  while (true) {
    const url = `${baseUrl}/wp-json/wc/store/v1/products?per_page=${limit}&page=${page}`;
    const res = await fetchWithRetry(url, { timeout: 12000 }, 3, onProgress).catch(() => null);
    if (!res || !res.ok) {
      onProgress?.(`WooCommerce API returned status ${res ? res.status : "Error"}. Stopping pagination.`);
      break;
    }

    let batch = null;
    try {
      batch = await res.json();
    } catch (err) {
      break;
    }

    if (!Array.isArray(batch) || !batch.length) break;

    products.push(...batch);
    onProgress?.(`Fetched ${products.length} products from WooCommerce...`);

    if (cloudMode && products.length >= CLOUD_MAX_PRODUCTS) {
      onProgress?.(`Cloud limit reached (${CLOUD_MAX_PRODUCTS} products).`);
      break;
    }

    if (batch.length < limit) break;
    page += 1;
  }

  // Map WooCommerce product objects to our standard format
  return products.map(p => {
    const images = (p.images || []).map(img => ({
      src: img.src || "",
      alt: img.alt || img.name || "",
      width: img.width || null,
      height: img.height || null,
    }));

    const variants = (p.variations || []).map(v => ({
      id: v.id || "",
      title: v.attributes?.map(a => a.value).join(" / ") || "Default Title",
      price: v.price || p.prices?.price || "",
      compare_at_price: v.regular_price || p.prices?.regular_price || "",
      sku: v.sku || "",
      barcode: "",
    }));

    if (variants.length === 0) {
      variants.push({
        id: p.id || "",
        title: "Default Title",
        price: p.prices?.price || "",
        compare_at_price: p.prices?.regular_price || "",
        sku: p.sku || "",
        barcode: "",
      });
    }

    return {
      id: p.id || null,
      handle: p.slug || "",
      title: p.name || "",
      vendor: p.vendor || "",
      product_type: p.categories?.map(c => c.name).join(", ") || "",
      tags: p.tags?.map(t => t.name) || [],
      status: p.status || "active",
      published_at: p.date_created || "",
      created_at: p.date_created || "",
      updated_at: p.date_modified || "",
      body_html: p.description || p.short_description || "",
      variants,
      images,
      product_url: p.permalink || "",
    };
  });
}

/**
 * Helper to parse schema or OpenGraph meta from HTML of a generic product page.
 */
async function parseGenericProductPage(url, html) {
  let title = "";
  let description = "";
  let price = "";
  let compareAtPrice = "";
  let images = [];
  let sku = "";
  let vendor = "";

  try {
    // 1. Try JSON-LD Product schema
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of ldMatches) {
      try {
        const json = JSON.parse(match[1].trim());
        const schemas = Array.isArray(json) ? json : (json["@graph"] ? json["@graph"] : [json]);
        
        const productSchema = schemas.find(s => s["@type"] === "Product" || s["@type"]?.includes("Product"));
        if (productSchema) {
          title = productSchema.name || "";
          description = productSchema.description || "";
          sku = productSchema.sku || productSchema.mpn || "";
          vendor = productSchema.brand?.name || productSchema.brand || "";

          const offers = productSchema.offers;
          if (offers) {
            if (Array.isArray(offers) && offers.length > 0) {
              price = offers[0].price || "";
              compareAtPrice = offers[0].price || "";
            } else {
              price = offers.price || "";
              compareAtPrice = offers.priceRegular || offers.price || "";
            }
          }

          const schemaImg = productSchema.image;
          if (schemaImg) {
            const imgUrls = Array.isArray(schemaImg) ? schemaImg : [schemaImg];
            images = imgUrls.map(img => {
              const src = typeof img === "object" ? img.url : img;
              return { src, alt: title };
            });
          }
          break;
        }
      } catch {
        // Skip
      }
    }

    // 2. OpenGraph / Meta tags fallback
    if (!title) {
      const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      if (titleMatch) title = titleMatch[1];
    }
    if (!description) {
      const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      if (descMatch) description = descMatch[1];
    }
    if (images.length === 0) {
      const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (imgMatch) {
        images.push({ src: imgMatch[1], alt: title });
      }
    }
    if (!price) {
      const priceMatch = html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i);
      if (priceMatch) price = priceMatch[1];
    }

    // 3. Document Title fallback
    if (!title) {
      const titleTag = html.match(/<title>([^<]+)<\/title>/i);
      if (titleTag) title = titleTag[1].trim();
    }
  } catch (err) {
    Logger.error(`Error parsing generic page ${url}: ${err.message}`);
  }

  if (!title) return null;

  return {
    id: null,
    handle: url.split("/").pop() || "product",
    title,
    vendor,
    product_type: "Generic Product",
    tags: [],
    status: "active",
    published_at: "",
    created_at: "",
    updated_at: "",
    body_html: description,
    variants: [{
      id: "default",
      title: "Default Variant",
      price,
      compare_at_price: compareAtPrice || price,
      sku,
      barcode: ""
    }],
    images: images.map(img => ({
      src: img.src || "",
      alt: img.alt || title,
      width: null,
      height: null
    })),
    product_url: url
  };
}

/**
 * Full Generic Product Crawling (JSON-LD & OpenGraph fallback)
 */
export async function extractGenericProducts(baseUrl, onProgress = null, cloudMode = false) {
  onProgress?.("Attempting generic product crawling via sitemap URLs...");
  const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
  const productUrls = new Set();

  try {
    const res = await fetchWithRetry(sitemapUrl, { timeout: 8000 }, 2);
    if (res && res.ok) {
      const xml = await res.text();
      const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)];
      
      const candidates = matches.map(m => m[1]).filter(url => {
        const u = url.toLowerCase();
        return u.includes("/product/") || u.includes("/products/") || u.includes("/shop/") || u.includes("/item/") || u.includes("/p/");
      });

      candidates.forEach(url => productUrls.add(url));
    }
  } catch (err) {
    onProgress?.(`Generic sitemap crawl failed: ${err.message}`);
  }

  const urls = [...productUrls].slice(0, cloudMode ? 10 : 30);
  if (urls.length === 0) {
    onProgress?.("No product-like URLs found in sitemap. Scraper cannot proceed without endpoints.");
    return [];
  }

  onProgress?.(`Found ${urls.length} candidate product pages. Fetching and parsing schemas...`);
  const products = [];

  await pool(urls, 5, async (url) => {
    try {
      const res = await fetchWithRetry(url, { timeout: 10000 }, 2).catch(() => null);
      if (res && res.ok) {
        const html = await res.text();
        const p = await parseGenericProductPage(url, html);
        if (p) {
          products.push(p);
          onProgress?.(`Extracted generic product: ${p.title}`);
        }
      }
    } catch (err) {
      // Ignore
    }
  });

  return products;
}
