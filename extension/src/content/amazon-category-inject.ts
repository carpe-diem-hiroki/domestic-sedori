/**
 * Amazonカテゴリ/検索結果ページ - 全商品を自動Y!検索
 *
 * バグ修正:
 *   1. closest() を廃止 → parentElement のみ使用（itemEl の外に出ない）
 *   2. ネストした [data-asin] の外側ラッパーをスキップ
 *   3. MutationObserver に debounce を適用、processQueue は injectAll から1回だけ呼ぶ
 */
import { searchYahoo, SearchResult } from "../utils/api-client";

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 400;
const OBSERVER_DEBOUNCE_MS = 500;

function extractKeyword(title: string): string {
    const match = title.match(/[A-Z]{1,4}[-]?\d{2,5}[A-Z]{0,3}\d{0,4}[A-Z]?(?:[-]\d+)?/i);
    if (match) return match[0];
    return title.split(/\s+/).slice(0, 3).join(" ");
}

function formatPrice(price: number | null): string {
    if (price === null) return "-";
    return `¥${price.toLocaleString()}`;
}

function renderMiniResults(panel: HTMLDivElement, results: SearchResult[]) {
    if (results.length === 0) {
        panel.innerHTML = `<div class="sedori-mini-empty">出品なし</div>`;
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
        </div>
        <div class="sedori-mini-items">${items}</div>`;
}

// ===== キュー =====

interface QueueItem {
    keyword: string;
    panel: HTMLDivElement;
}
const searchQueue: QueueItem[] = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;
    while (searchQueue.length > 0) {
        const batch = searchQueue.splice(0, CONCURRENCY);
        batch.forEach((item) => {
            item.panel.innerHTML = `<div class="sedori-mini-loading">検索中...</div>`;
        });
        await Promise.all(
            batch.map(async (item) => {
                try {
                    const results = await searchYahoo(item.keyword);
                    renderMiniResults(item.panel, results);
                } catch {
                    item.panel.innerHTML = `<div class="sedori-mini-error">エラー</div>`;
                }
            })
        );
        if (searchQueue.length > 0) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
    }
    isProcessing = false;
}

// ===== DOM 注入 =====

function injectIntoItem(itemEl: Element) {
    const asin = itemEl.getAttribute("data-asin");
    if (!asin || asin === "") return;

    // 注入済みスキップ（べき等保証）
    // ※ querySelectorAll("[data-asin]") は外側ラッパーと内側カードの両方にマッチするが、
    //   最初に処理された側が wrapper を挿入すると、もう片方の querySelector で発見されるため
    //   自然にスキップされる
    if (itemEl.querySelector(".sedori-cat-wrapper")) return;

    const titleEl = itemEl.querySelector<HTMLElement>(
        "h2 .a-link-normal span, " +
        ".a-size-medium.a-color-base.a-text-normal, " +
        ".a-size-base-plus.a-color-base.a-text-normal, " +
        ".a-text-normal"
    );
    const title = titleEl?.textContent?.trim() || "";
    if (!title) return;

    const keyword = extractKeyword(title);

    const wrapper = document.createElement("div");
    wrapper.className = "sedori-cat-wrapper";

    const label = document.createElement("div");
    label.className = "sedori-cat-label";
    label.textContent = `Y!: ${keyword}`;

    const panel = document.createElement("div");
    panel.className = "sedori-mini-panel";
    panel.innerHTML = `<div class="sedori-mini-waiting">待機中...</div>`;

    wrapper.appendChild(label);
    wrapper.appendChild(panel);

    // Fix 1: closest() を使わず parentElement のみ使用
    // querySelector で見つかった要素の parentElement は必ず itemEl の子孫
    const priceEl = itemEl.querySelector(".a-price");
    const insertTarget = priceEl?.parentElement ?? titleEl?.parentElement ?? null;

    if (insertTarget && insertTarget.parentElement) {
        insertTarget.parentElement.insertBefore(wrapper, insertTarget.nextSibling);
    } else {
        itemEl.appendChild(wrapper);
    }

    // キューに追加（processQueue は injectAll から一括で呼ぶ）
    searchQueue.push({ keyword, panel });
}

function injectAll() {
    document.querySelectorAll("[data-asin]").forEach(injectIntoItem);
    // Fix 3: processQueue は injectAll の末尾で1回だけ
    if (searchQueue.length > 0) {
        processQueue();
    }
}

// Fix 3: debounce で MutationObserver の過剰発火を抑制
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const observer = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        injectAll();
    }, OBSERVER_DEBOUNCE_MS);
});

// 初回実行
console.log(`[Sedori] amazon-category-inject: loaded. url=${location.href}`);
injectAll();

// DOM変化の監視開始
observer.observe(document.body, { childList: true, subtree: true });
