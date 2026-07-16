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
const statProducts = document.getElementById("stat-products");
const statCollections = document.getElementById("stat-collections");
const statSource = document.getElementById("stat-source");

// Download Buttons
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadZipBtn = document.getElementById("downloadZipBtn");

// Tab Navigation
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const productsTabNav = document.getElementById("products-tab-nav");
const imagesTabNav = document.getElementById("images-tab-nav");
const productsCountBadge = document.getElementById("products-count-badge");
const imagesCountBadge = document.getElementById("images-count-badge");

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

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;
  toastContainer.appendChild(toast);

  // Auto remove
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
    
    // Deactivate current tabs
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));

    // Activate selected tab
    button.classList.add("active");
    document.getElementById(targetTab).classList.add("active");
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
  downloadCsvBtn.disabled = true;
  downloadZipBtn.disabled = true;
  
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
  statusText.innerText = "Analyzing website CMS and tech stack...";

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
    logToConsole("Analysis done. You can now start the product scrape.");
    statusText.innerText = "Site analysis complete. Ready to scrape products.";
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
  cmsBadge.innerText = data.cms.name;
  cmsConfidence.innerText = `${data.cms.percentage}% (${data.cms.confidence})`;
  cmsConfidenceFill.style.width = `${data.cms.percentage}%`;

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
  statProducts.innerText = data.products.totalProducts;
  statCollections.innerText = data.products.totalCollections || "0";
  statSource.innerText = data.products.source;

  // SEO details
  metaFavicon.src = data.metadata.favicon || "";
  metaFaviconUrl.innerText = data.metadata.favicon ? data.metadata.favicon.split("/").pop() : "None";
  metaTitle.innerText = data.metadata.title || "No Title tag detected";
  metaDescription.innerText = data.metadata.description || "No description meta tag detected";
  metaGenerator.innerText = data.metadata.generator || "No generator detected";

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
          <span class="tech-confidence-badge ${tech.confidence.toLowerCase()}">${tech.confidence}</span>
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
// SCRAPE PRODUCTS ACTION (SSE)
// ==========================================
scrapeBtn.addEventListener("click", () => {
  const storeUrl = storeUrlInput.value.trim();
  if (!storeUrl) return;

  // Clear previous SSE connection if open
  if (eventSource) {
    eventSource.close();
  }

  // Disable controls during scrape
  analyzeBtn.disabled = true;
  scrapeBtn.disabled = true;
  progressBarFill.style.width = "0%";
  progressPercent.innerText = "0%";
  progressContainer.classList.remove("hidden");
  statusText.innerText = "Starting products scraping...";
  logToConsole("Initializing real-time Server-Sent Events stream for scraping...");

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
        
        logToConsole("Scraping completed! Finalizing UI lists...");
        showToast("Products scrape completed!", "success");
        statusText.innerText = "Products scrape complete. Export ready.";
        
        progressBarFill.style.width = "100%";
        progressPercent.innerText = "100%";
        
        // Enable Result Tabs & populate
        productsCountBadge.innerText = scrapeState.records?.length || 0;
        imagesCountBadge.innerText = scrapeState.images?.length || 0;

        populateProductsTable(scrapeState.records);
        populateImagesGrid(scrapeState.images);

        productsTabNav.disabled = false;
        imagesTabNav.disabled = false;

        // Enable Download buttons
        downloadCsvBtn.disabled = false;
        downloadZipBtn.disabled = false;

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
    // Only handle if eventSource is still active (connection died before complete)
    if (eventSource) {
      statusText.innerText = "Scrape failed.";
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
    productsTbody.innerHTML = `<tr><td colspan="6" class="empty-state">No products extracted.</td></tr>`;
    return;
  }

  products.forEach(p => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${p.title}</strong></td>
      <td class="mono-text">$${p.price || "N/A"}</td>
      <td>${p.vendor || "N/A"}</td>
      <td><span class="logo-tag">${p.product_type || "N/A"}</span></td>
      <td>${p.variants?.length || 0}</td>
      <td><a href="${p.product_url}" target="_blank" class="table-link">View Page &rarr;</a></td>
    `;
    productsTbody.appendChild(row);
  });
}

// ==========================================
// POPULATE IMAGES GRID
// ==========================================
function populateImagesGrid(images) {
  imagesGrid.innerHTML = "";
  if (!images || images.length === 0) {
    imagesGrid.innerHTML = `<div class="empty-state">No product images extracted.</div>`;
    return;
  }

  images.forEach(img => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.innerHTML = `
      <div class="image-thumb-wrapper">
        <img src="${img.thumbnail}" alt="${img.alt}" loading="lazy" />
      </div>
      <div class="image-card-info">
        <span class="img-filename">${img.filename}</span>
        <span class="img-res">${img.resolution}</span>
        <span class="img-alt" title="${img.alt}">${img.alt}</span>
      </div>
    `;
    imagesGrid.appendChild(card);
  });
}

// ==========================================
// EXPORTS DOWNLOAD FLOW
// ==========================================

// Helper to trigger browser download of a blob
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

// 1. Download Product CSV (stateless export POST)
downloadCsvBtn.addEventListener("click", async () => {
  if (!scrapeState || !scrapeState.records) return;
  
  downloadCsvBtn.disabled = true;
  showToast("Generating CSV download...", "info");

  try {
    const host = new URL(storeUrlInput.value.trim()).hostname;
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
      throw new Error("Failed to compile CSV on server.");
    }

    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `${host}_${stamp}_products.csv`);
    showToast("Product CSV downloaded successfully!", "success");
  } catch (err) {
    showToast(`Export failed: ${err.message}`, "error");
  } finally {
    downloadCsvBtn.disabled = false;
  }
});

// 2. Download Images ZIP (stateless export POST)
downloadZipBtn.addEventListener("click", async () => {
  if (!scrapeState || !scrapeState.images) return;

  downloadZipBtn.disabled = true;
  showToast("Bundling images into ZIP. This may take a minute...", "info");
  logToConsole("Requested ZIP export. Server is downloading image assets and compressing...");

  try {
    const host = new URL(storeUrlInput.value.trim()).hostname;
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "zip",
        images: scrapeState.images,
        host
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to generate ZIP on server.");
    }

    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(blob, `${host}_${stamp}_images.zip`);
    showToast("Images ZIP downloaded successfully!", "success");
    logToConsole("Images ZIP downloaded successfully.");
  } catch (err) {
    logToConsole(`ZIP Error: ${err.message}`);
    showToast(`ZIP generation failed: ${err.message}`, "error");
  } finally {
    downloadZipBtn.disabled = false;
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
        
        productsCountBadge.innerText = scrapeState.records?.length || 0;
        imagesCountBadge.innerText = scrapeState.images?.length || 0;
        
        populateProductsTable(scrapeState.records);
        populateImagesGrid(scrapeState.images);
        
        productsTabNav.disabled = false;
        imagesTabNav.disabled = false;
        
        downloadCsvBtn.disabled = false;
        downloadZipBtn.disabled = false;
        
        logToConsole("Restored previous scrape results from browser memory.");
      }
    }
  } catch {
    // Ignored
  }
}

clearBtn.addEventListener("click", () => {
  // Clear state
  analysisState = null;
  scrapeState = null;
  
  // Clear input
  storeUrlInput.value = "";
  
  // Clear local storage
  localStorage.removeItem("spectrum_latest_scrape");
  
  // Disable buttons
  scrapeBtn.disabled = true;
  downloadCsvBtn.disabled = true;
  downloadZipBtn.disabled = true;
  
  // Disable tabs
  productsTabNav.disabled = true;
  imagesTabNav.disabled = true;
  productsTabNav.classList.remove("active");
  imagesTabNav.classList.remove("active");

  // Reset tab buttons and contents to default active tab
  tabButtons.forEach(b => {
    if (b.getAttribute("data-tab") === "tech-tab") b.classList.add("active");
    else b.classList.remove("active");
  });
  tabContents.forEach(c => {
    if (c.id === "tech-tab") c.classList.add("active");
    else c.classList.remove("active");
  });

  // Hide UI blocks
  dashboard.classList.add("hidden");
  skeletonLoader.classList.add("hidden");
  statusSection.classList.add("hidden");
  progressContainer.classList.add("hidden");
  
  // Reset badges and grids
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
