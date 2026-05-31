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
    // 複数のセレクタを順に試す（検索/カテゴリでDOMが異なるため）
    const selectors = [
        ".a-price .a-offscreen",
        "span.a-price > span.a-offscreen",
        ".a-price-whole",
        "[data-a-color='price'] .a-offscreen",
        ".a-color-price",
    ];
    for (const sel of selectors) {
        const el = itemEl.querySelector(sel);
        const t = el?.textContent?.trim();
        if (t) {
            const m = t.replace(/[￥¥,]/g, "").match(/\d{2,}/);
            if (m) return parseInt(m[0], 10);
        }
    }
    // フォールバック: カード内テキストから「¥12,345」形式を拾う
    const whole = itemEl.textContent || "";
    const m = whole.match(/[¥￥]\s?([\d,]{3,})/);
    if (m) {
        const n = parseInt(m[1].replace(/,/g, ""), 10);
        if (!Number.isNaN(n)) return n;
    }
    return null;
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

// ===== カテゴリ（同義語は同一クラス） =====
const CATEGORY_CLASSES: string[][] = [
    ["電子レンジ", "オーブンレンジ", "スチームオーブンレンジ", "単機能レンジ", "レンジ"],
    ["冷蔵庫", "冷凍冷蔵庫", "冷蔵冷凍庫", "冷凍庫", "ワインセラー"],
    ["洗濯機", "全自動洗濯機", "ドラム式洗濯機", "二槽式洗濯機", "洗濯乾燥機"],
    ["衣類乾燥機", "乾燥機"],
    ["テレビ", "液晶テレビ", "有機ELテレビ"],
    ["扇風機", "サーキュレーター"],
    ["掃除機", "ロボット掃除機", "スティック掃除機", "コードレス掃除機"],
    ["モニター", "ディスプレイ"],
    ["電気ケトル", "ケトル"],
    ["食洗機", "食器洗い乾燥機", "食器洗い機"],
    ["時計", "腕時計"],
    ["炊飯器"], ["エアコン"], ["ドライヤー"], ["加湿器"], ["除湿機"],
    ["空気清浄機"], ["トースター"], ["コーヒーメーカー"], ["ヒーター"],
    ["ストーブ"], ["こたつ"], ["アイロン"], ["ミシン"], ["カメラ"],
    ["スピーカー"], ["イヤホン"], ["ヘッドホン"],
    ["3Dプリンター", "3Dプリンタ", "光造形", "FDMプリンター"],
    ["プリンター", "プリンタ", "インクジェットプリンター", "レーザープリンター", "複合機"],
    ["ホットプレート"], ["コンロ"], ["グリル"],
];
const CATEGORY_WORDS = [...new Set(CATEGORY_CLASSES.flat())].sort((a, b) => b.length - a.length);
const PERIPHERAL_SUFFIXES = ["台", "ボード", "スタンド", "ラック", "カバー", "マット", "フード", "用", "シート", "ケース", "収納", "掛け", "置き", "パッド"];

function extractCategory(title: string): string | null {
    for (const w of CATEGORY_WORDS) {
        if (title.includes(w)) return w;
    }
    return null;
}

function categoryClass(word: string | null): string[] {
    if (!word) return [];
    for (const c of CATEGORY_CLASSES) if (c.includes(word)) return c;
    return [word];
}

function stripPeripherals(text: string): string {
    let t = text;
    for (const c of CATEGORY_WORDS) for (const s of PERIPHERAL_SUFFIXES) t = t.split(c + s).join("");
    return t;
}

function categoryIn(amazonCat: string | null, yahoo: string): boolean {
    if (!amazonCat) return true;
    const cleaned = stripPeripherals(yahoo);
    return categoryClass(amazonCat).some((w) => cleaned.includes(w));
}

// ===== ブランド =====
const KNOWN_BRANDS = [
    "パナソニック", "Panasonic", "日立", "HITACHI", "東芝", "TOSHIBA",
    "シャープ", "SHARP", "三菱", "MITSUBISHI", "ハイセンス", "Hisense",
    "ハイアール", "Haier", "アイリスオーヤマ", "アイリス", "IRIS", "山善", "YAMAZEN",
    "アクア", "AQUA", "COMFEE", "コンフィー", "ニトリ", "無印良品",
    "ツインバード", "TWINBIRD", "コイズミ", "KOIZUMI", "ソニー", "SONY",
    "シャオミ", "Xiaomi", "バルミューダ", "BALMUDA", "デロンギ", "DeLonghi",
    "ダイソン", "Dyson", "象印", "ZOJIRUSHI", "タイガー", "TIGER",
    "ニコン", "Nikon", "キヤノン", "Canon", "フィリップス", "PHILIPS",
    "ダイキン", "DAIKIN", "コロナ", "CORONA", "富士通", "FUJITSU",
    "リンナイ", "RINNAI", "マクスゼン", "MAXZEN", "船井", "FUNAI",
    "オリオン", "ORION", "エプソン", "EPSON", "ブラザー", "BROTHER",
    "アンカー", "Anker", "サムスン", "Samsung", "Apple", "LG",
    "アイロボット", "iRobot", "ルンバ", "Roomba", "シャーク", "Shark",
    "ロボロック", "Roborock", "マクセル", "MAXELL", "ティファール", "T-fal",
    "Creality", "クリアリティ", "Bambu Lab", "Bambu", "バンブー", "Anycubic", "エニキュービック",
    "ELEGOO", "エレゴー", "Voxelab", "FLASHFORGE", "QIDI", "Phrozen", "Sovol",
    "Kingroon", "Artillery", "Snapmaker", "Prusa",
];
// ブランドの英/日など同義表記グループ
const BRAND_GROUPS: string[][] = [
    ["Panasonic", "パナソニック"], ["Hisense", "ハイセンス"], ["SHARP", "シャープ"],
    ["TOSHIBA", "東芝"], ["HITACHI", "日立"], ["MITSUBISHI", "三菱"],
    ["SONY", "ソニー"], ["Haier", "ハイアール"], ["AQUA", "アクア"],
    ["IRIS", "アイリスオーヤマ", "アイリス"], ["YAMAZEN", "山善"],
    ["Nikon", "ニコン"], ["Canon", "キヤノン"], ["PHILIPS", "フィリップス"],
    ["COMFEE", "コンフィー"], ["DAIKIN", "ダイキン"], ["CORONA", "コロナ"],
    ["ZOJIRUSHI", "象印"], ["TIGER", "タイガー"], ["TWINBIRD", "ツインバード"],
    ["KOIZUMI", "コイズミ"], ["BALMUDA", "バルミューダ"], ["DeLonghi", "デロンギ"],
    ["Dyson", "ダイソン"], ["Xiaomi", "シャオミ"], ["Anker", "アンカー"],
    ["ELEGOO", "エレゴー"], ["Creality", "クリアリティ"],
    ["Anycubic", "エニキュービック"], ["Bambu", "Bambu Lab", "バンブー"],
    ["iRobot", "ルンバ", "Roomba"], ["Shark", "シャーク"],
];
const BRAND_BLOCKLIST = new Set([
    "FULL", "HD", "HDMI", "LED", "LCD", "USB", "PSE", "PSU", "DC", "AC",
    "PRO", "MAX", "MINI", "NEW", "SET", "KG", "CM", "LL", "XL", "WIFI",
    "WHITE", "BLACK", "SILVER", "GRAY", "GREY", "BEIGE", "BROWN", "NAVY",
    "STAINLESS", "STEEL", "GLASS", "PLASTIC", "WOOD", "ALUMI",
    "INVERTER", "AUTO", "ECO", "TURBO", "SMART", "TIMER", "SLIM", "DUAL",
    "POWER", "SILENT", "QUIET", "COMPACT", "PORTABLE", "WIRELESS", "DIGITAL",
    "TYPE", "FHD", "UHD", "BLUETOOTH", "MODEL", "JAPAN", "MADE", "SERIES",
    "STYLE", "DESIGN", "PREMIUM", "STANDARD", "VERSION", "SIZE", "COLOR",
]);

function asciiWordPresent(needle: string, hayLower: string): boolean {
    const re = new RegExp("(?<![a-z0-9])" + needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-z0-9])");
    return re.test(hayLower);
}

function extractBrand(title: string): string | null {
    const low = title.toLowerCase();
    for (const b of KNOWN_BRANDS) {
        if (/[a-z]/.test(b.toLowerCase())) {
            if (asciiWordPresent(b, low)) return b;
        } else if (title.includes(b)) return b;
    }
    const m = title.match(/(?<![A-Za-z])[A-Z][A-Z]{3,}(?![a-z])/g) || [];
    for (const tok of m) {
        if (BRAND_BLOCKLIST.has(tok)) continue;
        if (/^\d+[A-Z]+$/.test(tok)) continue;
        return tok;
    }
    return null;
}

function nameIn(name: string, text: string): boolean {
    if (/[a-z]/.test(name.toLowerCase())) return asciiWordPresent(name, text.toLowerCase());
    return text.includes(name);
}
function brandEquivalents(brand: string): string[] {
    for (const g of BRAND_GROUPS) if (g.includes(brand)) return g;
    return [brand];
}
function brandIn(brand: string | null, yahoo: string): boolean {
    if (!brand) return false;
    return brandEquivalents(brand).some((n) => nameIn(n, yahoo));
}

// ===== 型番 =====
const MODEL_SPEC_BLOCKLIST = new Set([
    "TYPE-C", "TYPE-A", "USB-C", "USB-A", "USB3", "USB2",
    "4K", "8K", "2K", "FHD", "UHD", "MP4", "MP3", "PM2",
    "3D", "2D", "1080P", "720P", "100V", "200V",
]);
const MODEL_PATTERNS = [
    /[A-Za-z]{2,6}-[A-Za-z0-9]{1,}(?:-[A-Za-z0-9]+)*/g,
    /[A-Za-z]{1,8}\d{1,}[A-Za-z0-9]*/g,
    /\d{1,}[A-Za-z]{1,6}\d*[A-Za-z]*/g,
    /[A-Za-z]{3,}\s?\d{1,3}[A-Za-z]?/g, // モデル名+数字: Neptune 4, Kobra 3
];
function normModel(s: string): string {
    return (s || "").replace(/[\s　-]/g, "").toUpperCase();
}
function extractModelTokens(title: string): string[] {
    const cands = new Set<string>();
    for (const pat of MODEL_PATTERNS) for (const m of title.match(pat) || []) cands.add(m.toUpperCase());
    const out: string[] = [];
    for (const c of cands) {
        if (MODEL_SPEC_BLOCKLIST.has(c)) continue;
        const norm = c.replace(/-/g, "");
        if (/^\d{4}$/.test(norm)) continue;
        if (/^\d+(?:\.\d+)?(?:KG|G|L|ML|CM|MM|M|W|V|A|型|インチ|合|人|点|台|本|畳|GB|TB|HZ)$/.test(norm)) continue;
        if (/-/.test(c) || /[A-Za-z]\d|\d[A-Za-z]/.test(c)) {
            if (norm.length < 2) continue;
        } else if (norm.length < 4) continue;
        if (!/\d/.test(c) && !c.includes("-")) continue;
        out.push(c);
    }
    return out;
}
function modelMatch(amazonTitle: string, yahooTitle: string): boolean {
    const am = extractModelTokens(amazonTitle).map(normModel);
    const ym = extractModelTokens(yahooTitle).map(normModel);
    const ystr = normModel(yahooTitle);
    for (const a of am) {
        if (a.length < 2) continue;
        if (ystr.includes(a)) return true;
        for (const y of ym) {
            if (y.length < 2) continue;
            if (a.includes(y) || y.includes(a)) return true;
        }
    }
    return false;
}
function modelConflict(amazonTitle: string, yahooTitle: string): boolean {
    const am = extractModelTokens(amazonTitle);
    const ym = extractModelTokens(yahooTitle);
    if (!am.length || !ym.length) return false;
    return !modelMatch(amazonTitle, yahooTitle);
}

// ===== 容量（カテゴリ別単位） =====
const KG_CATS = new Set(["洗濯機", "全自動洗濯機", "ドラム式洗濯機", "二槽式洗濯機", "洗濯乾燥機", "衣類乾燥機", "乾燥機"]);
const GO_CATS = new Set(["炊飯器"]);
function extractCapacity(title: string, category: string | null = null): { value: number; unit: string } | null {
    const t = title || "";
    const kg = () => [...t.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)].map((m) => parseFloat(m[1]));
    const liter = () => {
        const a = [...t.matchAll(/(\d+(?:\.\d+)?)\s*[lL](?![a-zA-Z])/g)].map((m) => parseFloat(m[1]));
        const b = [...t.matchAll(/(\d+(?:\.\d+)?)\s*リットル/g)].map((m) => parseFloat(m[1]));
        return [...a, ...b];
    };
    const go = () => [...t.matchAll(/(\d+(?:\.\d+)?)\s*合/g)].map((m) => parseFloat(m[1]));
    let order: [string, () => number[]][];
    if (category && KG_CATS.has(category)) order = [["kg", kg]];
    else if (category && GO_CATS.has(category)) order = [["合", go]];
    else if (category) order = [["L", liter]];
    else order = [["kg", kg], ["L", liter]];
    for (const [unit, fn] of order) {
        const vals = fn();
        if (vals.length) return { value: Math.max(...vals), unit };
    }
    return null;
}
function capacityMatches(
    a: { value: number; unit: string } | null,
    b: { value: number; unit: string } | null,
    tol = 0.06
): boolean {
    if (!a || !b || a.unit !== b.unit || a.value <= 0) return false;
    return Math.abs(a.value - b.value) / a.value <= tol;
}
function capacityStr(c: { value: number; unit: string } | null): string | null {
    if (!c) return null;
    return `${c.value}${c.unit}`;
}

// ===== セット品・ジャンク・付属品 =====
const SET_WORDS = ["点セット", "２点", "３点", "４点", "2点", "3点", "4点", "まとめ", "おまとめ", "セット販売", "セット", "2台", "3台", "２台", "３台", "2個", "個セット", "本セット", "枚セット", "まとめて"];
const JUNK_WORDS = ["ジャンク", "部品取り", "部品鳥", "現状品", "現状渡し", "故障", "不動", "通電のみ", "通電確認のみ", "ガラス割れ", "難あり", "訳あり", "破損", "動作未確認"];
const ACCESSORY_WORDS = ["フィラメント", "ノズル", "互換", "純正", "替え", "替刃", "スペア", "交換用", "部品", "パーツ", "ケーブル", "アダプター", "アダプタ", "フィルター", "カートリッジ", "専用ケース", "専用カバー", "マウント", "ホルダー", "スタンド", "保護フィルム", "取扱説明書", "トナー", "インク"];
function isSetListing(title: string): boolean {
    return SET_WORDS.some((w) => (title || "").includes(w));
}
function isJunk(title: string): boolean {
    return JUNK_WORDS.some((w) => (title || "").includes(w));
}
function isAccessory(amazonTitle: string, yahooTitle: string): boolean {
    const y = yahooTitle || "", a = amazonTitle || "";
    return ACCESSORY_WORDS.some((w) => y.includes(w) && !a.includes(w));
}

function extractKeyword(title: string): string {
    const cat = extractCategory(title);
    const brand = extractBrand(title);
    const capstr = capacityStr(extractCapacity(title, cat));
    const parts = [brand, cat, capstr].filter((p): p is string => !!p);
    if (parts.length) return parts.join(" ");
    const models = extractModelTokens(title);
    if (models.length) return models[0];
    const words = title.split(/[\s　]+/).filter((w) => w.length > 0);
    return words.slice(0, 3).join(" ").slice(0, 40) || title.slice(0, 20);
}

/** 同一商品レベルの関連性判定（根拠ベース・バックエンドmatching.pyと同一方針）
 *  確証(型番+ブランド一致 / ブランド+容量一致)がある時だけマッチ。無ければ除外。 */
function isRelevant(amazonTitle: string, yahooTitle: string): boolean {
    const yahoo = yahooTitle || "";
    if (isJunk(yahoo)) return false;
    if (isSetListing(yahoo) && !isSetListing(amazonTitle)) return false;
    if (isAccessory(amazonTitle, yahoo)) return false;
    const cat = extractCategory(amazonTitle);
    if (cat && !categoryIn(cat, yahoo)) return false;
    if (modelConflict(amazonTitle, yahoo)) return false;
    const brandOk = brandIn(extractBrand(amazonTitle), yahoo);
    if (modelMatch(amazonTitle, yahoo) && brandOk) return true;
    const aCap = extractCapacity(amazonTitle, cat);
    const yCap = extractCapacity(yahoo, cat);
    if (brandOk && capacityMatches(aCap, yCap)) return true;
    return false;
}

/** 中央値（1円開始などの外れ値の影響を抑える） */
function median(values: number[]): number | null {
    const v = values.filter((n) => n > 0).sort((a, b) => a - b);
    if (v.length === 0) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 === 0 ? Math.round((v[mid - 1] + v[mid]) / 2) : v[mid];
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
const analyzedAsins = new Set<string>();   // 解析済み商品（重複排除）
const noPriceAsins = new Set<string>();    // Amazon価格を取れなかった商品
let summaryEl: HTMLDivElement | null = null;
let summaryCollapsed = false;

function recordSummary(
    asin: string,
    title: string,
    amazonPrice: number | null,
    repItem: SearchResult | null,
    calc: ProfitCalc | null
) {
    if (asin) {
        analyzedAsins.add(asin);
        if (!amazonPrice) noPriceAsins.add(asin);
        else noPriceAsins.delete(asin);
    }
    // 利益が出るものだけ集約（赤字・価格不明・該当なしは除外）
    if (asin && amazonPrice && repItem && calc && calc.profit > 0) {
        summaryStore.set(asin, {
            asin,
            title,
            amazonPrice,
            yahooPrice: repItem.current_price ?? 0,
            yahooUrl: repItem.url,
            profit: calc.profit,
            rate: calc.rate,
        });
    } else if (asin) {
        summaryStore.delete(asin);
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
    const analyzed = analyzedAsins.size;
    const noPrice = noPriceAsins.size;

    // 起動直後から常に表示（新ビルドが動いているか即分かる）
    el.style.display = "block";

    const headerLabel =
        analyzed === 0
            ? `💹 価格差ツール起動中… スクロールで解析`
            : `💹 価格差 解析${analyzed}件・利益あり${items.length}件`;

    if (summaryCollapsed) {
        el.innerHTML = `
            <div class="sedori-summary-header">
                <span>${headerLabel}</span>
                <button class="sedori-summary-toggle">▲</button>
            </div>`;
        el.querySelector(".sedori-summary-toggle")?.addEventListener("click", () => {
            summaryCollapsed = false;
            renderSummary();
        });
        return;
    }

    let body: string;
    if (items.length === 0) {
        // 利益が出る商品なし。価格未取得が多い場合はヒントを出す
        const hint =
            noPrice >= analyzed
                ? "Amazon価格を取得できていません（ページ構成が想定外の可能性）"
                : "利益が出る商品は見つかりませんでした";
        body = `<div class="sedori-summary-empty">${hint}${
            noPrice > 0 ? `<br><small>価格未取得: ${noPrice}件</small>` : ""
        }</div>`;
    } else {
        body =
            `<div class="sedori-summary-list">` +
            items
                .slice(0, 20)
                .map(
                    (it, i) => `
        <div class="sedori-summary-row${it.rate >= CHANCE_MIN_RATE ? " sedori-summary-chance" : ""}">
            <span class="sedori-summary-rank">${i + 1}</span>
            <div class="sedori-summary-body">
                <a href="https://www.amazon.co.jp/dp/${it.asin}" target="_blank" class="sedori-summary-title">${escapeHtml(it.title.slice(0, 36))}</a>
                <div class="sedori-summary-meta">
                    <span>Y!${formatPrice(it.yahooPrice)}</span>
                    <span>→A${formatPrice(it.amazonPrice)}</span>
                    <a href="${it.yahooUrl}" target="_blank" class="sedori-summary-ylink">Y!</a>
                </div>
            </div>
            <span class="sedori-summary-profit ${it.rate >= CHANCE_MIN_RATE ? "sedori-profit-good" : "sedori-profit-low"}">+${it.profit.toLocaleString()}<br><small>${it.rate}%</small></span>
        </div>`
                )
                .join("") +
            `</div>`;
    }

    el.innerHTML = `
        <div class="sedori-summary-header">
            <span>${headerLabel}</span>
            <button class="sedori-summary-toggle">▼</button>
        </div>
        ${body}`;
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
        recordSummary(asin, productTitle, amazonPrice, null, null);
        return;
    }

    // 関連性フィルタ: 同カテゴリの出品だけを残す（別ジャンルの誤マッチを除外）
    const relevant = results.filter(
        (r) => r.current_price != null && isRelevant(productTitle, r.title)
    );

    if (relevant.length === 0) {
        panel.innerHTML = `<div class="sedori-mini-empty">該当なし（同カテゴリの出品なし）</div>`;
        recordSummary(asin, productTitle, amazonPrice, null, null);
        return;
    }

    // 相場＝関連結果の中央値（1円開始などの外れ値を排除）
    const repPrice = median(relevant.map((r) => r.current_price as number));
    const calc = computeProfit(amazonPrice, repPrice);
    // 中央値に最も近い出品を代表に
    const repItem = relevant.reduce((b, r) =>
        Math.abs((r.current_price ?? 0) - (repPrice ?? 0)) <
        Math.abs((b.current_price ?? 0) - (repPrice ?? 0))
            ? r
            : b
    , relevant[0]);

    // ページ全体サマリーへ反映（中央値ベース）
    recordSummary(asin, productTitle, amazonPrice, repItem, calc);

    const hasChance = !!(calc && calc.rate >= CHANCE_MIN_RATE && calc.profit > 0);

    // 関連出品を価格の安い順に上位5件表示（参考用、個別の利益バッジは出さない）
    const sorted = [...relevant].sort(
        (a, b) => (a.current_price ?? 0) - (b.current_price ?? 0)
    );
    const items = sorted
        .slice(0, 5)
        .map(
            (r) => `
        <div class="sedori-mini-item" data-auction-id="${r.auction_id}">
            ${r.image_url
                ? `<img class="sedori-mini-thumb" src="${r.image_url}" alt="" />`
                : `<div class="sedori-mini-thumb sedori-mini-nothumb"></div>`}
            <div class="sedori-mini-item-body">
                <a href="${r.url}" target="_blank" class="sedori-mini-title">${r.title.slice(0, 50)}</a>
                <div class="sedori-mini-meta">
                    <span class="sedori-mini-price">${formatPrice(r.current_price)}</span>
                    ${r.buy_now_price ? `<span class="sedori-mini-buynow">即決:${formatPrice(r.buy_now_price)}</span>` : ""}
                    <span class="sedori-mini-time">${r.end_time_text || ""}</span>
                    <span>入札:${r.bid_count ?? 0}</span>
                </div>
            </div>
        </div>`
        )
        .join("");

    const headerExtra = amazonPrice
        ? `<span class="sedori-mini-amazon">A ${formatPrice(amazonPrice)} / 相場 ${formatPrice(repPrice)}</span>`
        : "";
    const profitB = calc && calc.profit > 0
        ? `<span class="sedori-mini-best ${calc.rate >= CHANCE_MIN_RATE ? "sedori-profit-good" : "sedori-profit-low"}">利益+${calc.profit.toLocaleString()}円(${calc.rate}%)</span>`
        : "";

    panel.innerHTML = `
        <div class="sedori-mini-header${hasChance ? " sedori-mini-header-chance" : ""}">
            <span>${hasChance ? "🔥 " : ""}ヤフオク ${relevant.length}件</span>
            ${headerExtra}
            ${profitB}
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
renderSummary(); // 起動直後にパネルを表示（動作確認用）
injectAll();
observer.observe(document.body, { childList: true, subtree: true });
