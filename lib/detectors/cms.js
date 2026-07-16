export function detectCMS(html, headers = {}) {
  const scores = {
    Shopify: 0,
    WordPress: 0,
    WooCommerce: 0,
    Magento: 0,
    BigCommerce: 0,
    Wix: 0,
    Squarespace: 0,
    Webflow: 0,
    PrestaShop: 0,
    OpenCart: 0,
    Ghost: 0,
    Drupal: 0,
    Joomla: 0,
    SalesforceCommerceCloud: 0,
  };

  const htmlLower = html.toLowerCase();

  // Convert headers keys to lowercase
  const headersLower = {};
  for (const [k, v] of Object.entries(headers)) {
    headersLower[k.toLowerCase()] = String(v).toLowerCase();
  }

  // --- Shopify Signatures ---
  if (htmlLower.includes("cdn.shopify.com")) scores.Shopify += 80;
  if (htmlLower.includes("window.shopify")) scores.Shopify += 75;
  if (htmlLower.includes("shopify-payment-button")) scores.Shopify += 60;
  if (htmlLower.includes("shopify-features")) scores.Shopify += 50;
  if (htmlLower.includes("content_for_header")) scores.Shopify += 50;
  if (headersLower["x-shopid"] || headersLower["x-shopify-stage"]) scores.Shopify += 95;

  // --- WordPress Signatures ---
  if (htmlLower.includes("/wp-content/")) scores.WordPress += 70;
  if (htmlLower.includes("/wp-includes/")) scores.WordPress += 70;
  if (htmlLower.includes("wp-embed.min.js")) scores.WordPress += 50;
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress[^"']*["']/i.test(html)) scores.WordPress += 90;

  // --- WooCommerce Signatures (WooCommerce relies on WordPress) ---
  if (htmlLower.includes("woocommerce-") || htmlLower.includes("class=\"woocommerce")) scores.WooCommerce += 75;
  if (htmlLower.includes("wc-cart-fragments") || htmlLower.includes("woocommerce_params")) scores.WooCommerce += 70;
  if (htmlLower.includes("wc-block-")) scores.WooCommerce += 50;

  // --- Magento Signatures ---
  if (htmlLower.includes("magento_theme") || htmlLower.includes("class=\"magento-")) scores.Magento += 80;
  if (htmlLower.includes("x-magento-init")) scores.Magento += 90;
  if (htmlLower.includes("mage/cookies.js") || htmlLower.includes("mage/translate.js")) scores.Magento += 70;

  // --- BigCommerce Signatures ---
  if (htmlLower.includes("cdn11.bigcommerce.com")) scores.BigCommerce += 80;
  if (htmlLower.includes("stencil") && htmlLower.includes("window.bcdata")) scores.BigCommerce += 85;
  if (htmlLower.includes("bigcommerce.js")) scores.BigCommerce += 70;

  // --- Wix Signatures ---
  if (htmlLower.includes("wix-site-properties") || htmlLower.includes("wix-style-map")) scores.Wix += 90;
  if (htmlLower.includes("static.wixstatic.com")) scores.Wix += 85;
  if (htmlLower.includes("wix.com")) scores.Wix += 50;

  // --- Squarespace Signatures ---
  if (htmlLower.includes("static1.squarespace.com")) scores.Squarespace += 85;
  if (htmlLower.includes("squarespace.theme") || htmlLower.includes("squarespace.context")) scores.Squarespace += 80;

  // --- Webflow Signatures ---
  if (htmlLower.includes("data-wf-page") || htmlLower.includes("data-wf-site")) scores.Webflow += 95;
  if (htmlLower.includes("webflow.js")) scores.Webflow += 70;

  // --- PrestaShop Signatures ---
  if (htmlLower.includes("prestashop") || htmlLower.includes("class=\"prestashop")) scores.PrestaShop += 70;
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']PrestaShop["']/i.test(html)) scores.PrestaShop += 90;

  // --- OpenCart Signatures ---
  if (htmlLower.includes("catalog/view/theme") && htmlLower.includes("catalog/view/javascript")) scores.OpenCart += 80;
  if (htmlLower.includes("index.php?route=common/home")) scores.OpenCart += 60;

  // --- Ghost Signatures ---
  if (htmlLower.includes("ghost-sdk.js") || htmlLower.includes("ghost-sdk.min.js")) scores.Ghost += 90;
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Ghost[^"']*["']/i.test(html)) scores.Ghost += 90;

  // --- Drupal Signatures ---
  if (htmlLower.includes("drupal.settings") || htmlLower.includes("drupal.behaviors")) scores.Drupal += 90;
  if (htmlLower.includes("/sites/default/files/")) scores.Drupal += 70;
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Drupal[^"']*["']/i.test(html)) scores.Drupal += 90;

  // --- Joomla Signatures ---
  if (htmlLower.includes("/media/system/js/")) scores.Joomla += 70;
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Joomla[^"']*["']/i.test(html)) scores.Joomla += 90;

  // --- Salesforce Commerce Cloud (Demandware) ---
  if (htmlLower.includes("dwac-") || htmlLower.includes("demandware.store")) scores.SalesforceCommerceCloud += 85;
  if (htmlLower.includes("demandware.edgesuite.net")) scores.SalesforceCommerceCloud += 80;

  // Find the highest score
  let detectedCMS = "Custom CMS";
  let maxScore = 0;

  for (const [cms, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedCMS = cms;
    }
  }

  // Resolve WordPress vs WooCommerce. If WooCommerce is detected with some score,
  // and WordPress is also detected, it's WooCommerce (running on WP).
  if (detectedCMS === "WordPress" && scores.WooCommerce >= 30) {
    detectedCMS = "WooCommerce";
    maxScore = Math.max(maxScore, scores.WooCommerce);
  }

  // Format CMS Name nicely
  let cmsName = detectedCMS;
  if (cmsName === "SalesforceCommerceCloud") cmsName = "Salesforce Commerce Cloud";

  // Confidence level mapping
  let confidence = "Low";
  let confidencePct = Math.min(100, maxScore);
  if (maxScore >= 75) {
    confidence = "High";
  } else if (maxScore >= 40) {
    confidence = "Medium";
  } else if (maxScore >= 15) {
    confidence = "Low";
  } else {
    cmsName = "Custom CMS";
    confidence = "High"; // High confidence that it is custom-built (no signatures found)
    confidencePct = 100;
  }

  return {
    name: cmsName,
    confidence,
    percentage: confidencePct,
  };
}
