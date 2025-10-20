module.exports = { googleflow };

async function googleflow(page) {
    console.log('[flow.js] googleflow called');
    await page.goto('https://www.google.com/');
    await page.locator("xpath=//a[text()='About']").click();
}