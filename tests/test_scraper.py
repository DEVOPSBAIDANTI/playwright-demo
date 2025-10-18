import json
import time
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

OUTPUT_FILE = Path(__file__).resolve().parents[1] / 'products.json'
REPORT_FILE = Path(__file__).resolve().parents[1] / 'report.html'

def scrape_python(query='laptop', max_products=6):
    results = []
    with sync_playwright() as p:
        browser = None
        launch_error = None
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            launch_error = e
            # Try falling back to system Chrome if available
            try:
                browser = p.chromium.launch(channel='chrome', headless=True)
            except Exception as e2:
                # Could not launch any browser; raise a descriptive error so pytest can handle/skip
                raise RuntimeError(f'Failed to launch Playwright browsers (bundled error: {launch_error}; channel chrome error: {e2})')
        context = browser.new_context(viewport={'width':1280,'height':900}, locale='en-IN')
        page = context.new_page()
        page.goto('https://www.amazon.in/', wait_until='load', timeout=60000)
        try:
            page.click('button:has-text("Allow essential and optional cookies")', timeout=3000)
        except:
            pass
        # search
        page.fill('input#twotabsearchtextbox', query)
        page.press('input#twotabsearchtextbox', 'Enter')
        page.wait_for_selector('[data-component-type="s-search-result"]', timeout=30000)
        handles = page.query_selector_all('[data-component-type="s-search-result"]')
        listing = []
        for h in handles[:max_products]:
            title = None
            for sel in ['h2 span','span.a-size-medium.a-color-base.a-text-normal','h2 a span']:
                try:
                    title = h.query_selector(sel).inner_text()
                    break
                except:
                    title = None
            link = None
            for sel in ['h2 a','a.a-link-normal.s-no-outline','a']:
                try:
                    link = h.query_selector(sel).get_attribute('href')
                    if link and link.startswith('/'):
                        link = 'https://www.amazon.in' + link
                    break
                except:
                    link = None
            price = None
            try:
                # Prefer whole+fraction structure, but fall back to offscreen/full text
                pw_el = h.query_selector('.a-price .a-price-whole') or h.query_selector('.a-price .a-offscreen')
                if pw_el:
                    price_whole = pw_el.inner_text().strip()
                    pf_el = h.query_selector('.a-price .a-price-fraction')
                    price_frac = pf_el.inner_text().strip() if pf_el else ''
                    price = price_whole + (price_frac or '')
                else:
                    off = h.query_selector('.a-price .a-offscreen') or h.query_selector('.a-offscreen')
                    price = off.inner_text().strip() if off else None
            except:
                price = None
            rating = None
            reviews = None
            try:
                rating = h.query_selector('.a-icon-alt').inner_text()
            except:
                rating = None
            try:
                reviews = h.query_selector('.a-size-base').inner_text()
            except:
                reviews = None
            asin = h.get_attribute('data-asin')
            listing.append({'title': title, 'link': link, 'price': price, 'rating': rating, 'reviews': reviews, 'asin': asin})

        for item in listing:
            if not item.get('link'):
                results.append({**item, 'error': 'no link', 'timestamp': datetime.utcnow().isoformat()})
                continue
            try:
                ppage = context.new_page()
                ppage.goto(item['link'], wait_until='load', timeout=60000)
                try:
                    full_title = ppage.query_selector('#productTitle').inner_text()
                except:
                    full_title = item.get('title')
                try:
                    # Try several possible product-page price selectors
                    price_el = None
                    for sel in ['#priceblock_ourprice', '#priceblock_dealprice', '#priceblock_saleprice', 'span.a-price .a-offscreen', '#corePriceDisplay_desktop_feature_div .a-offscreen', '.a-price .a-offscreen']:
                        try:
                            el = ppage.query_selector(sel)
                            if el:
                                price_el = el
                                break
                        except:
                            price_el = None
                    price = price_el.inner_text().strip() if price_el else item.get('price')
                except:
                    price = item.get('price')
                bullets = []
                try:
                    bullets = [li.inner_text().strip() for li in ppage.query_selector_all('#feature-bullets ul li')]
                except:
                    bullets = []
                asin_val = None
                try:
                    rows = ppage.query_selector_all('#productDetails_detailBullets_sections1 tr')
                    for r in rows:
                        th = r.query_selector('th')
                        td = r.query_selector('td')
                        if th and 'ASIN' in th.inner_text():
                            asin_val = td.inner_text().strip()
                            break
                except:
                    asin_val = None
                timestamp = datetime.utcnow().isoformat()
                results.append({'listing': item, 'fullTitle': full_title, 'price': price, 'bullets': bullets, 'asin': asin_val or item.get('asin'), 'timestamp': timestamp})
                ppage.close()
                time.sleep(0.9)
            except Exception as e:
                results.append({**item, 'error': str(e), 'timestamp': datetime.utcnow().isoformat()})

        browser.close()
    OUTPUT_FILE.write_text(json.dumps({'query': query, 'results': results}, indent=2), encoding='utf8')
    # generate simple report
    rows = []
    for idx, r in enumerate(results):
        title = (r.get('fullTitle') or r.get('listing', {}).get('title') or '—').replace('&', '&amp;').replace('<','&lt;')
        price = r.get('price') or r.get('listing', {}).get('price') or '—'
        rating = r.get('listing', {}).get('rating') or '—'
        reviews = r.get('listing', {}).get('reviews') or '—'
        asin = r.get('asin') or '—'
        ts = r.get('timestamp') or '—'
        link = r.get('listing', {}).get('link') or '—'
        rows.append(f"<tr><td>{idx+1}</td><td>{title}</td><td>{price}</td><td>{rating}</td><td>{reviews}</td><td>{asin}</td><td>{ts}</td><td><a href=\"{link}\">Open</a></td></tr>")
    html = f"<!doctype html><html><head><meta charset=\"utf-8\"><title>Scrape report - {query}</title></head><body><h1>Scrape report</h1><p>Query: <strong>{query}</strong></p><p>Products scraped: <strong>{len(results)}</strong></p><table><thead><tr><th>#</th><th>Title</th><th>Price</th><th>Rating</th><th>Reviews</th><th>ASIN</th><th>Scraped at</th><th>Link</th></tr></thead><tbody>{''.join(rows)}</tbody></table></body></html>"
    REPORT_FILE.write_text(html, encoding='utf8')
    return {'query': query, 'results': results}


def test_scraper_runs_and_writes_files():
    out = scrape_python('wireless mouse', max_products=6)
    assert Path('products.json').exists()
    data = json.loads(Path('products.json').read_text(encoding='utf8'))
    assert 'results' in data and isinstance(data['results'], list) and len(data['results']) > 0
