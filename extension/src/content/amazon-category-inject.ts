/**
 * Amazonカテゴリ/検索結果ページの商品一覧に Y!検索ボタンを注入
 *
 * 対象URL:
 *   https://www.amazon.co.jp/b/?node=...  （カテゴリ階層ページ）
 *   https://www.amazon.co.jp/s?k=...       （検索結果ページ）
 *
 * 動作:
 *   1. [data-asin] 要素を検出して商品タイトルを取得
 *   2. タイトルから型番を推定して「Y! 型番」ボタンを追加
 *   3. クリックでインラインミニパネルにヤフオク結果を表示
 *   4. MutationObserver で無限スクロール/遅延ロードにも対応
 */
import { searchYahoo, SearchResult } from "../utils/api-client";

/** タイトルから型番を推定 */
function extractKeyword(title: string): string {
    // 型番パターン: KJ-55X90K, BW-X90G, TH-32J300 など
    const match = title.match(/[A-Z]{1,4}[-]?\d{2,5}[A-Z]{0,3}\d{0,4}[A-Z]?(?:[-]\d+)?/i);
    if (match) return match[0];
    // マッチしなければ先頭3ワード
    return title.split(/\s+/).slice(0, 3).join(" ");
}

function formatPrice(price: number | null): string {
    if (price === null) return "-";
    return `¥${price.toLocaleString()}`;
}

function renderMiniResults(panel: HTMLDivElement, results: SearchResult[]) {
    if (results.length === 0) {
        panel.innerHTML = `<div class="sedori-mini-empty">ヤフオクに出品なし</div>`;
        return;
    }

    const items = results
        .slice(0, 5)
        .map(
            (r) => `
        <div class="sedori-mini-item">
            <a href="${r.url}" target="_blank" class="sedori-mini-title">${r.title.slice(0, 50)}</a>
            <div class="sedori-mini-meta">
                <span class="sedori-mini-price">${formatPrice(r.current_price)}</span>
                ${r.buy_now_price ? `<span class="sedori-mini-buynow">即決:${formatPrice(r.buy_now_price)}</span>` : ""}
                <span class="sedori-mini-time">${r.end_time_text || ""}</span>
                <span>入札:${r.bid_count ?? 0}</span>
            </div>
        </div>`
        )
        .join("");

    panel.innerHTML = `
        <div class="sedori-mini-header">
            <span>ヤフオク ${results.length}件</span>
            <button class="sedori-mini-close" title="閉じる">×</button>
        </div>
        <div class="sedori-mini-items">${items}</div>`;

    panel.querySelector(".sedori-mini-close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        panel.style.display = "none";
    });
}

/** 1つの商品カードにボタン+パネルを注入 */
function injectIntoItem(itemEl: Element) {
    const asin = itemEl.getAttribute("data-asin");
    if (!asin || asin === "") return;

    // 既に注入済みならスキップ
    if (itemEl.querySelector(".sedori-cat-btn")) return;

    // タイトル要素を取得（複数セレクターで広くカバー）
    const titleEl = itemEl.querySelector<HTMLElement>(
        "h2 .a-link-normal span, " +
        ".a-size-medium.a-color-base.a-text-normal, " +
        ".a-size-base-plus.a-color-base.a-text-normal, " +
        ".a-size-mini .a-link-normal .a-text-normal, " +
        ".a-text-normal"
    );
    const title = titleEl?.textContent?.trim() || "";
    if (!title) return;

    const keyword = extractKeyword(title);

    // ボタン
    const btn = document.createElement("button");
    btn.className = "sedori-cat-btn";
    btn.textContent = `Y! ${keyword}`;
    btn.title = `ヤフオクで「${keyword}」を検索`;

    // ミニパネル
    const panel = document.createElement("div");
    panel.className = "sedori-mini-panel";
    panel.style.display = "none";

    // ラッパー
    const wrapper = document.createElement("div");
    wrapper.className = "sedori-cat-wrapper";
    wrapper.appendChild(btn);
    wrapper.appendChild(panel);

    // 価格の下、またはタイトルの親に挿入
    const priceRow =
        itemEl.querySelector(".a-price")?.closest(".a-row") ||
        itemEl.querySelector(".a-price")?.parentElement;
    const insertAfter = priceRow || titleEl?.closest(".a-row") || titleEl?.parentElement;

    if (insertAfter && insertAfter.parentElement) {
        insertAfter.parentElement.insertBefore(wrapper, insertAfter.nextSibling);
    } else {
        // フォールバック：直接 itemEl に追加
        itemEl.appendChild(wrapper);
    }

    // クリックで検索
    btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // トグル
        if (panel.style.display !== "none") {
            panel.style.display = "none";
            return;
        }

        btn.disabled = true;
        btn.textContent = "検索中...";
        panel.style.display = "block";
        panel.innerHTML = `<div class="sedori-mini-loading">ヤフオクを検索中...</div>`;

        try {
            const results = await searchYahoo(keyword);
            renderMiniResults(panel, results);
        } catch {
            panel.innerHTML = `<div class="sedori-mini-error">エラー: バックエンド未起動？</div>`;
        } finally {
            btn.disabled = false;
            btn.textContent = `Y! ${keyword}`;
        }
    });
}

/** ページ内の全商品に注入 */
function injectAll() {
    document.querySelectorAll("[data-asin]").forEach(injectIntoItem);
}

// 初回実行
const found = document.querySelectorAll("[data-asin]").length;
console.log(`[Sedori] amazon-category-inject: loaded. data-asin elements=${found}, url=${location.href}`);
injectAll();

// 無限スクロール・遅延ロードに対応
const observer = new MutationObserver(() => injectAll());
observer.observe(document.body, { childList: true, subtree: true });
