// Adapter that exports the scrape function from the existing testspec.js logic.
// We will require the testspec module and expose a function that accepts the Playwright 'page' if needed.
const original = require('../testspec');

module.exports = {
  runScrape: (query) => original.scrapeForTest ? original.scrapeForTest(query) : Promise.reject(new Error('scrapeForTest not found')),
};
