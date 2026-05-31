/**
 * Amazonカテゴリ/検索結果ページ - 全商品を自動Y!検索
 * ホバーで写真スライドショー＋商品詳細表示
 */
import { searchYahoo, SearchResult, getDetail, AuctionDetail, checkBackendHealth, isBackendDownError } from "../utils/api-client";

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 400;
const OBSERVER_DEBOUNCE_MS = 500;

// 利益計算（価格差自動検出）のパラメータ
const PROFIT_FEE_RATE = 0.15;     // Amazon手数料率（カテゴリ不明なので既定15%）
const PROFIT_SHIPPING = 800;      // 送料の概算
const CHANCE_MIN_RATE = 15;       // この利益率(%)以上を「チャンス」として強調

interface ProfitCalc {
    profit: number;
    rate: number;
}

/** Amazon売値とヤフオク価格から想定利益・利益率を計算 */
function computeProfit(amazonPrice: number | null, yahooPrice: number | null): ProfitCalc | null {
    if (!amazonPrice || !yahooPrice) return null;
    const fee = Math.round(amazonPrice * PROFIT_FEE_RATE);
    const profit = amazonPrice - yahooPrice - fee - PROFIT_SHIPPING;
    const rate = amazonPrice > 0 ? Math.round((profit / amazonPrice) * 100) : 0;
    return { profit, rate };
}

/** Amazon商品カードの価格表示から数値を抽出（"￥15,800" → 15800） */
function parseAmazonPrice(itemEl: Element): number | null {
    const offscreen = itemEl.querySelector(".a-price .a-offscreen");
    const text = offscreen?.textContent || itemEl.querySelector(".a-price")?.textContent || "";
    const m = text.replace(/[￥¥,]/g, "").match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}

// バックエンド状態キャッシュ（30秒TTL）
let backendStatus: { available: boolean; checkedAt: number } | null = null;

async function isBackendAvailable(): Promise<boolean> {
    const now = Date.now();
    if (backendStatus && now - backendStatus.checkedAt < 30_000) {
        return backendStatus.available;
    }
    const available = await checkBackendHealth();
    backendStatus = { available, checkedAt: now };
    return available;
}

function extractKeyword(title: string): string {
    // モデル番号を優先（例: WH-1000XM5, RTX3090, A-67161）
    const match = title.match(/[A-Z]{1,4}[-]?\d{2,5}[A-Z]{0,3}\d{0,4}[A-Z]?(?:[-]\d+)?/i);
    if (match) return match[0];
    // スペース（全角・半角）で分割して最初の3語、40文字上限
    const words = title.split(/[\s　]+/).filter(w => w.length > 0);
    const keyword = words.slice(0, 3).join(" ").slice(0, 40);
    return keyword || title.slice(0, 20);
}

function formatPrice(price: number | null): string {
    if (price === null) return "-";
    return `¥${price.toLocaleString()}`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ===== ホバー詳細ポップアップ =====

const detailCache = new Map<string, AuctionDetail>();
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let popupEl: HTMLDivElement | null = null;
let currentImages: string[] = [];
let currentImgIdx = 0;

function getOrCreatePopup(): HTMLDivElement {
    if (popupEl) return popupEl;
    popupEl = document.createElement("div");
    popupEl.className = "sedori-detail-popup";
    popupEl.innerHTML = `
        <div class="sedori-popup-gallery">
            <img class="sedori-popup-img" src="" alt="" />
            <button class="sedori-popup-prev">&#8249;</button>
            <button class="sedori-popup-next">&#8250;</button>
            <span class="sedori-popup-count"></span>
        </div>
        <div class="sedori-popup-info"></div>`;
    document.body.appendChild(popupEl);

    popupEl.querySelector(".sedori-popup-prev")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!currentImages.length) return;
        currentImgIdx = (currentImgIdx - 1 + currentImages.length) % currentImages.length;
        refreshGallery();
    });
    popupEl.querySelector(".sedori-popup-next")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!currentImages.length) return;
        currentImgIdx = (currentImgIdx + 1) % currentImages.length;
        refreshGallery();
    });
    popupEl.addEventListener("mouseenter", () => {
        if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
    });
    popupEl.addEventListener("mouseleave", () => scheduleHide());
    return popupEl;
}

function refreshGallery() {
    if (!popupEl) return;
    const img = popupEl.querySelector<HTMLImageElement>(".sedori-popup-img")!;
    const count = popupEl.querySelector<HTMLElement>(".sedori-popup-count")!;
    const prev = popupEl.querySelector<HTMLButtonElement>(".sedori-popup-prev")!;
    const next = popupEl.querySelector<HTMLButtonElement>(".sedori-popup-next")!;
    img.src = currentImages[currentImgIdx] || "";
    count.textContent = currentImages.length > 1 ? `${currentImgIdx + 1} / ${currentImages.length}` : "";
    prev.style.display = currentImages.length > 1 ? "" : "none";
    next.style.display = currentImages.length > 1 ? "" : "none";
}

function positionPopup(anchorEl: HTMLElement) {
    const popup = getOrCreatePopup();
    const rect = anchorEl.getBoundingClientRect();
    const popupW = 300;
    const popupH = 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 水平: アンカーの左端に合わせる（はみ出る場合は右端基準）
    let left = rect.left;
    if (left + popupW > vw - 8) left = vw - popupW - 8;
    if (left < 8) left = 8;

    // 垂直: アンカーの下に表示、下がはみ出る場合は上に表示
    let top = rect.bottom + 4;
    if (top + popupH > vh - 8) top = rect.top - popupH - 4;
    if (top < 8) top = 8;

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
}

function showPopupLoading(anchorEl: HTMLElement) {
    const popup = getOrCreatePopup();
    currentImages = [];
    currentImgIdx = 0;
    refreshGallery();
    popup.querySelector<HTMLElement>(".sedori-popup-info")!.innerHTML =
        `<div class="sedori-popup-loading">読み込み中...</div>`;
    positionPopup(anchorEl);
    popup.style.display = "flex";
}

function showPopupContent(detail: AuctionDetail) {
    const popup = getOrCreatePopup();
    if (popup.style.display !== "flex") return;
    currentImages = detail.image_urls;
    currentImgIdx = 0;
    refreshGallery();

    const rows = [
        detail.condition    ? `<tr><td>状態</td><td>${escapeHtml(detail.condition)}</td></tr>` : "",
        detail.shipping_info? `<tr><td>送料</td><td>${escapeHtml(detail.shipping_info)}</td></tr>` : "",
        detail.brand        ? `<tr><td>ブランド</td><td>${escapeHtml(detail.brand)}</td></tr>` : "",
        (detail.seller_name || detail.seller_id)
            ? `<tr><td>出品者</td><td>${escapeHtml(detail.seller_name || detail.seller_id || "")}</td></tr>` : "",
    ].join("");

    popup.querySelector<HTMLElement>(".sedori-popup-info")!.innerHTML = `
        <div class="sedori-popup-item-title">
            <a href="${detail.url}" target="_blank">${escapeHtml(detail.title.slice(0, 70))}</a>
        </div>
        ${rows ? `<table class="sedori-popup-table">${rows}</table>` : ""}`;
}

function scheduleHide() {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        if (popupEl) popupEl.style.display = "none";
        hideTimer = null;
    }, 200);
}

function attachHoverListeners(panel: HTMLDivElement) {
    panel.querySelectorAll<HTMLElement>(".sedori-mini-item[data-auction-id]").forEach((item) => {
        const auctionId = item.dataset.auctionId!;

        item.addEventListener("mouseenter", () => {
            if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
            if (hoverTimer !== null) clearTimeout(hoverTimer);
            hoverTimer = setTimeout(async () => {
                showPopupLoading(item);
                try {
                    let detail = detailCache.get(auctionId);
                    if (!detail) {
                        detail = await getDetail(auctionId);
                        detailCache.set(auctionId, detail);
                    }
                    showPopupContent(detail);
                } catch {
                    if (popupEl?.style.display === "flex") {
                        popupEl.querySelector<HTMLElement>(".sedori-popup-info")!.innerHTML =
                            `<div class="sedori-popup-error">読み込みに失敗しました</div>`;
                    }
                }
            }, 500);
        });

        item.addEventListener("mouseleave", (e) => {
            if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null; }
            const related = (e as MouseEvent).relatedTarget as Element | null;
            if (popupEl && popupEl.contains(related)) return;
            scheduleHide();
        });
    });
}

// ===== ミニパネル描画 =====

/** 利益額に応じたバッジHTMLを返す */
function profitBadge(calc: ProfitCalc | null): string {
    if (!calc) return "";
    if (calc.profit < 0) {
        return `<span class="sedori-profit sedori-profit-loss">${calc.profit.toLocaleString()}円</span>`;
    }
    const cls = calc.rate >= CHANCE_MIN_RATE ? "sedori-profit-good" : "sedori-profit-low";
    return `<span class="sedori-profit ${cls}">+${calc.profit.toLocaleString()}円 (${calc.rate}%)</span>`;
}

// ===== 価格差サマリー（ページ全体を利益順に集約する浮動パネル） =====

interface SummaryItem {
    asin: string;
    title: string;
    amazonPrice: number;
    yahooPrice: number;
    yahooUrl: string;
    profit: number;
    rate: number;
}

const summaryStore = new Map<string, SummaryItem>();
let summaryEl: HTMLDivElement | null = null;
let summaryCollapsed = false;

function recordSummary(
    asin: string,
    title: string,
    amazonPrice: number | null,
    best: { r: SearchResult; calc: ProfitCalc | null } | undefined
) {
    if (!asin || !amazonPrice || !best || !best.calc) return;
    // 利益が出るものだけ集約（赤字は除外）
    if (best.calc.profit <= 0) {
        summaryStore.delete(asin);
    } else {
        summaryStore.set(asin, {
            asin,
            title,
            amazonPrice,
            yahooPrice: best.r.current_price ?? 0,
            yahooUrl: best.r.url,
            profit: best.calc.profit,
            rate: best.calc.rate,
        });
    }
    renderSummary();
}

function getOrCreateSummary(): HTMLDivElement {
    if (summaryEl) return summaryEl;
    summaryEl = document.createElement("div");
    summaryEl.className = "sedori-summary";
    document.body.appendChild(summaryEl);
    return summaryEl;
}

function renderSummary() {
    const el = getOrCreateSummary();
    const items = [...summaryStore.values()].sort((a, b) => b.profit - a.profit);

    if (items.length === 0) {
        el.style.display = "none";
        return;
    }
    el.style.display = "block";

    if (summaryCollapsed) {
        el.innerHTML = `
            <div class="sedori-summary-header">
                <span>💹 価格差 ${items.length}件</span>
                <button class="sedori-summary-toggle">▲</button>
            </div>`;
        el.querySelector(".sedori-summary-toggle")?.addEventListener("click", () => {
            summaryCollapsed = false;
            renderSummary();
        });
        return;
    }

    const rows = items
        .slice(0, 20)
        .map(
            (it, i) => `
        <div class="sedori-summary-row${it.rate >= CHANCE_MIN_RATE ? " sedori-summary-chance" : ""}">
            <span class="sedori-summary-rank">${i + 1}</span>
            <div class="sedori-summary-body">
                <a href="https://www.amazon.co.jp/dp/${it.asin}" target="_blank" class="sedori-summary-title">${it.title.slice(0, 36)}</a>
                <div class="sedori-summary-meta">
                    <span>Y!${formatPrice(it.yahooPrice)}</span>
                    <span>→A${formatPrice(it.amazonPrice)}</span>
                    <a href="${it.yahooUrl}" target="_blank" class="sedori-summary-ylink">Y!</a>
                </div>
            </div>
            <span class="sedori-summary-profit ${it.rate >= CHANCE_MIN_RATE ? "sedori-profit-good" : "sedori-profit-low"}">+${it.profit.toLocaleString()}<br><small>${it.rate}%</small></span>
        </div>`
        )
        .join("");

    el.innerHTML = `
        <div class="sedori-summary-header">
            <span>💹 価格差ランキング ${items.length}件</span>
            <button class="sedori-summary-toggle">▼</button>
        </div>
        <div class="sedori-summary-list">${rows}</div>`;
    el.querySelector(".sedori-summary-toggle")?.addEventListener("click", () => {
        summaryCollapsed = true;
        renderSummary();
    });
}

function renderMiniResults(
    panel: HTMLDivElement,
    results: SearchResult[],
    amazonPrice: number | null,
    asin: string,
    productTitle: string
) {
    if (results.length === 0) {
        panel.innerHTML = `<div class="sedori-mini-empty">出品なし</div>`;
        return;
    }

    // 各結果に利益を付与し、利益の高い順に並べ替え（利益不明は末尾）
    const enriched = results.map((r) => ({
        r,
        calc: computeProfit(amazonPrice, r.current_price),
    }));
    enriched.sort((a, b) => (b.calc?.profit ?? -Infinity) - (a.calc?.profit ?? -Infinity));

    const best = enriched[0]?.calc ?? null;
    const hasChance = enriched.some((e) => e.calc && e.calc.rate >= CHANCE_MIN_RATE && e.calc.profit > 0);

    // ページ全体サマリーへ反映
    recordSummary(asin, productTitle, amazonPrice, enriched[0]);

    const items = enriched
        .slice(0, 5)
        .map(({ r, calc }) => {
            const chanceCls = calc && calc.rate >= CHANCE_MIN_RATE && calc.profit > 0
                ? " sedori-mini-item-chance"
                : "";
            return `
        <div class="sedori-mini-item${chanceCls}" data-auction-id="${r.auction_id}">
            ${r.image_url
                ? `<img class="sedori-mini-thumb" src="${r.image_url}" alt="" />`
                : `<div class="sedori-mini-thumb sedori-mini-nothumb"></div>`}
            <div class="sedori-mini-item-body">
                <a href="${r.url}" target="_blank" class="sedori-mini-title">${r.title.slice(0, 50)}</a>
                <div class="sedori-mini-meta">
                    <span class="sedori-mini-price">${formatPrice(r.current_price)}</span>
                    ${r.buy_now_price ? `<span class="sedori-mini-buynow">即決:${formatPrice(r.buy_now_price)}</span>` : ""}
                    ${profitBadge(calc)}
                    <span class="sedori-mini-time">${r.end_time_text || ""}</span>
                    <span>入札:${r.bid_count ?? 0}</span>
                </div>
            </div>
        </div>`;
        })
        .join("");

    const headerExtra = amazonPrice
        ? `<span class="sedori-mini-amazon">Amazon ${formatPrice(amazonPrice)}</span>`
        : "";
    const bestBadge = best && best.profit > 0
        ? `<span class="sedori-mini-best ${best.rate >= CHANCE_MIN_RATE ? "sedori-profit-good" : "sedori-profit-low"}">最大 +${best.profit.toLocaleString()}円</span>`
        : "";

    panel.innerHTML = `
        <div class="sedori-mini-header${hasChance ? " sedori-mini-header-chance" : ""}">
            <span>${hasChance ? "🔥 " : ""}ヤフオク ${results.length}件</span>
            ${headerExtra}
            ${bestBadge}
        </div>
        <div class="sedori-mini-items">${items}</div>`;

    attachHoverListeners(panel);
}

// ===== キュー =====

interface QueueItem {
    keyword: string;
    panel: HTMLDivElement;
    amazonPrice: number | null;
    asin: string;
    title: string;
}
const searchQueue: QueueItem[] = [];
let isProcessing = false;

function renderBackendError(panel: HTMLDivElement, item: QueueItem) {
    panel.innerHTML = `
        <div class="sedori-mini-error" style="font-size:11px;line-height:1.5">
            ⚠️ バックエンド未起動<br>
            <span style="opacity:.7">localhost:8000</span><br>
            <button class="sedori-retry-btn">再試行</button>
        </div>`;
    panel.querySelector(".sedori-retry-btn")?.addEventListener("click", () => {
        // バックエンドキャッシュをリセットして再試行
        backendStatus = null;
        searchQueue.push(item);
        processQueue();
    });
}

async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    // バックエンド死活確認（最初のバッチ前のみ）
    const available = await isBackendAvailable();
    if (!available) {
        const pending = searchQueue.splice(0);
        pending.forEach((item) => renderBackendError(item.panel, item));
        isProcessing = false;
        return;
    }

    while (searchQueue.length > 0) {
        const batch = searchQueue.splice(0, CONCURRENCY);
        batch.forEach((item) => {
            item.panel.innerHTML = `<div class="sedori-mini-loading">検索中...</div>`;
        });
        await Promise.all(
            batch.map(async (item) => {
                try {
                    const results = await searchYahoo(item.keyword);
                    renderMiniResults(item.panel, results, item.amazonPrice, item.asin, item.title);
                } catch (err) {
                    if (isBackendDownError(err)) {
                        backendStatus = { available: false, checkedAt: Date.now() };
                        renderBackendError(item.panel, item);
                    } else {
                        const msg = err instanceof Error ? err.message : "Unknown error";
                        item.panel.innerHTML = `<div class="sedori-mini-error" style="font-size:11px">検索エラー: ${msg.slice(0, 40)}</div>`;
                    }
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

    if (itemEl.querySelector(".sedori-cat-wrapper")) return;

    // h2は Amazon 商品カードで必ず商品タイトルに使われる（価格要素に使われない）
    const titleEl = itemEl.querySelector<HTMLElement>(
        "h2 a, " +
        "h2, " +
        ".a-size-medium.a-color-base.a-text-normal, " +
        ".a-size-base-plus.a-color-base.a-text-normal"
    );
    const title = titleEl?.textContent?.trim() || "";
    if (!title) return;

    const keyword = extractKeyword(title);
    const amazonPrice = parseAmazonPrice(itemEl);

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

    const priceEl = itemEl.querySelector(".a-price");
    const insertTarget = priceEl?.parentElement ?? titleEl?.parentElement ?? null;

    if (insertTarget && insertTarget.parentElement) {
        insertTarget.parentElement.insertBefore(wrapper, insertTarget.nextSibling);
    } else {
        itemEl.appendChild(wrapper);
    }

    searchQueue.push({ keyword, panel, amazonPrice, asin, title });
}

function injectAll() {
    document.querySelectorAll("[data-asin]").forEach(injectIntoItem);
    if (searchQueue.length > 0) {
        processQueue();
    }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const observer = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        injectAll();
    }, OBSERVER_DEBOUNCE_MS);
});

console.log(`[Sedori] amazon-category-inject: loaded. url=${location.href}`);
injectAll();
observer.observe(document.body, { childList: true, subtree: true });
