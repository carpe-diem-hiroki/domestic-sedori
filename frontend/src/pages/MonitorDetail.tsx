import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import { PricingPanel } from "../components/PricingPanel";
import { ListingForm } from "../components/ListingForm";
import { AuctionHistoryPanel } from "../components/AuctionHistoryPanel";
import type {
  AmazonProduct,
  AuctionDetail,
  CompetitorsResponse,
  HistoryResponse,
  MonitorItem,
  PricingResult,
} from "../types";

export function MonitorDetail() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();

  const [monitor, setMonitor] = useState<MonitorItem | null>(null);
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [amazonProduct, setAmazonProduct] = useState<AmazonProduct | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorsResponse | null>(null);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const linkId = parseInt(id, 10);

    const fetchData = async () => {
      try {
        const m = await api.getMonitor(linkId);
        setMonitor(m);

        const [d, h, amzn, comp] = await Promise.all([
          api.getDetail(m.yahoo_auction_id).catch(() => null),
          api.getHistory(m.product_title.split(/\s+/).slice(0, 3).join(" ")).catch(() => null),
          api.getAmazonProduct(m.asin).catch(() => null),
          api.getCompetitors(m.asin).catch(() => null),
        ]);

        setDetail(d);
        setHistory(h);
        setAmazonProduct(amzn);
        setCompetitors(comp);

        const expectedPrice = h?.median_price ?? d?.current_price ?? 0;
        if (expectedPrice > 0) {
          try {
            const suggestion = await api.suggestPrice({
              expected_winning_price: expectedPrice,
              category: d?.category || undefined,
              target_profit_rate: 20,
            });
            setSellingPrice(suggestion.suggested_price);

            const calc = await api.calculatePricing({
              selling_price: suggestion.suggested_price,
              expected_winning_price: expectedPrice,
              category: d?.category || undefined,
            });
            setPricing(calc);
          } catch {
            // 価格計算失敗は致命的でないので無視
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, api]);

  const recalculate = async () => {
    if (!sellingPrice || !history?.median_price) return;
    try {
      const calc = await api.calculatePricing({
        selling_price: sellingPrice,
        expected_winning_price: history.median_price,
        category: detail?.category || undefined,
      });
      setPricing(calc);
    } catch {
      // 再計算失敗
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!monitor) return <div className="error-msg">監視対象が見つかりません</div>;

  return (
    <div>
      <h2 className="page-title">監視詳細</h2>

      <div className="grid-2">
        {/* 左カラム: Amazon商品 + 競合 + ヤフオク情報 */}
        <div>
          <div className="card">
            <h3 style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
              Amazon商品
            </h3>
            <div style={{ fontSize: 13 }}>
              <div><strong>ASIN:</strong> {monitor.asin}</div>
              <div><strong>タイトル:</strong> {amazonProduct?.title || monitor.product_title}</div>
              {amazonProduct && (
                <>
                  {amazonProduct.price != null && (
                    <div><strong>Amazon価格:</strong> <span className="price">{formatPrice(amazonProduct.price)}</span></div>
                  )}
                  {amazonProduct.brand && <div><strong>ブランド:</strong> {amazonProduct.brand}</div>}
                  {amazonProduct.model_number && <div><strong>型番:</strong> {amazonProduct.model_number}</div>}
                  {amazonProduct.category && <div><strong>カテゴリ:</strong> {amazonProduct.category}</div>}
                  {amazonProduct.rating != null && (
                    <div><strong>評価:</strong> {amazonProduct.rating} ({amazonProduct.review_count ?? 0}件)</div>
                  )}
                  {amazonProduct.image_url && (
                    <div style={{ marginTop: 8 }}>
                      <img src={amazonProduct.image_url} alt="" style={{ width: 120, height: 120, objectFit: "contain" }} />
                    </div>
                  )}
                </>
              )}
              <div style={{ marginTop: 4 }}>
                <a
                  href={`https://www.amazon.co.jp/dp/${monitor.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#1976d2", fontSize: 12 }}
                >
                  Amazonで見る
                </a>
              </div>
            </div>
          </div>

          {/* 競合価格 */}
          {competitors && competitors.offers.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
                競合出品者
                <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>
                  ({competitors.offers.length}件)
                </span>
              </h3>
              {competitors.lowest_new_price != null && (
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  新品最安: <span className="price">{formatPrice(competitors.lowest_new_price)}</span>
                </div>
              )}
              {competitors.lowest_used_price != null && (
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  中古最安: <span className="price">{formatPrice(competitors.lowest_used_price)}</span>
                </div>
              )}
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>価格</th>
                    <th>状態</th>
                    <th>出品者</th>
                    <th>FBA</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.offers.slice(0, 10).map((o, i) => (
                    <tr key={i}>
                      <td className="price">{formatPrice(o.total_price)}</td>
                      <td>{o.condition}</td>
                      <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.seller_name || "-"}
                      </td>
                      <td>{o.is_fba ? "○" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h3 style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
              ヤフオク情報
            </h3>
            {detail ? (
              <div style={{ fontSize: 13 }}>
                <div><strong>タイトル:</strong> {detail.title}</div>
                <div>
                  <strong>現在価格:</strong>{" "}
                  <span className="price">{formatPrice(detail.current_price)}</span>
                </div>
                {detail.buy_now_price && (
                  <div>
                    <strong>即決価格:</strong>{" "}
                    <span className="price-buynow">{formatPrice(detail.buy_now_price)}</span>
                  </div>
                )}
                <div><strong>入札:</strong> {detail.bid_count ?? 0}</div>
                <div><strong>状態:</strong> {detail.condition || "-"}</div>
                <div><strong>カテゴリ:</strong> {detail.category || "-"}</div>
                <div><strong>出品者:</strong> {detail.seller_name || "-"}</div>
                <div><strong>終了:</strong> {detail.end_time || "-"}</div>
                <div>
                  <a href={detail.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2", fontSize: 12 }}>
                    ヤフオクで見る
                  </a>
                </div>
                {detail.image_urls.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                    {detail.image_urls.slice(0, 4).map((url, i) => (
                      <img key={i} src={url} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "#999" }}>詳細取得中...</div>
            )}
          </div>
        </div>

        {/* 右カラム: 価格計算 + 出品 + 落札履歴 */}
        <div>
          <PricingPanel
            pricing={pricing}
            sellingPrice={sellingPrice}
            onSellingPriceChange={setSellingPrice}
            onRecalculate={recalculate}
          />

          <ListingForm
            monitor={monitor}
            amazonProduct={amazonProduct}
            sellingPrice={sellingPrice}
          />

          <AuctionHistoryPanel history={history} />
        </div>
      </div>
    </div>
  );
}
