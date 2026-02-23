/**
 * ヤフオク商品ページに「監視対象に追加する」ボタンを注入
 *
 * 動作:
 * 1. ページからオークションID・タイトル・価格を抽出
 * 2. 「監視対象に追加する」ボタンを表示
 * 3. クリックでダッシュボードの監視追加画面に遷移
 *    → ASINの入力を促す（紐づけ先のAmazon商品を指定）
 */
import {
    extractAuctionId,
    extractAuctionTitle,
    extractCurrentPrice,
} from "../utils/extractors";

const DASHBOARD_URL = "http://localhost:5173";

function createMonitorButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = "sedori-monitor-btn";
    btn.className = "sedori-btn sedori-btn-monitor";
    btn.textContent = "監視対象に追加する";
    return btn;
}

function init() {
    const auctionId = extractAuctionId();
    if (!auctionId) return;

    const title = extractAuctionTitle();
    const price = extractCurrentPrice();

    // ボタンを注入 - h1の下に配置
    const h1 = document.querySelector("h1");
    if (!h1 || !h1.parentElement) return;

    const btn = createMonitorButton();
    h1.parentElement.insertBefore(btn, h1.nextSibling);

    btn.addEventListener("click", () => {
        const params = new URLSearchParams({
            auction_id: auctionId,
            auction_title: title,
            current_price: price?.toString() || "",
            url: window.location.href,
        });
        // ダッシュボードの監視追加画面に遷移（ASIN入力を促す）
        window.open(`${DASHBOARD_URL}/monitor/add?${params}`, "_blank");
    });
}

init();
