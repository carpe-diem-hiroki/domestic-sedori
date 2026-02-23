import type {
  AmazonProduct,
  AmazonProductDB,
  AuctionDetail,
  CompetitorsResponse,
  HistoryResponse,
  MonitorItem,
  NotificationListResponse,
  PricingResult,
  SchedulerStatus,
  SearchResult,
  Template,
} from "../types";

const API = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

const api = {
  // Yahoo
  searchYahoo: (keyword: string) =>
    fetchJson<SearchResult[]>(
      `${API}/yahoo/search?keyword=${encodeURIComponent(keyword)}`
    ),

  getDetail: (auctionId: string) =>
    fetchJson<AuctionDetail>(`${API}/yahoo/detail/${auctionId}`),

  getHistory: (keyword: string, count = 50) =>
    fetchJson<HistoryResponse>(
      `${API}/yahoo/history?keyword=${encodeURIComponent(keyword)}&count=${count}`
    ),

  // Monitor
  addMonitor: (data: {
    asin: string;
    product_title: string;
    auction_id: string;
    auction_title: string;
    current_price: number | null;
    buy_now_price?: number | null;
    url?: string | null;
  }) =>
    fetchJson<MonitorItem>(`${API}/monitor/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  listMonitors: (status = "active") =>
    fetchJson<{ items: MonitorItem[]; total: number }>(
      `${API}/monitor/list?status=${status}`
    ),

  getMonitor: (id: number) =>
    fetchJson<MonitorItem>(`${API}/monitor/${id}`),

  removeMonitor: (id: number) =>
    fetchJson<{ message: string }>(`${API}/monitor/${id}`, {
      method: "DELETE",
    }),

  // Pricing
  calculatePricing: (data: {
    selling_price: number;
    expected_winning_price: number;
    category?: string | null;
    shipping_cost?: number;
  }) =>
    fetchJson<PricingResult>(`${API}/pricing/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  suggestPrice: (data: {
    expected_winning_price: number;
    category?: string | null;
    target_profit_rate?: number;
  }) =>
    fetchJson<{
      suggested_price: number;
      actual_profit_rate: number;
      profit: number;
    }>(`${API}/pricing/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // Amazon
  getAmazonProduct: (asin: string) =>
    fetchJson<AmazonProduct>(`${API}/amazon/product/${asin}`),

  saveAmazonProduct: (asin: string) =>
    fetchJson<AmazonProductDB>(`${API}/amazon/product/${asin}/save`, {
      method: "POST",
    }),

  getCompetitors: (asin: string) =>
    fetchJson<CompetitorsResponse>(`${API}/amazon/competitors/${asin}`),

  // Templates
  listTemplates: () => fetchJson<Template[]>(`${API}/templates/`),

  createTemplate: (data: { name: string; body: string }) =>
    fetchJson<Template>(`${API}/templates/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  updateTemplate: (id: number, data: { name?: string; body?: string }) =>
    fetchJson<Template>(`${API}/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteTemplate: (id: number) =>
    fetchJson<{ detail: string }>(`${API}/templates/${id}`, {
      method: "DELETE",
    }),

  // Notifications
  listNotifications: (limit = 50, unreadOnly = false) =>
    fetchJson<NotificationListResponse>(
      `${API}/notifications/?limit=${limit}&unread_only=${unreadOnly}`
    ),

  markNotificationRead: (id: number) =>
    fetchJson<{ detail: string }>(`${API}/notifications/${id}/read`, {
      method: "POST",
    }),

  markAllNotificationsRead: () =>
    fetchJson<{ detail: string }>(`${API}/notifications/read-all`, {
      method: "POST",
    }),

  getUnreadCount: () =>
    fetchJson<{ unread_count: number }>(`${API}/notifications/unread-count`),

  // Scheduler
  getSchedulerStatus: () =>
    fetchJson<SchedulerStatus>(`${API}/scheduler/status`),

  startScheduler: () =>
    fetchJson<{ detail: string }>(`${API}/scheduler/start`, {
      method: "POST",
    }),

  stopScheduler: () =>
    fetchJson<{ detail: string }>(`${API}/scheduler/stop`, {
      method: "POST",
    }),

  runSchedulerNow: () =>
    fetchJson<{ detail: string }>(`${API}/scheduler/run-now`, {
      method: "POST",
    }),
};

export function useApi() {
  return api;
}
