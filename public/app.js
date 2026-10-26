// DOM Elements
const storeUrlInput = document.getElementById("storeUrl");
const analyzeBtn = document.getElementById("analyzeBtn");
const scrapeBtn = document.getElementById("scrapeBtn");
const clearBtn = document.getElementById("clearBtn");
const statusSection = document.getElementById("status-section");
const statusText = document.getElementById("status-text");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressPercent = document.getElementById("progress-percent");
const progressContainer = document.getElementById("progress-container");
const logElement = document.getElementById("log");
const clearConsoleBtn = document.getElementById("clearConsoleBtn");
const themeToggle = document.getElementById("theme-toggle");
const toastContainer = document.getElementById("toast-container");

// Dashboard Elements
const dashboard = document.getElementById("dashboard");
const skeletonLoader = document.getElementById("skeleton-loader");
const cmsBadge = document.getElementById("cms-name");
const cmsConfidence = document.getElementById("cms-confidence");
const cmsConfidenceFill = document.getElementById("cms-confidence-fill");
const themeName = document.getElementById("theme-name");
const themeVersion = document.getElementById("theme-version");
const themeId = document.getElementById("theme-id");
const themeIdWrapper = document.getElementById("theme-id-wrapper");
const themeAuthor = document.getElementById("theme-author");
const themeAuthorWrapper = document.getElementById("theme-author-wrapper");

// Stats Elements
const statProducts = document.getElementById("stat-products");
const statProductImages = document.getElementById("stat-product-images");
const statSiteImages = document.getElementById("stat-site-images");
const statVideos = document.getElementById("stat-videos");
const statCollections = document.getElementById("stat-collections");
const statSource = document.getElementById("stat-source");

// Download Action Buttons
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadProductZipBtn = document.getElementById("downloadProductZipBtn");
const downloadWebsiteZipBtn = document.getElementById("downloadWebsiteZipBtn");
const downloadAllZipBtn = document.getElementById("downloadAllZipBtn");

// Tab Navigation
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const productsTabNav = document.getElementById("products-tab-nav");
const imagesTabNav = document.getElementById("images-tab-nav");
const productsCountBadge = document.getElementById("products-count-badge");
const imagesCountBadge = document.getElementById("images-count-badge");

// Media Filter Pills & Counts
const filterPills = document.querySelectorAll(".filter-pill");
const filterAllCount = document.getElementById("filter-all-count");
const filterProdImagesCount = document.getElementById("filter-prod-images-count");
const filterSiteImagesCount = document.getElementById("filter-site-images-count");
const filterVideosCount = document.getElementById("filter-videos-count");

// Tech Grid & Meta
const techGrid = document.getElementById("tech-grid");
const metaFavicon = document.getElementById("meta-favicon");
const metaFaviconUrl = document.getElementById("meta-favicon-url");
const metaTitle = document.getElementById("meta-title");
const metaDescription = document.getElementById("meta-description");
const metaGenerator = document.getElementById("meta-generator");

// Raw JSON Elements
const toggleRawJsonBtn = document.getElementById("toggleRawJsonBtn");
const rawJsonContainer = document.getElementById("raw-json-container");
const rawJsonBlock = document.getElementById("raw-json-block");
const copyJsonBtn = document.getElementById("copyJsonBtn");

// Table & Images Grid
const productsTbody = document.getElementById("products-tbody");
const imagesGrid = document.getElementById("images-grid");

// App State
let analysisState = null;
let scrapeState = null;
let eventSource = null;
let logLines = [];
let currentMediaFilter = "all";

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// LOGGING UTILITIES
// ==========================================
function logToConsole(message) {
  const stamp = new Date().toLocaleTimeString();
  logLines.push(`[${stamp}] ${message}`);
  logElement.textContent = logLines.slice(-800).join("\n");
  logElement.scrollTop = logElement.scrollHeight;
}

clearConsoleBtn.addEventListener("click", () => {
  logLines = [];
  logElement.textContent = "";
});

// ==========================================
// THEME SWITCHING (DARK / LIGHT)
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("spectrum_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("spectrum_theme", newTheme);
  showToast(`Switched to ${newTheme} theme`, "info");
});

initTheme();

// ==========================================
// TAB SWITCHING LOGIC
// ==========================================
tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    const targetTab = button.getAttribute("data-tab");
    
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));

    button.classList.add("active");
    document.getElementById(targetTab)?.classList.add("active");
  });
});

// ==========================================
// MEDIA GALLERY FILTER PILLS
// ==========================================
filterPills.forEach(pill => {
  pill.addEventListener("click", () => {
    filterPills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    currentMediaFilter = pill.getAttribute("data-filter") || "all";
    if (scrapeState) {
      renderMediaGallery(scrapeState, currentMediaFilter);
    }
  });
});

// ==========================================
// ANALYSIS ACTION
// ==========================================
analyzeBtn.addEventListener("click", async () => {
  const storeUrl = storeUrlInput.value.trim();
  if (!storeUrl) {
    showToast("Please enter a valid website URL", "error");
    return;
  }

  // Reset UI State
  analyzeBtn.disabled = true;
  scrapeBtn.disabled = true;
  setDownloadButtonsEnabled(false);
  
  // Disable result-based tabs
  productsTabNav.disabled = true;
  imagesTabNav.disabled = true;
  productsTabNav.classList.remove("active");
  imagesTabNav.classList.remove("active");
  
  // Activate default Tech tab
  tabButtons.forEach(b => {
    if (b.getAttribute("data-tab") === "tech-tab") b.classList.add("active");
    else b.classList.remove("active");
  });
  tabContents.forEach(c => {
    if (c.id === "tech-tab") c.classList.add("active");
    else c.classList.remove("active");
  });

  dashboard.classList.add("hidden");
  skeletonLoader.classList.remove("hidden");
  statusSection.classList.remove("hidden");
  progressContainer.classList.add("hidden");
  
  logLines = [];
  logToConsole(`Initializing fast site analysis for ${storeUrl}...`);
  statusText.innerText = "Analyzing website CMS, tech stack, and theme...";

  try {
    const res = await fetch(`/api/analyze?storeUrl=${encodeURIComponent(storeUrl)}`);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || "Fast analysis failed.");
    }

    const payload = await res.json();
    analysisState = payload.result;

    populateDashboard(analysisState);
    
    skeletonLoader.classList.add("hidden");
    dashboard.classList.remove("hidden");
    scrapeBtn.disabled = false; // Enable products scraping
    
    showToast("Website analysis completed successfully!", "success");
    logToConsole("Analysis done. You can now start the product and media scrape.");
    statusText.innerText = "Site analysis complete. Ready to scrape products & all media.";
  } catch (error) {
    skeletonLoader.classList.add("hidden");
    statusText.innerText = "Analysis failed.";
    logToConsole(`Error: ${error.message}`);
    showToast(`Error: ${error.message}`, "error");
  } finally {
    analyzeBtn.disabled = false;
  }
});

// ==========================================
// POPULATE DASHBOARD DATA
// ==========================================
function populateDashboard(data) {
  // CMS Details
  cmsBadge.innerText = data.cms?.name || "Unknown";
  cmsConfidence.innerText = `${data.cms?.percentage || 0}% (${data.cms?.confidence || "Medium"})`;
  cmsConfidenceFill.style.width = `${data.cms?.percentage || 50}%`;

  // Theme Details
  if (data.theme) {
    themeName.innerText = data.theme.name || "Unknown Theme";
    themeVersion.innerText = data.theme.version || "Unknown";
    
    if (data.theme.id) {
      themeId.innerText = data.theme.id;
      themeIdWrapper.classList.remove("hidden");
    } else {
      themeIdWrapper.classList.add("hidden");
    }

    if (data.theme.author) {
      themeAuthor.innerText = data.theme.author;
      themeAuthorWrapper.classList.remove("hidden");
    } else {
      themeAuthorWrapper.classList.add("hidden");
    }
  } else {
    themeName.innerText = "N/A";
    themeVersion.innerText = "N/A";
    themeIdWrapper.classList.add("hidden");
    themeAuthorWrapper.classList.add("hidden");
  }

  // Scan counts
  statProducts.innerText = data.products?.totalProducts || "0";
  statCollections.innerText = data.products?.totalCollections || "0";
  statSource.innerText = data.products?.source || "API Check";
  
  if (!scrapeState) {
    statProductImages.innerText = "--";
    statSiteImages.innerText = "--";
    statVideos.innerText = "--";
  }

  // SEO details
  metaFavicon.src = data.metadata?.favicon || "";
  metaFaviconUrl.innerText = data.metadata?.favicon ? data.metadata.favicon.split("/").pop() : "None";
  metaTitle.innerText = data.metadata?.title || "No Title tag detected";
  metaDescription.innerText = data.metadata?.description || "No description meta tag detected";
  metaGenerator.innerText = data.metadata?.generator || "No generator detected";

  // Tech grid populate
  techGrid.innerHTML = "";
  if (data.technologies && data.technologies.length > 0) {
    data.technologies.forEach(tech => {
      const card = document.createElement("div");
      card.className = "tech-card";
      card.innerHTML = `
        <div class="tech-card-header">
          <span class="tech-name">${tech.name}</span>
          <span class="tech-type">${tech.type}</span>
        </div>
        <div class="tech-card-footer">
          <span class="tech-confidence-badge ${(tech.confidence || "high").toLowerCase()}">${tech.confidence}</span>
          <span class="tech-pct">${tech.percentage}%</span>
        </div>
      `;
      techGrid.appendChild(card);
    });
  } else {
    techGrid.innerHTML = `<div class="empty-state">No libraries or frameworks could be confidently detected.</div>`;
  }

  // Raw JSON Block
  rawJsonBlock.textContent = JSON.stringify(data, null, 2);
  rawJsonContainer.classList.add("hidden");
  toggleRawJsonBtn.innerText = "Show Raw JSON";
}

// Show/Hide Raw JSON
toggleRawJsonBtn.addEventListener("click", () => {
  if (rawJsonContainer.classList.contains("hidden")) {
    rawJsonContainer.classList.remove("hidden");
    toggleRawJsonBtn.innerText = "Hide Raw JSON";
  } else {
    rawJsonContainer.classList.add("hidden");
    toggleRawJsonBtn.innerText = "Show Raw JSON";
  }
});

// Copy JSON
copyJsonBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(rawJsonBlock.textContent)
    .then(() => showToast("Raw JSON copied to clipboard!", "success"))
    .catch(() => showToast("Failed to copy JSON", "error"));
});

// ==========================================
// ENABLE / DISABLE DOWNLOAD BUTTONS
// ==========================================
function setDownloadButtonsEnabled(enabled) {
  downloadCsvBtn.disabled = !enabled;
  downloadProductZipBtn.disabled = !enabled;
  downloadWebsiteZipBtn.disabled = !enabled;
  downloadAllZipBtn.disabled = !enabled;
}

// ==========================================
// SCRAPE PRODUCTS & MEDIA ACTION (SSE)
// ==========================================
scrapeBtn.addEventListener("click", () => {
  const storeUrl = storeUrlInput.value.trim();
  if (!storeUrl) return;

  if (eventSource) {
    eventSource.close();
  }

  // Disable controls during scrape
  analyzeBtn.disabled = true;
  scrapeBtn.disabled = true;
  progressBarFill.style.width = "0%";
  progressPercent.innerText = "0%";
  progressContainer.classList.remove("hidden");
  statusText.innerText = "Starting products and media extraction...";
  logToConsole("Initializing real-time stream: scraping products, variants, product photos, website banners, and videos...");

  const threads = 6;
  const sseUrl = `/api/scrape?storeUrl=${encodeURIComponent(storeUrl)}&threads=${threads}`;
  
  eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "progress") {
        logToConsole(payload.message);
      } else if (payload.type === "stats") {
        const summary = payload.summary;
        statusText.innerText = `Scraped ${summary.totalProductsScraped} of ${summary.totalProductsFound} products...`;
        
        if (summary.totalProductsFound > 0) {
          const pct = Math.floor((summary.totalProductsScraped / summary.totalProductsFound) * 100);
          progressBarFill.style.width = `${pct}%`;
          progressPercent.innerText = `${pct}%`;
        }
      } else if (payload.type === "complete") {
        scrapeState = payload.result;
        
        logToConsole("Scraping completed! Finalizing UI lists & media assets...");
        showToast("Products & media extraction completed successfully!", "success");
        statusText.innerText = "Scrape complete. Official Shopify CSV and media archives ready.";
        
        progressBarFill.style.width = "100%";
        progressPercent.innerText = "100%";

        // Update Stats in Sidebar
        statProducts.innerText = scrapeState.records?.length || 0;
        statProductImages.innerText = scrapeState.images?.length || 0;
        statSiteImages.innerText = scrapeState.websiteMedia?.images?.length || 0;
        statVideos.innerText = scrapeState.videos?.length || 0;

        // Enable Result Tabs & populate
        productsCountBadge.innerText = scrapeState.records?.length || 0;
        imagesCountBadge.innerText = scrapeState.allMedia?.length || scrapeState.images?.length || 0;

        populateProductsTable(scrapeState.records);
        updateMediaFilterCounts(scrapeState);
        renderMediaGallery(scrapeState, currentMediaFilter);

        productsTabNav.disabled = false;
        imagesTabNav.disabled = false;

        // Enable All 4 Download buttons
        setDownloadButtonsEnabled(true);

        // Save latest to localStorage for quick restore
        try {
          localStorage.setItem("spectrum_latest_scrape", JSON.stringify({
            url: storeUrl,
            analysis: analysisState,
            scrape: scrapeState
          }));
        } catch {
          // Ignored
        }

        eventSource.close();
        eventSource = null;
        analyzeBtn.disabled = false;
      } else if (payload.type === "error") {
        statusText.innerText = "Scrape failed.";
        logToConsole(`Scrape Error: ${payload.error}`);
        showToast(`Error: ${payload.error}`, "error");
        
        eventSource.close();
        eventSource = null;
        analyzeBtn.disabled = false;
        scrapeBtn.disabled = false;
      }
    } catch (err) {
      logToConsole(`Error parsing stream event: ${err.message}`);
    }
  };

  eventSource.onerror = (event) => {
    if (eventSource) {
      statusText.innerText = "Scrape connection interrupted.";
      logToConsole("Connection to server lost.");
      showToast("Connection to server lost.", "error");
      
      eventSource.close();
      eventSource = null;
      analyzeBtn.disabled = false;
      scrapeBtn.disabled = false;
    }
  };
});

// ==========================================
// POPULATE PRODUCTS TABLE
// ==========================================
function populateProductsTable(products) {
  productsTbody.innerHTML = "";
  if (!products || products.length === 0) {
    productsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">No products extracted.</td></tr>`;
    return;
  }

  products.forEach(p => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(p.title)}</strong></td>
      <td class="mono-text">$${p.price || "N/A"}</td>
      <td>${escapeHtml(p.vendor || "N/A")}</td>
      <td><span class="logo-tag">${escapeHtml(p.product_type || "Product")}</span></td>
      <td>${p.variants?.length || 1}</td>
      <td><span class="status-active-pill">ACTIVE</span></td>
      <td><a href="${p.product_url}" target="_blank" class="table-link">View Page &rarr;</a></td>
    `;
    productsTbody.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// MEDIA GALLERY COUNTS & RENDERING
// ==========================================
function updateMediaFilterCounts(state) {
  const allMedia = state.allMedia || state.images || [];
  const prodImages = allMedia.filter(m => m.category === "product" && m.type !== "video");
  const siteImages = allMedia.filter(m => m.category === "website" && m.type !== "video");
  const videos = allMedia.filter(m => m.type === "video");

  filterAllCount.innerText = allMedia.length;
  filterProdImagesCount.innerText = prodImages.length;
  filterSiteImagesCount.innerText = siteImages.length;
  filterVideosCount.innerText = videos.length;
  imagesCountBadge.innerText = allMedia.length;
}

function renderMediaGallery(state, filter = "all") {
  imagesGrid.innerHTML = "";
  let items = state.allMedia || state.images || [];

  if (filter === "product-images") {
    items = items.filter(m => m.category === "product" && m.type !== "video");
  } else if (filter === "website-images") {
    items = items.filter(m => m.category === "website" && m.type !== "video");
  } else if (filter === "videos") {
    items = items.filter(m => m.type === "video");
  }

  if (!items || items.length === 0) {
    imagesGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">No media items found for this filter.</div>`;
    return;
  }

  items.forEach(item => {
    const isVideo = item.type === "video" || /\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(item.src);
    const categoryLabel = item.category === "website" ? "Website Banner" : "Product Media";
    const categoryClass = item.category === "website" ? "website" : "product";

    const card = document.createElement("div");
    card.className = "image-card";

    if (isVideo) {
      card.innerHTML = `
        <div class="media-card-top">
          <span class="media-tag-badge ${categoryClass}">${categoryLabel}</span>
          <span class="media-type-badge">VIDEO (${item.format || "MP4"})</span>
          <div class="media-video-wrapper">
            <video controls preload="metadata" poster="${item.thumbnail || ""}" src="${item.src}">
              Your browser does not support HTML5 video.
            </video>
          </div>
        </div>
        <div class="image-card-info">
          <span class="img-filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
          <span class="img-res">${item.resolution || "HD Video"}</span>
          <span class="img-alt" title="${escapeHtml(item.alt || "")}">${escapeHtml(item.alt || item.filename)}</span>
          <a href="${item.src}" target="_blank" download="${escapeHtml(item.filename)}" class="card-download-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download Video</span>
          </a>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="media-card-top">
          <span class="media-tag-badge ${categoryClass}">${categoryLabel}</span>
          <div class="image-thumb-wrapper">
            <img src="${item.thumbnail || item.src}" alt="${escapeHtml(item.alt || "")}" loading="lazy" />
          </div>
        </div>
        <div class="image-card-info">
          <span class="img-filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
          <span class="img-res">${item.resolution || "Standard"}</span>
          <span class="img-alt" title="${escapeHtml(item.alt || "")}">${escapeHtml(item.alt || item.filename)}</span>
          <a href="${item.src}" target="_blank" download="${escapeHtml(item.filename)}" class="card-download-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download Image</span>
          </a>
        </div>
      `;
    }

    imagesGrid.appendChild(card);
  });
}

// ==========================================
// EXPORTS DOWNLOAD FLOW
// ==========================================
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

// Helper to get safe hostname
function getStoreHost() {
  try {
    return new URL(storeUrlInput.value.trim()).hostname;
  } catch {
    return "shopify_store";
  }
}

// 1. Download Official Shopify CSV (Status: Active)
downloadCsvBtn.addEventListener("click", async () => {
  if (!scrapeState || !scrapeState.records) return;
  
  downloadCsvBtn.disabled = true;
  showToast("Generating official Shopify import CSV with Active status...", "info");

  try {
    const host = getStoreHost();
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "csv",
        products: scrapeState.records,
        host
      })
    });

    if (!res.ok) {
      throw new Error("Failed to compile Shopify CSV on server.");
    }

    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `${host}_${stamp}_shopify_products_active.csv`);
    showToast("Shopify Product CSV downloaded! Ready for 1-click import into Shopify Admin.", "success");
    logToConsole("Shopify Product CSV downloaded successfully with Status: active.");
  } catch (err) {
    showToast(`Export failed: ${err.message}`, "error");
  } finally {
    downloadCsvBtn.disabled = false;
  }
});

// 2. Download Product Images ZIP
downloadProductZipBtn.addEventListener("click", async () => {
  const productImages = scrapeState?.images || scrapeState?.productMedia?.images || [];
  if (!productImages.length) {
    showToast("No product images available to download.", "error");
    return;
  }

  downloadProductZipBtn.disabled = true;
  showToast(`Bundling ${productImages.length} product images into ZIP...`, "info");
  logToConsole("Server is bundling product gallery photos into ZIP archive...");

  try {
    const host = getStoreHost();
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "zip",
        category: "product_images",
        items: productImages,
        host
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to generate Product Images ZIP.");
    }

    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `${host}_${stamp}_product_images.zip`);
    showToast("Product Images ZIP downloaded successfully!", "success");
    logToConsole("Product Images ZIP archive downloaded.");
  } catch (err) {
    showToast(`ZIP generation failed: ${err.message}`, "error");
  } finally {
    downloadProductZipBtn.disabled = false;
  }
});

// 3. Download Website Media ZIP (Banners, Logos, Site Images & Videos)
downloadWebsiteZipBtn.addEventListener("click", async () => {
  const siteImages = scrapeState?.websiteMedia?.images || [];
  const siteVideos = scrapeState?.websiteMedia?.videos || [];
  const websiteItems = [...siteImages, ...siteVideos];

  if (!websiteItems.length) {
    showToast("No website banners or videos found to download.", "error");
    return;
  }

  downloadWebsiteZipBtn.disabled = true;
  showToast(`Bundling ${websiteItems.length} website media assets (Images & Videos) into ZIP...`, "info");
  logToConsole("Server is downloading website banners, graphics, and videos into ZIP archive...");

  try {
    const host = getStoreHost();
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "zip",
        category: "website_media",
        items: websiteItems,
        host
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to generate Website Media ZIP.");
    }

    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `${host}_${stamp}_website_media.zip`);
    showToast("Website Media ZIP downloaded successfully!", "success");
    logToConsole("Website Media ZIP archive downloaded.");
  } catch (err) {
    showToast(`ZIP generation failed: ${err.message}`, "error");
  } finally {
    downloadWebsiteZipBtn.disabled = false;
  }
});

// 4. Download All Media Bundle ZIP (Everything in organized folders)
downloadAllZipBtn.addEventListener("click", async () => {
  const allItems = scrapeState?.allMedia || scrapeState?.images || [];
  if (!allItems.length) {
    showToast("No media items available to download.", "error");
    return;
  }

  downloadAllZipBtn.disabled = true;
  showToast(`Bundling complete archive of ${allItems.length} media files into organized ZIP...`, "info");
  logToConsole("Server is packaging all product photos, website images, and videos into folders...");

  try {
    const host = getStoreHost();
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "zip",
        category: "all_media_bundle",
        items: allItems,
        host
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to generate All Media ZIP.");
    }

    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `${host}_${stamp}_all_media.zip`);
    showToast("All Media ZIP downloaded successfully!", "success");
    logToConsole("All Media ZIP archive downloaded.");
  } catch (err) {
    showToast(`ZIP generation failed: ${err.message}`, "error");
  } finally {
    downloadAllZipBtn.disabled = false;
  }
});

// ==========================================
// RESTORE LATEST RESULTS FROM LOCALSTORAGE
// ==========================================
function restoreLatest() {
  try {
    const saved = localStorage.getItem("spectrum_latest_scrape");
    if (saved) {
      const data = JSON.parse(saved);
      storeUrlInput.value = data.url || "";
      
      if (data.analysis) {
        analysisState = data.analysis;
        populateDashboard(analysisState);
        dashboard.classList.remove("hidden");
        scrapeBtn.disabled = false;
      }
      
      if (data.scrape) {
        scrapeState = data.scrape;
        
        statProducts.innerText = scrapeState.records?.length || 0;
        statProductImages.innerText = scrapeState.images?.length || 0;
        statSiteImages.innerText = scrapeState.websiteMedia?.images?.length || 0;
        statVideos.innerText = scrapeState.videos?.length || 0;

        productsCountBadge.innerText = scrapeState.records?.length || 0;
        imagesCountBadge.innerText = scrapeState.allMedia?.length || scrapeState.images?.length || 0;
        
        populateProductsTable(scrapeState.records);
        updateMediaFilterCounts(scrapeState);
        renderMediaGallery(scrapeState, currentMediaFilter);
        
        productsTabNav.disabled = false;
        imagesTabNav.disabled = false;
        
        setDownloadButtonsEnabled(true);
        logToConsole("Restored previous scrape results & media from browser memory.");
      }
    }
  } catch {
    // Ignored
  }
}

// Clear button
clearBtn.addEventListener("click", () => {
  analysisState = null;
  scrapeState = null;
  storeUrlInput.value = "";
  
  localStorage.removeItem("spectrum_latest_scrape");
  
  scrapeBtn.disabled = true;
  setDownloadButtonsEnabled(false);
  
  productsTabNav.disabled = true;
  imagesTabNav.disabled = true;
  productsTabNav.classList.remove("active");
  imagesTabNav.classList.remove("active");

  tabButtons.forEach(b => {
    if (b.getAttribute("data-tab") === "tech-tab") b.classList.add("active");
    else b.classList.remove("active");
  });
  tabContents.forEach(c => {
    if (c.id === "tech-tab") c.classList.add("active");
    else c.classList.remove("active");
  });

  dashboard.classList.add("hidden");
  skeletonLoader.classList.add("hidden");
  statusSection.classList.add("hidden");
  progressContainer.classList.add("hidden");
  
  productsCountBadge.innerText = "0";
  imagesCountBadge.innerText = "0";
  productsTbody.innerHTML = "";
  imagesGrid.innerHTML = "";
  techGrid.innerHTML = "";
  
  logLines = [];
  logElement.textContent = "";

  showToast("Local storage and workspace cleared successfully!", "success");
});

restoreLatest();
