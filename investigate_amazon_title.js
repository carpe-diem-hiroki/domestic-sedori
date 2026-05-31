const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

    console.log('Navigating to Amazon Japan TV search (grid layout)...');
    // カテゴリ/browseページ（スクショと同じ：テレビカテゴリ、グリッドレイアウト）
    await page.goto('https://www.amazon.co.jp/b/?node=2632478051', {
        waitUntil: 'load',
        timeout: 30000
    });
    // [data-asin]が現れるまで待機（最大15秒）
    await page.waitForSelector('[data-asin]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
        const TITLE_SELECTOR =
            "h2 .a-link-normal span, " +
            ".a-size-medium.a-color-base.a-text-normal, " +
            ".a-size-base-plus.a-color-base.a-text-normal, " +
            ".a-text-normal";

        const allAsin = Array.from(document.querySelectorAll('[data-asin]'));
        // component-typeを問わず、ASINが空でない要素全部（ネスト外側優先）
        const items = allAsin.filter(el => {
            const asin = el.getAttribute('data-asin');
            return asin && asin !== '';
        // ネストした[data-asin]の内側をスキップ（外側だけ取る）
        }).filter(el => !el.parentElement?.closest('[data-asin]'));

        return items.slice(0, 8).map((itemEl, idx) => {
            const asin = itemEl.getAttribute('data-asin');

            // 現在の実装と同じselector
            const titleEl = itemEl.querySelector(TITLE_SELECTOR);
            const capturedText = titleEl?.textContent?.trim().substring(0, 80) || '(none)';
            const capturedTag = titleEl?.tagName || '-';
            const capturedClass = titleEl?.className.substring(0, 100) || '-';

            // h2配下のspan（最も確実なタイトル）
            const h2span = itemEl.querySelector('h2 span');
            const h2spanText = h2span?.textContent?.trim().substring(0, 80) || '(none)';

            // 全 .a-text-normal の数とテキスト
            const allTextNormal = Array.from(itemEl.querySelectorAll('.a-text-normal')).map(el => ({
                tag: el.tagName,
                cls: el.className.substring(0, 80),
                text: el.textContent?.trim().substring(0, 60) || ''
            }));

            // 価格要素
            const priceEl = itemEl.querySelector('.a-price');
            const priceText = priceEl?.textContent?.trim().substring(0, 40) || '(none)';

            return {
                idx, asin,
                capturedText,
                capturedTag,
                capturedClass,
                h2spanText,
                priceText,
                allTextNormalCount: allTextNormal.length,
                allTextNormal: allTextNormal.slice(0, 5)
            };
        });
    });

    const pageInfo = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        total: document.querySelectorAll('[data-asin]').length,
        bodyLength: document.body.innerHTML.length,
        // グリッドレイアウト特有の要素があるか確認
        hasGridItem: !!document.querySelector('.s-card-container, .s-result-item, [class*="Grid"], [class*="grid"]'),
        sampleHtml: document.body.innerHTML.substring(0, 500)
    }));
    console.log(`URL: ${pageInfo.url}`);
    console.log(`Title: ${pageInfo.title}`);
    console.log(`Total [data-asin]: ${pageInfo.total}`);
    console.log(`Body length: ${pageInfo.bodyLength}`);
    console.log(`Has grid item: ${pageInfo.hasGridItem}`);
    console.log(`Sample HTML: ${pageInfo.sampleHtml}`);
    console.log('');
    console.log(`\n=== TITLE ELEMENT INVESTIGATION (${result.length} cards) ===\n`);
    result.forEach(item => {
        console.log(`--- Card ${item.idx + 1} (ASIN: ${item.asin}) ---`);
        console.log(`  [現在の実装] captured: <${item.capturedTag}> "${item.capturedText}"`);
        console.log(`  [現在の実装] class: "${item.capturedClass}"`);
        console.log(`  [h2 span]   text: "${item.h2spanText}"`);
        console.log(`  [price]     text: "${item.priceText}"`);
        console.log(`  [.a-text-normal count]: ${item.allTextNormalCount}`);
        item.allTextNormal.forEach((el, i) => {
            console.log(`    [${i}] <${el.tag}> class="${el.cls}" → "${el.text}"`);
        });
        console.log('');
    });

    await browser.close();
})();
