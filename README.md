# Shopify Web App Scraper

This is a local website version of the scraper. It runs on your computer in the browser, but it uses a small local Node server so you do not need Python.

## What it does

- Paste any public Shopify store URL
- Try Shopify's public API first
- Fall back to crawling with Playwright if needed
- Export:
  - Excel file (`products.xlsx`)
  - CSV file (`products.csv`)
  - JSON file (`products.json`)
  - report file (`download_report.txt`)
  - product images

## Install

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run:

```bash
npm install
npx playwright install
npm start
```

4. Open the website at:

```text
http://localhost:3000
```

## Use

1. Paste a public Shopify store URL.
2. Choose whether to download images.
3. Click Start Scrape.
4. Download the files from the links shown in the page.

## Output

Files are saved in the local `output/` folder under a store-specific directory.

## Notes

- This is for public Shopify data only.
- Some stores may block crawling or limit public product fields.
- Excel export is generated as a real `.xlsx` file.

## Deploy On Vercel

This app is Vercel-ready with a serverless API at `/api/scrape` and static frontend from `public/`.

### Steps

1. Push `shopify_web_app` to a Git repository.
2. Import the repository in Vercel.
3. Set the project root to `shopify_web_app`.
4. Keep default build settings (Node runtime).
5. Deploy.

### Optional CLI deploy

```bash
npm i -g vercel
cd shopify_web_app
vercel
vercel --prod
```

### Important cloud behavior

- In Vercel mode, files are generated in memory and immediately downloaded in browser.
- Persistent server-side output folders are not used in Vercel serverless mode.
- Image downloading to server disk is disabled in cloud mode due serverless filesystem limits.
# Product-Scrapper
# Product-Scrapper
# Product-Scrapper
# Product-Scrapper
# Product-Scrapper
