/**
 * バックエンドAPI通信クライアント
 * サービスワーカー経由でfetchしてMixed Content問題を回避
 */
const API_BASE = "http://localhost:8000/api";

export interface SearchResult {
    auction_id: string;
    title: string;
    current_price: number | null;
    buy_now_price: number | null;
    image_url: string | null;
    end_time_text: string | null;
    bid_count: number | null;
    url: string;
}

export interface MonitorAddRequest {
    asin: string;
    product_title: string;
    auction_id: string;
    auction_title: string;
    current_price: number | null;
    buy_now_price: number | null;
    image_url: string | null;
    url: string | null;
}

function fetchViaBackground<T>(url: string, method = "GET", body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: "fetch", url, method, body: body ? JSON.stringify(body) : undefined },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response?.ok) {
                    resolve(response.data as T);
                } else {
                    reject(new Error(response?.error ?? "Unknown error"));
                }
            }
        );
    });
}

export function searchYahoo(keyword: string): Promise<SearchResult[]> {
    return fetchViaBackground<SearchResult[]>(
        `${API_BASE}/yahoo/search?keyword=${encodeURIComponent(keyword)}`
    );
}

export function addMonitor(data: MonitorAddRequest): Promise<unknown> {
    return fetchViaBackground<unknown>(`${API_BASE}/monitor/add`, "POST", data);
}

export interface AuctionDetail {
    auction_id: string;
    title: string;
    current_price: number | null;
    buy_now_price: number | null;
    start_price: number | null;
    bid_count: number | null;
    seller_id: string | null;
    seller_name: string | null;
    start_time: string | null;
    end_time: string | null;
    condition: string | null;
    image_urls: string[];
    shipping_info: string | null;
    category: string | null;
    brand: string | null;
    url: string;
}

export function getDetail(auctionId: string): Promise<AuctionDetail> {
    return fetchViaBackground<AuctionDetail>(
        `${API_BASE}/yahoo/detail/${encodeURIComponent(auctionId)}`
    );
}
