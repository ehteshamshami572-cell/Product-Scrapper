import fs from "fs/promises";
import path from "path";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

// Vercel optimization: Lazily import heavy modules only when needed.
const importPlaywright = () => import("playwright");
const importExcelJS = () => import("exceljs");

export function normalizeStoreUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Store URL is required");
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
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

async function fetchWithRetry(url, options = {}, maxRetries = 3, onProgress) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
        if (attempt === maxRetries) {
          onProgress?.(
            `Failed after ${maxRetries} attempts with status ${response.status} for ${url}`,
          );
          return response;
        }
        onProgress?.(
          `Status ${response.status} for ${url}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      onProgress?.(
        `Fetch error: ${error.message} for ${url}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  const promises = [];
  let index = 0;
  for (const item of items) {
    const currentIndex = index++;
    const p = (async () => {
      const res = await fn(item);
      results[currentIndex] = res;
    })();
    promises.push(p);
    p.then(() => {
      promises.splice(promises.indexOf(p), 1);
    });
    if (promises.length >= limit) {
      await Promise.race(promises);
    }
  }
  await Promise.all(promises);
  return results;
}

function normalizeImageUrl(url) {
  if (!url) return "";
  let fullUrl = url.trim();
  if (fullUrl.startsWith("//")) {
    fullUrl = "https:" + fullUrl;
  }
  const parsed = new URL(fullUrl);
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(
    /_(\d+)x(\d+)(@2x)?(?=\.[A-Za-z0-9]+$)/,
    "",
  );
  return parsed.toString();
}

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key] ?? "")).join(","));
  }
  return lines.join("\n");
}

async function requestJson(url, onProgress) {
  const response = await fetchWithRetry(
    url,
    { headers: DEFAULT_HEADERS },
    3,
    onProgress,
  );
  if (!response || !response.ok) {
    if (response && response.status === 404) return null;
    return null;
  }
  try {
    return await response.json();
  } catch (err) {
    onProgress?.(`Failed to parse JSON for ${url}: ${err.message}`);
    return null;
  }
}

async function requestText(url, onProgress) {
  const response = await fetchWithRetry(
    url,
    { headers: DEFAULT_HEADERS },
    3,
    onProgress,
  );
  if (!response || !response.ok) {
    if (response && response.status === 404) return "";
    return "";
  }
  try {
    return await response.text();
  } catch (err) {
    onProgress?.(`Failed to parse text for ${url}: ${err.message}`);
    return "";
  }
}

function dedupeByHandle(products) {
  const map = new Map();
  for (const product of products) {
    const handle = product.handle || "";
    if (handle && !map.has(handle)) map.set(handle, product);
  }
  return [...map.values()];
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (tags === null || tags === undefined) {
    return [];
  }
  return [String(tags).trim()].filter(Boolean);
}

function getVariantFields(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    variant_ids: variants.map((variant) => variant.id ?? ""),
    variant_names: variants.map((variant) => variant.title ?? ""),
    sku: variants.map((variant) => variant.sku ?? ""),
    barcode: variants.map((variant) => variant.barcode ?? ""),
    inventory_quantity: variants.map(
      (variant) => variant.inventory_quantity ?? "",
    ),
    inventory_policy: variants.map((variant) => variant.inventory_policy ?? ""),
    weight: variants.map((variant) => variant.grams ?? variant.weight ?? ""),
    weight_unit: variants.map((variant) => variant.weight_unit ?? ""),
    prices: variants.map((variant) => variant.price ?? ""),
    compare_at_prices: variants.map(
      (variant) => variant.compare_at_price ?? "",
    ),
    option_names: Array.isArray(product.options)
      ? product.options.map((option) => option.name ?? "")
      : [],
    option_values: Array.isArray(product.options)
      ? product.options.flatMap((option) => option.values || [])
      : [],
  };
}

function parseSections(description) {
  const text = String(description || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections = {
    ingredients: "",
    benefits: "",
    directions: "",
    warnings: "",
  };
  let current = "";
  const buffer = {
    ingredients: [],
    benefits: [],
    directions: [],
    warnings: [],
  };
  for (const line of text) {
    const key = line.toLowerCase().replace(/:$/, "");
    if (
      ["ingredients", "benefits", "directions", "warnings", "warning"].includes(
        key,
      )
    ) {
      current = key === "warning" ? "warnings" : key;
      continue;
    }
    if (current) buffer[current].push(line);
  }
  for (const key of Object.keys(sections)) {
    sections[key] = buffer[key].join("\n").trim();
  }
  return sections;
}

function extractProductImages(product, pageHtml) {
  const images = [];
  for (const image of product.images || []) {
    if (image.src) images.push(normalizeImageUrl(image.src));
  }
  if (!images.length && pageHtml) {
    const matches = [
      ...pageHtml.matchAll(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
      ),
    ];
    for (const match of matches) {
      images.push(normalizeImageUrl(match[1]));
    }
  }
  return [...new Set(images.filter(Boolean))];
}

async function discoverFromApi(baseUrl, onProgress) {
  // Vercel optimization: Limit products in cloud mode to reduce execution time.
  const MAX_PRODUCTS = 20;
  const products = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/products.json?limit=250&page=${page}`;
    const payload = await requestJson(url, onProgress);
    const batch = payload?.products || [];
    if (!batch.length) break;
    products.push(...batch);
    // Vercel optimization: Stop fetching if we have enough for cloud mode.
    // This check is implicitly for cloud mode via MAX_PRODUCTS, but harmless for local.
    if (products.length >= MAX_PRODUCTS && new URL(baseUrl).searchParams.get('cloudMode') === 'true') {
      break;
    }
    if (batch.length < 250) break;
    page += 1;
  }
  return dedupeByHandle(products).slice(0, MAX_PRODUCTS);
}

async function discoverWithPlaywright(baseUrl, onProgress) {
  // Local mode only: Playwright is not suitable for Vercel serverless functions.
  const { chromium } = await importPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: DEFAULT_HEADERS["User-Agent"],
  });
  const productUrls = new Set();
  const queue = [
    baseUrl,
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/collections/all`,
  ];
  const visited = new Set();

  try {
    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      try {
        await page.goto(current, { waitUntil: "networkidle", timeout: 45000 });
      } catch {
        continue;
      }
      const html = await page.content();
      if (current.endsWith("sitemap.xml")) {
        for (const match of html.matchAll(
          /<loc>(https?:\/\/[^<]+\/products\/[^<]+)<\/loc>/gi,
        )) {
          productUrls.add(match[1]);
        }
      }
      for (const match of html.matchAll(
        /href=["']([^"']*\/products\/[^"']+)["']/gi,
      )) {
        productUrls.add(new URL(match[1], baseUrl).toString());
      }
      for (const match of html.matchAll(
        /href=["']([^"']*(?:\/collections\/|\/pages\/|\/blogs\/)[^"']+)["']/gi,
      )) {
        const candidate = new URL(match[1], baseUrl).toString();
        if (candidate.startsWith(baseUrl) && !visited.has(candidate))
          queue.push(candidate);
      }
    }
  } finally {
    await browser.close();
  }

  const results = [];
  for (const productUrl of productUrls) {
    try {
      const product = await requestJson(
        `${new URL(productUrl).origin}/products/${new URL(productUrl).pathname.split("/").pop()}.js`,
        onProgress,
      );
      if (product) {
        product.product_url = productUrl;
        results.push(product);
      }
    } catch {
      continue;
    }
  }
  return dedupeByHandle(results);
}

async function downloadImage(url, targetPath, onProgress) {
  const response = await fetchWithRetry(
    url,
    { headers: DEFAULT_HEADERS },
    3,
    onProgress,
  );
  if (!response || !response.ok)
    throw new Error(`HTTP ${response ? response.status : "Failed"}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

async function downloadImagesForProduct(
  outputDir,
  product,
  resume,
  onProgress,
) {
  const localPaths = [];
  const productFolder = path.join(
    outputDir,
    "images",
    safeFilename(
      `${product.title}__${product.handle}`,
      product.handle || "product",
    ),
  );
  const imageUrls = [...new Set((product.image_urls || []).filter(Boolean))];
  let index = 1;
  for (const imageUrl of imageUrls) {
    const ext = path.extname(new URL(imageUrl).pathname) || ".jpg";
    const targetPath = path.join(productFolder, `image_${index}${ext}`);
    try {
      if (resume) {
        try {
          await fs.stat(targetPath);
          localPaths.push(targetPath);
          onProgress?.(`Image ${index} already exists, skipping download.`);
          index += 1;
          continue;
        } catch {
          // File does not exist, continue download
        }
      }
      await downloadImage(imageUrl, targetPath, onProgress);
      localPaths.push(targetPath);
      onProgress?.(`Downloaded image ${index} for ${product.title}`);
    } catch (error) {
      onProgress?.(`Image download failed for ${imageUrl}: ${error.message}`);
    }
    index += 1;
  }
  return localPaths;
}

function flattenRecord(record) {
  const flat = { ...record };
  for (const key of [
    "collections",
    "tags",
    "variants",
    "variant_ids",
    "variant_names",
    "sku",
    "barcode",
    "inventory_quantity",
    "inventory_policy",
    "weight",
    "weight_unit",
    "option_names",
    "option_values",
    "gallery_images",
    "image_urls",
    "alt_text",
    "image_local_paths",
    "meta_fields",
  ]) {
    if (
      Array.isArray(flat[key]) ||
      (flat[key] && typeof flat[key] === "object")
    ) {
      flat[key] = JSON.stringify(flat[key], null, 2);
    }
  }
  return flat;
}

async function exportFiles(outputDir, records, summary, persistToDisk = true) {
  const flatRows = records.map(flattenRecord);
  const csv = toCsv(flatRows);
  const json = JSON.stringify(records, null, 2);
  const report = [
    "Shopify Scraper Report",
    `Products found: ${summary.totalProductsFound}`,
    `Products scraped: ${summary.totalProductsScraped}`,
    `Variants: ${summary.totalVariants}`,
    `Images downloaded: ${summary.totalImagesDownloaded}`,
    `Failures: ${summary.totalFailures}`,
    `Duplicates skipped: ${summary.totalDuplicates}`,
    `Execution time (seconds): ${summary.elapsedSeconds.toFixed(2)}`,
  ].join("\n");

  // Vercel optimization: Skip Excel generation in cloud mode.
  if (!persistToDisk) {
    return { csv, json, report, xlsxBase64: "" };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");

  if (flatRows.length > 0) {
    sheet.columns = Object.keys(flatRows[0]).map((key) => ({
      header: key,
      key,
      width: 24,
    }));
    for (const row of flatRows) {
      sheet.addRow(row);
    }
  } else {
    sheet.columns = [{ header: "No Data", key: "message", width: 24 }];
    sheet.addRow({ message: "No products scraped." });
  }
  const ExcelJS = (await importExcelJS()).default;
  const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  if (persistToDisk) {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "products.csv"), csv, "utf8");
    await fs.writeFile(path.join(outputDir, "products.json"), json, "utf8");
    await fs.writeFile(
      path.join(outputDir, "download_report.txt"),
      report,
      "utf8",
    );
    await fs.writeFile(path.join(outputDir, "products.xlsx"), xlsxBuffer);
  }

  return {
    csv,
    json,
    report,
    xlsxBase64: xlsxBuffer.toString("base64"),
  };
}

function buildSummary() {
  return {
    totalProductsFound: 0,
    totalProductsScraped: 0,
    totalVariants: 0,
    totalImagesDownloaded: 0,
    totalFailures: 0,
    totalDuplicates: 0,
    elapsedSeconds: 0,
  };
}

export async function scrapeStore({
  storeUrl,
  downloadImages = true,
  threads = 2,
  resume = false,
  onProgress = () => {},
  onStats = () => {},
  cloudMode = false,
}) {
  const baseUrl = normalizeStoreUrl(storeUrl);
  onProgress(`Scraping ${baseUrl}`);

  let products = [];
  let sourceMode = "api";

  const parsedUrl = new URL(baseUrl);
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const isProductPage =
    pathParts.length >= 2 && pathParts[pathParts.length - 2] === "products";

  if (isProductPage) {
    const handle = pathParts[pathParts.length - 1];
    const productUrl = `${parsedUrl.origin}/products/${handle}.js`;
    onProgress(`Detected single product page. Fetching ${productUrl}...`);
    const product = await requestJson(productUrl, onProgress);
    if (product) {
      product.product_url = baseUrl;
      products.push(product);
      sourceMode = "single";
    } else {
      throw new Error(`Failed to fetch product details for ${baseUrl}`);
    }
  } else {
    products = await discoverFromApi(baseUrl, onProgress);
    if (!products.length) {
      if (cloudMode) {
        throw new Error( // Vercel optimization: Fail fast if API is blocked in cloud mode.
          "This store blocks the Shopify Products API. Crawling is disabled in cloud mode.",
        );
      } else {
        onProgress("Shopify Products API returned no products. Attempting to crawl with Playwright...");
        sourceMode = "crawl";
        products = await discoverWithPlaywright(baseUrl, onProgress);
        if (!products.length) {
          throw new Error("Failed to discover any products via API or crawling. The store might be empty or inaccessible.");
        }
      }
    }
  }

  const summary = buildSummary();
  summary.totalProductsFound = products.length;
  onStats(summary);

  const outputBase = cloudMode
    ? path.join("/tmp", "output")
    : path.join(process.cwd(), "output");
  const outputDir = path.join(
    outputBase,
    safeFilename(new URL(baseUrl).hostname),
  );
  const started = Date.now();

  const records = await pool(products, threads, async (product) => {
    try {
      let productPageHtml = "";
      if (!cloudMode) { // Local mode only: Fetch full page HTML.
        productPageHtml = await requestText(
          product.product_url || `${baseUrl}/products/${product.handle}`,
          onProgress,
        );
      }
      const sections = parseSections(stripHtml(product.body_html || ""));
      const variantFields = getVariantFields(product);
      const imageUrls = extractProductImages(product, productPageHtml);
      const record = {
        id: product.id ?? null,
        handle: product.handle || "",
        title: product.title || "",
        vendor: product.vendor || "",
        product_type: product.product_type || "",
        collections: [],
        tags: normalizeTags(product.tags),
        status: product.status || (product.published_at ? "active" : "draft"),
        published_at: product.published_at || "",
        created_at: product.created_at || "",
        updated_at: product.updated_at || "",
        description: stripHtml(product.body_html || ""),
        short_description:
          stripHtml(product.body_html || "").split("\n")[0] || "",
        ingredients: sections.ingredients,
        benefits: sections.benefits,
        directions: sections.directions,
        warnings: sections.warnings,
        price: variantFields.prices[0] || "",
        compare_at_price: variantFields.compare_at_prices[0] || "",
        currency: "",
        variants: product.variants || [],
        variant_ids: variantFields.variant_ids,
        variant_names: variantFields.variant_names,
        sku: variantFields.sku,
        barcode: variantFields.barcode,
        inventory_quantity: variantFields.inventory_quantity,
        inventory_policy: variantFields.inventory_policy,
        weight: variantFields.weight,
        weight_unit: variantFields.weight_unit,
        option_names: variantFields.option_names,
        option_values: variantFields.option_values,
        featured_image: imageUrls[0] || "",
        gallery_images: imageUrls.slice(1),
        image_urls: imageUrls,
        alt_text: [],
        product_url:
          product.product_url || `${baseUrl}/products/${product.handle}`,
        seo_title: "",
        seo_description: "",
        meta_fields: {},
        image_local_paths: [],
      };

      if (downloadImages && imageUrls.length && !cloudMode) { // Local mode only: Download images.
        record.image_local_paths = await downloadImagesForProduct(
          outputDir,
          record,
          resume,
          onProgress,
        );
        summary.totalImagesDownloaded += record.image_local_paths.length;
      }

      summary.totalProductsScraped += 1;
      summary.totalVariants += product.variants?.length || 0;
      onStats(summary);
      onProgress(`Processed ${record.title || record.handle}`);
      return record;
    } catch (err) {
      summary.totalFailures += 1;
      onStats(summary);
      onProgress(
        `Failed to process ${product.title || product.handle || "product"}: ${err.message}`,
      );
      return null;
    }
  });

  const finalRecords = records.filter(Boolean);
  summary.elapsedSeconds = (Date.now() - started) / 1000;
  const downloads = await exportFiles(
    outputDir,
    finalRecords,
    summary,
    !cloudMode,
  );

  return {
    sourceMode,
    summary,
    records: finalRecords,
    outputDir: cloudMode ? "(cloud temporary storage)" : outputDir,
    downloads,
    files: {
      csv: cloudMode
        ? ""
        : path.relative(process.cwd(), path.join(outputDir, "products.csv")),
      xlsx: cloudMode
        ? ""
        : path.relative(process.cwd(), path.join(outputDir, "products.xlsx")),
      json: cloudMode
        ? ""
        : path.relative(process.cwd(), path.join(outputDir, "products.json")),
      report: cloudMode
        ? ""
        : path.relative(
            process.cwd(),
            path.join(outputDir, "download_report.txt"),
          ),
    },
  };
}
