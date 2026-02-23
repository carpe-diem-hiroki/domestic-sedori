/**
 * Amazon商品ページにY!検索ボタンと結果パネルを注入
 *
 * 動作:
 * 1. ページからASIN・型番・タイトルを自動抽出
 * 2. 「Y!検索」ボタンを商品画像の下に表示
 * 3. クリックでバックエンドAPIを叩きヤフオク検索
 * 4. 結果を同ページ内のパネルに表示
 * 5. 各結果に「監視対象に追加」ボタン
 */
import { searchYahoo, SearchResult } from "../utils/api-client";
import {
    extractAsin,
    extractModelNumber,
    extractProductTitle,
} from "../utils/extractors";

const DASHBOARD_URL = "http://localhost:5173";

function createSearchButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = "sedori-yahoo-search-btn";
    btn.className = "sedori-btn sedori-btn-primary";
    btn.textContent = "Y!検索";
    return btn;
}

function createResultPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.id = "sedori-result-panel";
    panel.className = "sedori-panel";
    panel.style.display = "none";
    return panel;
}

function formatPrice(price: number | null): string {
    if (price === null) return "-";
    return `${price.toLocaleString()}円`;
}

function renderResults(
    panel: HTMLDivElement,
    results: SearchResult[],
    asin: string,
    productTitle: string
) {
    if (results.length === 0) {
        panel.innerHTML = `<div class="sedori-empty">検索結果がありません</div>`;
        return;
    }

    const header = `<div class="sedori-panel-header">
    <span>ヤフオク検索結果: ${results.length}件</span>
    <a href="${DASHBOARD_URL}/research?asin=${asin}" target="_blank" class="sedori-link">ダッシュボードで見る</a>
  </div>`;

    const items = results
        .slice(0, 10)
        .map(
            (r) => `
    <div class="sedori-item">
      <div class="sedori-item-img">
        ${r.image_url ? `<img src="${r.image_url}" alt="" />` : ""}
      </div>
      <div class="sedori-item-info">
        <a href="${r.url}" target="_blank" class="sedori-item-title">${r.title}</a>
        <div class="sedori-item-meta">
          <span class="sedori-price">現在: ${formatPrice(r.current_price)}</span>
          ${r.buy_now_price ? `<span class="sedori-price-buynow">即決: ${formatPrice(r.buy_now_price)}</span>` : ""}
          <span>残り: ${r.end_time_text || "-"}</span>
          <span>入札: ${r.bid_count ?? 0}</span>
        </div>
      </div>
      <button class="sedori-btn sedori-btn-add" data-auction-id="${r.auction_id}" data-title="${r.title.replace(/"/g, "&quot;")}" data-price="${r.current_price || ""}" data-buynow="${r.buy_now_price || ""}" data-url="${r.url}">
        監視追加
      </button>
    </div>`
        )
        .join("");

    panel.innerHTML = header + `<div class="sedori-items">${items}</div>`;

    // 監視追加ボタンのイベント
    panel.querySelectorAll(".sedori-btn-add").forEach((btn) => {
        btn.addEventListener("click", () => {
            const el = btn as HTMLButtonElement;
            const auctionId = el.dataset.auctionId || "";
            const title = el.dataset.title || "";
            const price = el.dataset.price || "";
            const buynow = el.dataset.buynow || "";
            const url = el.dataset.url || "";

            // ダッシュボードの監視追加画面に遷移
            const params = new URLSearchParams({
                asin,
                product_title: productTitle,
                auction_id: auctionId,
                auction_title: title,
                current_price: price,
                buy_now_price: buynow,
                url,
            });
            window.open(`${DASHBOARD_URL}/monitor/add?${params}`, "_blank");
        });
    });
}

async function init() {
    const asin = extractAsin();
    if (!asin) return;

    const title = extractProductTitle();
    const modelNumber = extractModelNumber();

    // ボタンとパネルを注入
    const target =
        document.getElementById("imageBlock") ||
        document.getElementById("leftCol") ||
        document.getElementById("dp-container");
    if (!target) return;

    const btn = createSearchButton();
    const panel = createResultPanel();

    // ボタンにキーワード情報を表示
    const keyword = modelNumber || title.split(/\s+/).slice(0, 3).join(" ");
    btn.textContent = `Y!検索: ${keyword}`;
    btn.title = `ヤフオクで「${keyword}」を検索`;

    target.appendChild(btn);
    target.appendChild(panel);

    // 検索実行
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "検索中...";
        panel.style.display = "block";
        panel.innerHTML = `<div class="sedori-loading">ヤフオクを検索中...</div>`;

        try {
            const results = await searchYahoo(keyword);
            renderResults(panel, results, asin, title);
        } catch (err) {
            panel.innerHTML = `<div class="sedori-error">
        エラー: バックエンドに接続できません。<br>
        <code>uvicorn app.main:app</code> が起動しているか確認してください。
      </div>`;
            console.error("Sedori search error:", err);
        } finally {
            btn.disabled = false;
            btn.textContent = `Y!検索: ${keyword}`;
        }
    });
}

init();
