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

export interface HistoryResult {
  auction_id: string;
  title: string;
  winning_price: number;
  end_date: string | null;
  bid_count: number | null;
}

export interface HistoryResponse {
  results: HistoryResult[];
  count: number;
  median_price: number | null;
  average_price: number | null;
}

export interface MonitorItem {
  id: number;
  product_id: number;
  auction_id: number;
  asin: string;
  product_title: string;
  yahoo_auction_id: string;
  auction_title: string;
  current_price: number | null;
  buy_now_price: number | null;
  status: string;
  is_monitoring: boolean;
}

export interface PricingResult {
  selling_price: number;
  expected_winning_price: number;
  amazon_fee: number;
  amazon_fee_rate: number;
  shipping_cost: number;
  other_cost: number;
  profit: number;
  profit_rate: number;
}

export interface AmazonProduct {
  asin: string;
  title: string | null;
  price: number | null;
  brand: string | null;
  model_number: string | null;
  category: string | null;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
}

export interface AmazonProductDB extends AmazonProduct {
  id: number;
  price_updated_at: string | null;
  created_at: string;
}

export interface CompetitorOffer {
  price: number;
  condition: string;
  seller_name: string | null;
  shipping_cost: number;
  is_fba: boolean;
  total_price: number;
}

export interface CompetitorsResponse {
  asin: string;
  offers: CompetitorOffer[];
  lowest_new_price: number | null;
  lowest_used_price: number | null;
}

export interface Template {
  id: number;
  name: string;
  body: string;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
}

export interface SchedulerStatus {
  running: boolean;
  interval_minutes: number;
  next_run: string | null;
}
