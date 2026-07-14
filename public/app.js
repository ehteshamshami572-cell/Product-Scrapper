const storeUrlInput = document.getElementById("storeUrl");
const downloadImagesInput = document.getElementById("downloadImages");
const resumeInput = document.getElementById("resumeRun");
const startButton = document.getElementById("startBtn");
const clearButton = document.getElementById("clearBtn");
const logElement = document.getElementById("log");
const foundCount = document.getElementById("foundCount");
const scrapedCount = document.getElementById("scrapedCount");
const variantsCount = document.getElementById("variantsCount");
const imagesCount = document.getElementById("imagesCount");
const csvLink = document.getElementById("csvLink");
const xlsxLink = document.getElementById("xlsxLink");
const jsonLink = document.getElementById("jsonLink");
const reportLink = document.getElementById("reportLink");

let logLines = [];

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  logLines.push(`[${stamp}] ${message}`);
  logElement.textContent = logLines.slice(-1000).join("\n");
  logElement.scrollTop = logElement.scrollHeight;
}

function updateSummary(summary) {
  foundCount.textContent = summary.totalProductsFound ?? 0;
  scrapedCount.textContent = summary.totalProductsScraped ?? 0;
  variantsCount.textContent = summary.totalVariants ?? 0;
  imagesCount.textContent = summary.totalImagesDownloaded ?? 0;
}

function setDownloadLink(link, href) {
  if (!href) return;
  // Ensure the link is formatted correctly with relative forward slashes
  const formattedHref = href.startsWith("/") ? href : `/${href}`;
  link.href = formattedHref.replace(/\\/g, "/");
  link.style.display = "inline-block";
}

async function saveLatest(result) {
  try {
    localStorage.setItem("shopify_scraper_latest", JSON.stringify(result));
  } catch (error) {
    log(`Error saving to local storage: ${error.message}`);
  }

  await fetch("/api/scrape/latest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result)
  }).catch(() => {});
}

async function clearDownloads() {
  csvLink.removeAttribute("href");
  xlsxLink.removeAttribute("href");
  jsonLink.removeAttribute("href");
  reportLink.removeAttribute("href");
  csvLink.style.display = "none";
  xlsxLink.style.display = "none";
  jsonLink.style.display = "none";
  reportLink.style.display = "none";
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

function triggerArtifactDownloads(downloads, storeUrl) {
  if (!downloads) {
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeHost = storeUrl.replace(/^https?:\/\//i, "").replace(/[^A-Za-z0-9._-]+/g, "_");
  const base = `${safeHost}_${stamp}`;

  if (downloads.csv) {
    downloadBlob(`${base}_products.csv`, new Blob([downloads.csv], { type: "text/csv;charset=utf-8" }));
  }
  if (downloads.json) {
    downloadBlob(`${base}_products.json`, new Blob([downloads.json], { type: "application/json;charset=utf-8" }));
  }
  if (downloads.report) {
    downloadBlob(`${base}_download_report.txt`, new Blob([downloads.report], { type: "text/plain;charset=utf-8" }));
  }
  if (downloads.xlsxBase64) {
    const binary = atob(downloads.xlsxBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    downloadBlob(
      `${base}_products.xlsx`,
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
    );
  }
}

// Restore last run details on page load
async function loadLatestResult() {
  try {
    // 1. Try restoring from localStorage first (fast, serverless-friendly fallback)
    const localData = localStorage.getItem("shopify_scraper_latest");
    if (localData) {
      let result = null;
      try {
        result = JSON.parse(localData);
      } catch (parseError) {
        log(`Error parsing local storage data: ${parseError.message}. Clearing invalid data.`);
        localStorage.removeItem("shopify_scraper_latest"); // Clear invalid data
      }
      if (result) {
        const { summary, files, sourceMode, outputDir } = result;
        updateSummary(summary || {});
        if (files) {
          setDownloadLink(csvLink, files.csv);
          setDownloadLink(xlsxLink, files.xlsx);
          setDownloadLink(jsonLink, files.json);
          setDownloadLink(reportLink, files.report);
        }
        log(`Restored previous scrape from browser storage. Source mode: ${sourceMode}.`);
        if (outputDir) {
          log(`Files are in ${outputDir}`);
        }
        return;
      }
    }

    // 2. Fallback to API if not in localStorage
    const res = await fetch("/api/scrape/latest");
    const contentType = res.headers.get("content-type");
    if (!res.ok || !contentType || !contentType.includes("application/json")) {
      return;
    }
    const payload = await res.json();
    if (payload.ok && payload.result) {
      const { summary, files, sourceMode, outputDir } = payload.result;
      updateSummary(summary || {});
      if (files) {
        setDownloadLink(csvLink, files.csv);
        setDownloadLink(xlsxLink, files.xlsx);
        setDownloadLink(jsonLink, files.json);
        setDownloadLink(reportLink, files.report);
      }
      log(`Restored previous scrape from server. Source mode: ${sourceMode}.`);
      if (outputDir) {
        log(`Files are in ${outputDir}`);
      }
    }
  } catch (err) {
    // Fail silently
        log(`Error loading latest result: ${err.message}`);
  }
}

async function onStart() {
  const storeUrl = storeUrlInput.value.trim();
  if (!storeUrl) {
    log("Enter a Shopify store URL first.");
    return;
  }

  startButton.disabled = true;
  clearButton.disabled = true;
  logLines = [];
  log(`Starting scrape for ${storeUrl}...`);
  await clearDownloads();

  const downloadImages = downloadImagesInput.checked;
  const resume = resumeInput.checked;

  try {
    const isVercelRuntime = window.location.hostname.includes("vercel.app") || window.location.hostname !== "localhost";
    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        storeUrl,
        downloadImages,
        resume,
        threads: 6,
        cloudMode: isVercelRuntime
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Scrape failed");
    }

    const result = payload.result || payload;
    updateSummary(result.summary || {});
    if (result.files) {
      setDownloadLink(csvLink, result.files.csv);
      setDownloadLink(xlsxLink, result.files.xlsx);
      setDownloadLink(jsonLink, result.files.json);
      setDownloadLink(reportLink, result.files.report);
    }
    if (result.downloads) {
      triggerArtifactDownloads(result.downloads, storeUrl);
      log("Downloads started for CSV, XLSX, JSON, and report.");
    }
    log(`Done. Source mode: ${result.sourceMode}.`);
    if (result.outputDir) {
      log(`Saved files in ${result.outputDir}`);
    }
    await saveLatest(result);
  } catch (error) {
    log(`Error: ${error.message}`);
  } finally {
    startButton.disabled = false;
    clearButton.disabled = false;
  }
}

clearButton.addEventListener("click", async () => {
  logLines = [];
  logElement.textContent = "";
  await clearDownloads();
  updateSummary({ totalProductsFound: 0, totalProductsScraped: 0, totalVariants: 0, totalImagesDownloaded: 0 });
  log("Output links and stats cleared.");
});

startButton.addEventListener("click", onStart);
loadLatestResult().then(() => {
  log("Ready. Paste a store URL and start.");
});
