const { test, expect } = require('@playwright/test');
const { scrapeForTest } = require('../testspec');

test.describe('scraper output', () => {
  test('scrapes results and writes JSON', async () => {
    // Run the scraper with a short maxProducts to keep tests fast
    await scrapeForTest('wireless mouse', { maxProducts: 6 });

    const fs = require('fs');
    const path = require('path');
    const file = path.resolve(__dirname, '../products.json');
    expect(fs.existsSync(file)).toBeTruthy();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(Array.isArray(data.results)).toBeTruthy();
    expect(data.results.length).toBeGreaterThan(0);

    // unit-style checks on result structure
    for (const r of data.results) {
      // must have listing and timestamp
      expect(r.listing).toBeTruthy();
      expect(r.timestamp).toBeTruthy();
      // title or fullTitle must be present
      const titlePresent = Boolean(r.listing.title || r.fullTitle);
      expect(titlePresent).toBeTruthy();
      // price should be string or null
      expect(typeof r.price === 'string' || r.price === null).toBeTruthy();
      // bullets should be an array
      expect(Array.isArray(r.bullets)).toBeTruthy();
      // asin if present should be non-empty string
      if (r.asin) expect(typeof r.asin).toBe('string');
    }
  });

  test('report.html contains expected elements', async () => {
    const fs = require('fs');
    const path = require('path');
    const report = path.resolve(__dirname, '../report.html');
    expect(fs.existsSync(report)).toBeTruthy();
    const html = fs.readFileSync(report, 'utf8');
    // contains query and table
    expect(html).toContain('Scrape report');
    expect(html).toContain('<table>');
    // number of <tr> in tbody should match results length
    const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../products.json'), 'utf8'));
    const tbodyMatches = html.match(/<tbody>[\s\S]*?<\/tbody>/);
    expect(tbodyMatches).toBeTruthy();
    const tbody = tbodyMatches[0];
    const rows = tbody.match(/<tr>/g) || [];
    expect(rows.length).toBe(data.results.length);
  });
});
