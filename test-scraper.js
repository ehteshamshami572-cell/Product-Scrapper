import test from "node:test";
import assert from "node:assert";
import { normalizeStoreUrl, normalizeImageUrl } from "./scraper.js";

test("normalizeStoreUrl - standard shopify store", () => {
  const input = "example.com";
  const expected = "https://example.com";
  assert.strictEqual(normalizeStoreUrl(input), expected);
});

test("normalizeStoreUrl - with trailing slash, path and hash", () => {
  const input = "https://my-store.myshopify.com/collections/all/#some-hash?query=123";
  const expected = "https://my-store.myshopify.com/collections/all";
  assert.strictEqual(normalizeStoreUrl(input), expected);
});

test("normalizeImageUrl - handles protocol-relative and strips Shopify sizing modifiers", () => {
  const url1 = "//cdn.shopify.com/s/files/1/0000/0000/products/my-image_100x200@2x.jpg?v=123";
  const expected1 = "https://cdn.shopify.com/s/files/1/0000/0000/products/my-image.jpg";
  assert.strictEqual(normalizeImageUrl(url1), expected1);

  const url2 = "https://cdn.shopify.com/s/files/1/0000/0000/files/product_800x800.png";
  const expected2 = "https://cdn.shopify.com/s/files/1/0000/0000/files/product.png";
  assert.strictEqual(normalizeImageUrl(url2), expected2);
});

test("Single Product URL extraction logic", () => {
  const testUrl = "https://example.com/products/cool-gadget";
  const parsedUrl = new URL(testUrl);
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const isProductPage = pathParts.length >= 2 && pathParts[pathParts.length - 2] === "products";
  
  assert.strictEqual(isProductPage, true);
  assert.strictEqual(pathParts[pathParts.length - 1], "cool-gadget");
});
