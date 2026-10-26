import test from "node:test";
import assert from "node:assert";
import JSZip from "jszip";
import { productsToShopifyCsv, SHOPIFY_CSV_HEADERS, generateMediaZip } from "./lib/managers/download.js";
import { extractMediaFromHtml, extractProductVideosAndMedia } from "./lib/extractors/media.js";

test("Shopify CSV - generates exact 51 official headers", () => {
  assert.strictEqual(SHOPIFY_CSV_HEADERS.length, 51);
  assert.strictEqual(SHOPIFY_CSV_HEADERS[0], "Handle");
  assert.strictEqual(SHOPIFY_CSV_HEADERS[1], "Title");
  assert.strictEqual(SHOPIFY_CSV_HEADERS[2], "Body (HTML)");
  assert.strictEqual(SHOPIFY_CSV_HEADERS[7], "Published");
  assert.strictEqual(SHOPIFY_CSV_HEADERS[25], "Image Src");
  assert.strictEqual(SHOPIFY_CSV_HEADERS[26], "Image Position");
  assert.strictEqual(SHOPIFY_CSV_HEADERS[50], "Status");
});

test("Shopify CSV - product status is 'active' and published is 'TRUE'", () => {
  const sampleProducts = [
    {
      id: 101,
      title: "Premium Leather Jacket",
      handle: "premium-leather-jacket",
      body_html: "<p>Top quality genuine leather</p>",
      vendor: "UrbanWear",
      product_type: "Outerwear",
      tags: ["leather", "winter", "jacket"],
      price: "199.99",
      variants: [
        {
          id: 1001,
          title: "Black / L",
          price: "199.99",
          sku: "JKT-BLK-L",
          barcode: "123456789012",
          option1: "Black",
          option2: "L",
          inventory_quantity: 15,
        },
        {
          id: 1002,
          title: "Brown / M",
          price: "189.99",
          sku: "JKT-BRN-M",
          barcode: "123456789013",
          option1: "Brown",
          option2: "M",
          inventory_quantity: 8,
        }
      ],
      options: [
        { name: "Color", values: ["Black", "Brown"] },
        { name: "Size", values: ["L", "M"] }
      ],
      images: [
        { src: "https://cdn.shopify.com/s/files/1/00/products/jacket1_800x800.jpg", alt: "Front view" },
        { src: "https://cdn.shopify.com/s/files/1/00/products/jacket2_800x800.jpg", alt: "Back view" },
        { src: "https://cdn.shopify.com/s/files/1/00/products/jacket3_800x800.jpg", alt: "Close up" },
      ]
    }
  ];

  const csv = productsToShopifyCsv(sampleProducts);
  
  // Verify UTF-8 BOM
  assert.strictEqual(csv.startsWith("\uFEFF"), true);

  const cleanCsv = csv.slice(1);
  const rows = cleanCsv.split("\r\n").map(line => {
    // Basic CSV parser for quoted fields
    const values = [];
    const re = /(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      values.push(match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]);
    }
    return values;
  });

  const headerRow = rows[0];
  const row1 = rows[1];
  const row2 = rows[2];
  const row3 = rows[3];

  const statusIdx = headerRow.indexOf("Status");
  const publishedIdx = headerRow.indexOf("Published");
  const handleIdx = headerRow.indexOf("Handle");
  const titleIdx = headerRow.indexOf("Title");
  const opt1NameIdx = headerRow.indexOf("Option1 Name");
  const opt1ValIdx = headerRow.indexOf("Option1 Value");
  const imageSrcIdx = headerRow.indexOf("Image Src");
  const imagePosIdx = headerRow.indexOf("Image Position");

  // Row 1 assertions
  assert.strictEqual(row1[statusIdx], "active");
  assert.strictEqual(row1[publishedIdx], "TRUE");
  assert.strictEqual(row1[handleIdx], "premium-leather-jacket");
  assert.strictEqual(row1[titleIdx], "Premium Leather Jacket");
  assert.strictEqual(row1[opt1NameIdx], "Color");
  assert.strictEqual(row1[opt1ValIdx], "Black");
  assert.strictEqual(row1[imageSrcIdx], "https://cdn.shopify.com/s/files/1/00/products/jacket1.jpg");
  assert.strictEqual(row1[imagePosIdx], "1");

  // Row 2 assertions (Variant 2)
  assert.strictEqual(row2[handleIdx], "premium-leather-jacket");
  assert.strictEqual(row2[titleIdx], ""); // Must be blank on continuation rows
  assert.strictEqual(row2[opt1ValIdx], "Brown");
  assert.strictEqual(row2[imageSrcIdx], "https://cdn.shopify.com/s/files/1/00/products/jacket2.jpg");
  assert.strictEqual(row2[imagePosIdx], "2");

  // Row 3 assertions (Extra Image 3, no variant)
  assert.strictEqual(row3[handleIdx], "premium-leather-jacket");
  assert.strictEqual(row3[opt1ValIdx], ""); // No variant for 3rd row
  assert.strictEqual(row3[imageSrcIdx], "https://cdn.shopify.com/s/files/1/00/products/jacket3.jpg");
  assert.strictEqual(row3[imagePosIdx], "3");
});

test("Website Media Extractor - extracts banners, videos, background images, and srcset", () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:image" content="https://cdn.shopify.com/s/files/1/00/og_banner.jpg" />
      </head>
      <body>
        <header>
          <img src="//cdn.shopify.com/s/files/1/00/logo_150x.png" alt="Store Logo" />
        </header>
        <div class="hero-slider" style="background-image: url('https://cdn.shopify.com/s/files/1/00/slider_bg.jpg')">
          <picture>
            <source srcset="https://cdn.shopify.com/s/files/1/00/hero_mobile.webp 500w, https://cdn.shopify.com/s/files/1/00/hero_desktop.webp 1800w" />
            <img src="https://cdn.shopify.com/s/files/1/00/hero_desktop.jpg" alt="Hero Banner" />
          </picture>
        </div>
        <div class="video-section">
          <video poster="https://cdn.shopify.com/s/files/1/00/video_thumb.jpg">
            <source src="https://cdn.shopify.com/videos/c/o/v/summer_promo.mp4" type="video/mp4" />
            <source src="//cdn.shopify.com/videos/c/o/v/summer_promo.webm" type="video/webm" />
          </video>
        </div>
        <script>
          window.themeVideo = "https:\\/\\/cdn.shopify.com\\/videos\\/c\\/o\\/v\\/hero_background.mp4";
        </script>
      </body>
    </html>
  `;

  const { images, videos } = extractMediaFromHtml(sampleHtml, "https://example-shop.com", "website");

  // Verify videos extraction
  assert.ok(videos.length >= 2, `Expected at least 2 videos, found ${videos.length}`);
  const hasSummerPromo = videos.some(v => v.src.includes("summer_promo.mp4"));
  const hasHeroBg = videos.some(v => v.src.includes("hero_background.mp4"));
  assert.strictEqual(hasSummerPromo, true);
  assert.strictEqual(hasHeroBg, true);
  assert.strictEqual(videos[0].type, "video");

  // Verify images extraction
  assert.ok(images.length >= 4, `Expected at least 4 images, found ${images.length}`);
  const hasLogo = images.some(img => img.src.includes("logo.png"));
  const hasHeroDesktop = images.some(img => img.src.includes("hero_desktop"));
  const hasSliderBg = images.some(img => img.src.includes("slider_bg.jpg"));
  const hasOgBanner = images.some(img => img.src.includes("og_banner.jpg"));

  assert.strictEqual(hasLogo, true);
  assert.strictEqual(hasHeroDesktop, true);
  assert.strictEqual(hasSliderBg, true);
  assert.strictEqual(hasOgBanner, true);
});

test("Product Media Extractor - extracts product media videos and embedded description media", () => {
  const sampleProducts = [
    {
      title: "Smart Watch V2",
      handle: "smart-watch-v2",
      body_html: `
        <div>
          <p>Check out our introduction video:</p>
          <video src="https://cdn.shopify.com/s/files/1/00/files/smartwatch_demo.mp4"></video>
          <img src="https://cdn.shopify.com/s/files/1/00/files/infographic_chart.png" alt="Specs chart" />
        </div>
      `,
      media: [
        {
          media_type: "video",
          sources: [
            { format: "mp4", url: "https://cdn.shopify.com/videos/c/o/v/watch_hd_1080p.mp4", width: 1920, height: 1080 }
          ],
          preview_image: { src: "https://cdn.shopify.com/videos/c/o/v/watch_poster.jpg" }
        }
      ]
    }
  ];

  const { videos, extraImages } = extractProductVideosAndMedia(sampleProducts);

  assert.strictEqual(videos.length, 2); // 1 from media array + 1 from body_html
  assert.strictEqual(videos.some(v => v.src.includes("watch_hd_1080p.mp4")), true);
  assert.strictEqual(videos.some(v => v.src.includes("smartwatch_demo.mp4")), true);
  assert.strictEqual(extraImages.length, 1);
  assert.strictEqual(extraImages[0].src.includes("infographic_chart.png"), true);
});

test("generateMediaZip - bundles images and videos into organized folders", async () => {
  // Mock fetch to simulate downloaded media without hitting network
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from("mock_media_data"),
      headers: new Headers(),
    };
  };

  try {
    const items = [
      {
        src: "https://cdn.shopify.com/s/files/1/00/products/shirt.jpg",
        filename: "shirt.jpg",
        type: "image",
        category: "product",
      },
      {
        src: "https://cdn.shopify.com/videos/c/o/v/shirt_demo.mp4",
        filename: "shirt_demo.mp4",
        type: "video",
        category: "product",
      },
      {
        src: "https://cdn.shopify.com/s/files/1/00/site_banner.jpg",
        filename: "site_banner.jpg",
        type: "image",
        category: "website",
      },
      {
        src: "https://cdn.shopify.com/videos/c/o/v/hero_loop.mp4",
        filename: "hero_loop.mp4",
        type: "video",
        category: "website",
      },
    ];

    const zipBuffer = await generateMediaZip(items);
    assert.ok(Buffer.isBuffer(zipBuffer), "Expected nodebuffer output");

    const unzipped = await JSZip.loadAsync(zipBuffer);
    const filePaths = Object.keys(unzipped.files);

    assert.ok(filePaths.includes("products/images/shirt.jpg"));
    assert.ok(filePaths.includes("products/videos/shirt_demo.mp4"));
    assert.ok(filePaths.includes("website/images/site_banner.jpg"));
    assert.ok(filePaths.includes("website/videos/hero_loop.mp4"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
