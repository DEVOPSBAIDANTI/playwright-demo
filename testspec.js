const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Configuration
const SEARCH_QUERY = process.argv[2] || 'laptop';
const MAX_PRODUCTS = 8; // number of listing items to collect
const OUTPUT_FILE = path.resolve(__dirname, 'products.json');

async function scrape(options = {}) {
  const { query = SEARCH_QUERY, externalBrowser = null, maxProducts = MAX_PRODUCTS } = options;
  const useSystemChrome = process.env.USE_SYSTEM_CHROME === '1';
  console.log(`Launching browser (useSystemChrome=${useSystemChrome})`);
  const launchOptions = useSystemChrome ? { channel: 'chrome', headless: true } : { headless: true };
  const browser = externalBrowser || await chromium.launch(launchOptions);
  const context = externalBrowser ? await browser.newContext() : await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-IN',
  });

  const page = await context.newPage();

  // Navigate to Amazon India
  console.log('Opening amazon.in');
  await page.goto('https://www.amazon.in/', { waitUntil: 'load', timeout: 60000 });

  // Accept any cookie / dismiss popups if present (best-effort)
  try {
    await page.locator('button:has-text("Allow essential and optional cookies")').click({ timeout: 3000 });
  } catch (e) {}
  try {
    await page.locator('input#twotabsearchtextbox').waitFor({ timeout: 5000 });
  } catch (e) {
    // fallback: try another selector
  }

  // Type in the search box and submit
  const searchBox = await page.locator('input#twotabsearchtextbox');
  await searchBox.fill(SEARCH_QUERY);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
    searchBox.press('Enter'),
  ]);

  console.log(`Searching for "${SEARCH_QUERY}"`);

  // Wait for results to appear
  await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 30000 });

  // Collect listing items
  const productHandles = await page.$$('[data-component-type="s-search-result"]');
  const listing = [];

  for (let i = 0; i < Math.min(productHandles.length, maxProducts); i++) {
    const el = productHandles[i];
    // Fallback selectors for title
    const title = await el.$eval('h2 span', node => node.innerText).catch(() => null)
      || await el.$eval('span.a-size-medium.a-color-base.a-text-normal', n => n.innerText).catch(() => null)
      || await el.$eval('h2 a span', n => n.innerText).catch(() => null);
    // Fallback selectors for link (prefer the product link)
    const link = await el.$eval('h2 a', a => a.href).catch(() => null)
      || await el.$eval('a.a-link-normal.s-no-outline', a => a.href).catch(() => null)
      || await el.$eval('a', a => a.href).catch(() => null);
    const priceWhole = await el.$eval('.a-price .a-price-whole', n => n.innerText).catch(() => null);
    const priceFraction = await el.$eval('.a-price .a-price-fraction', n => n.innerText).catch(() => null);
    const price = priceWhole ? (priceWhole + (priceFraction || '')) : null;
    const rating = await el.$eval('.a-icon-alt', n => n.innerText).catch(() => null);
    const reviews = await el.$eval('.a-size-base', n => n.innerText).catch(() => null);
    // Try to get ASIN from data-asin attribute on the container or link
    const asin = await el.evaluate(node => node.getAttribute('data-asin')).catch(() => null) || null;

    listing.push({ title, link, price, rating, reviews, asin });
  }

  console.log(`Collected ${listing.length} listing items. Visiting product pages for details...`);

  // Visit each product page and scrape additional details
  const results = [];
  for (const item of listing) {
    if (!item.link) {
      results.push({ ...item, error: 'no link', timestamp: new Date().toISOString() });
      continue;
    }

    try {
      const prodPage = await context.newPage();
      await prodPage.goto(item.link, { waitUntil: 'load', timeout: 60000 });
      // Wait for product title selector
      await prodPage.waitForSelector('#productTitle, #title', { timeout: 15000 }).catch(() => {});

      const fullTitle = await prodPage.$eval('#productTitle', n => n.innerText).catch(() => item.title);
      const price = await prodPage.$eval('#priceblock_ourprice, #priceblock_dealprice', n => n.innerText).catch(() => item.price);
      const bullets = await prodPage.$$eval('#feature-bullets ul li', nodes => nodes.map(n => n.innerText.trim())).catch(() => []);
      //const description = await prodPage.$eval('#productDescription', n => n.innerText).catch(() => null);
      const asin = await prodPage.$$eval('#productDetails_detailBullets_sections1 tr', rows => {
        for (const r of rows) {
          const key = r.querySelector('th')?.innerText?.trim();
          const val = r.querySelector('td')?.innerText?.trim();
          if (key && key.toLowerCase().includes('asin')) return val;
        }
        return null;
      }).catch(() => null);
      // add a timestamp for when this product was scraped
      const timestamp = new Date().toISOString();

      results.push({
        listing: item,
        fullTitle,
        price,
        bullets,
        asin: asin || item.asin || null,
        timestamp,
      });

      await prodPage.close();

      // Throttle: small random delay between requests to reduce server throttling
      const delayMs = 800 + Math.floor(Math.random() * 700); // 800-1500ms
      await new Promise(res => setTimeout(res, delayMs));
    } catch (err) {
      console.error('Error scraping product', item.link, err.message || err);
      results.push({ ...item, error: String(err), timestamp: new Date().toISOString() });
    }
  }

  // Basic assertions to ensure scraping succeeded
  const assert = require('assert');
  // At least one product
  assert.ok(results.length > 0, 'No products were scraped');
  // At least one product should have a title or link
  const hasTitleOrLink = results.some(r => (r.listing && (r.listing.title || r.listing.link)) || r.fullTitle || r.listing?.link);
  assert.ok(hasTitleOrLink, 'No product has a title or link — selectors may need adjustment');

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ query: query, results }, null, 2), 'utf8');
  console.log(`Saved ${results.length} product entries to ${OUTPUT_FILE}`);

  // Generate a simple HTML report
  try {
    const reportPath = path.resolve(__dirname, 'report.html');
    const rows = results
      .map((r, idx) => {
        const title = (r.fullTitle || r.listing?.title || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const price = r.price || r.listing?.price || '—';
        const rating = r.listing?.rating || r.rating || '—';
        const reviews = r.listing?.reviews || '—';
        const link = r.listing?.link ? `<a href="${r.listing.link}" target="_blank">Open</a>` : '—';
        const asin = r.asin || '—';
        const bullets = (r.bullets && r.bullets.length) ? ('<ul>' + r.bullets.map(b => `<li>${b.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</li>`).join('') + '</ul>') : '—';
        const ts = r.timestamp || '—';
        return `<tr><td>${idx + 1}</td><td>${title}</td><td>${price}</td><td>${rating}</td><td>${reviews}</td><td>${asin}</td><td>${ts}</td><td>${link}</td></tr>`;
      })
      .join('\n');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Scrape report - ${query}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px }
    table { border-collapse: collapse; width: 100% }
    th, td { border: 1px solid #ddd; padding: 8px }
    th { background: #f5f5f5 }
    tr:nth-child(even){ background: #fafafa }
    a { color: #1a0dab }
  </style>
</head>
<body>
  <h1>Scrape report</h1>
  <p>Query: <strong>${query}</strong></p>
  <p>Products scraped: <strong>${results.length}</strong></p>
  <table>
    <thead><tr><th>#</th><th>Title</th><th>Price</th><th>Rating</th><th>Reviews</th><th>ASIN</th><th>Scraped at</th><th>Link</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

    fs.writeFileSync(reportPath, html, 'utf8');
    console.log(`HTML report written to ${reportPath}`);
  } catch (err) {
    console.error('Failed to write HTML report:', err);
  }

  await browser.close();
}

// Run inside a test-style describe/test block. If a test runner provides globals, use them;
// otherwise provide lightweight fallbacks so the file can be executed directly.
if (typeof global.describe !== 'function') {
  global.describe = (name, fn) => {
    console.log(`describe: ${name}`);
    try {
      fn();
    } catch (e) {
      console.error('Error in describe block:', e);
    }
  };
}
if (typeof global.test !== 'function') {
  global.test = (name, fn) => {
    console.log(`test: ${name}`);
    try {
      const res = fn();
      if (res && typeof res.then === 'function') return res;
      return Promise.resolve(res);
    } catch (e) {
      return Promise.reject(e);
    }
  };
}

// Exported function for Playwright Test to call directly
async function scrapeForTest(query, options = {}) {
  return scrape({ ...options, query });
}

module.exports = { scrapeForTest };

// If run directly from the CLI, execute scrape() with defaults
if (require.main === module) {
  // Run inside a test-style describe/test block. If a test runner provides globals, use them;
  // otherwise provide lightweight fallbacks so the file can be executed directly.
  if (typeof global.describe !== 'function') {
    global.describe = (name, fn) => {
      console.log(`describe: ${name}`);
      try {
        fn();
      } catch (e) {
        console.error('Error in describe block:', e);
      }
    };
  }
  if (typeof global.test !== 'function') {
    global.test = (name, fn) => {
      console.log(`test: ${name}`);
      try {
        const res = fn();
        if (res && typeof res.then === 'function') return res;
        return Promise.resolve(res);
      } catch (e) {
        return Promise.reject(e);
      }
    };
  }

  describe('Amazon scraper', () => {
    test('should scrape products for query', async () => {
      try {
        await scrape();
      } catch (err) {
        console.error('Fatal error in scraper:', err);
        process.exit(1);
      }
    });
  });
}

