/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: 'tests',
  timeout: 180000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    locale: 'en-IN',
  },
};
