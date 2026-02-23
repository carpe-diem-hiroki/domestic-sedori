/**
 * Amazon / ヤフオクページからデータを抽出
 */

/** AmazonページからASINを抽出 */
export function extractAsin(): string | null {
    // URLから: /dp/B09XYDQZV6 or /gp/product/B09XYDQZV6
    const match = window.location.pathname.match(
        /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/
    );
    if (match) return match[1];

    // meta tagから
    const meta = document.querySelector('input[name="ASIN"]') as HTMLInputElement;
    if (meta) return meta.value;

    return null;
}

/** Amazon商品タイトルを取得 */
export function extractProductTitle(): string {
    const el = document.getElementById("productTitle");
    return el?.textContent?.trim() || "";
}

/** Amazon商品ページから型番を抽出 */
export function extractModelNumber(): string | null {
    // 商品情報テーブルから「型番」「モデル番号」を探す
    const rows = document.querySelectorAll(
        "#productDetails_techSpec_section_1 tr, #detailBullets_feature_div li, table.prodDetTable tr"
    );

    for (const row of rows) {
        const text = row.textContent || "";
        if (/型番|モデル番号|Model|Part Number/i.test(text)) {
            // th/tdパターン
            const td = row.querySelector("td");
            if (td) return td.textContent?.trim() || null;

            // span:nth-child(2)パターン（detailBullets）
            const spans = row.querySelectorAll("span span");
            if (spans.length >= 2) return spans[1].textContent?.trim() || null;
        }
    }

    // タイトルから型番パターンを推定（例: TH-32J300, KJ-55X80K）
    const title = extractProductTitle();
    const modelMatch = title.match(
        /[A-Z]{1,4}[-]?\d{2,5}[A-Z]?\d{0,4}[A-Z]?/i
    );
    return modelMatch ? modelMatch[0] : null;
}

/** ヤフオクページからオークションIDを抽出 */
export function extractAuctionId(): string | null {
    const match = window.location.pathname.match(
        /\/auction\/([a-zA-Z0-9]+)/
    );
    return match ? match[1] : null;
}

/** ヤフオクページからタイトルを取得 */
export function extractAuctionTitle(): string {
    const h1 = document.querySelector("h1");
    return h1?.textContent?.trim() || "";
}

/** ヤフオクページから現在価格を取得 */
export function extractCurrentPrice(): number | null {
    const dls = document.querySelectorAll("dl");
    for (const dl of dls) {
        const text = dl.textContent || "";
        if (text.startsWith("現在") || text.startsWith("即決")) {
            const match = text.match(/([\d,]+)円/);
            if (match) return parseInt(match[1].replace(/,/g, ""), 10);
        }
    }
    return null;
}
