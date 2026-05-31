import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type {
  AuctionDetail,
  HistoryResponse,
  MonitorItem,
  PricingResult,
  Template,
} from "../types";

export function MonitorDetail() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const navigate = useNavigate();

  const [monitor, setMonitor] = useState<MonitorItem | null>(null);
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editable pricing inputs
  const [expectedWinningPrice, setExpectedWinningPrice] = useState(0);
  const [shippingCost, setShippingCost] = useState(3500);
  const [otherCost, setOtherCost] = useState(0);

  // Amazon出品フォーム
  const [sku, setSku] = useState("");
  const [subCondition, setSubCondition] = useState("中古 - 良い");
  const [leadTime, setLeadTime] = useState(8);
  const [listingPrice, setListingPrice] = useState(0);
  const [description, setDescription] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [listingMessage, setListingMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    const linkId = parseInt(id, 10);

    const fetchData = async () => {
      try {
        const m = await api.getMonitor(linkId);
        setMonitor(m);

        // SKU初期化
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        setSku(`${m.asin}-${dateStr}`);

        // テンプレート読み込み
        api.listTemplates().then(setTemplates).catch(() => {});

        const [d, h] = await Promise.all([
          api.getDetail(m.yahoo_auction_id).catch(() => null),
          api
            .getHistory(m.product_title.split(/\s+/).slice(0, 3).join(" "))
            .catch(() => null),
        ]);

        setDetail(d);
        setHistory(h);

        const expectedPrice = h?.median_price ?? d?.current_price ?? 0;
        if (expectedPrice > 0) {
          setExpectedWinningPrice(expectedPrice);
          try {
            const suggestion = await api.suggestPrice({
              expected_winning_price: expectedPrice,
              category: d?.category || undefined,
              target_profit_rate: 20,
            });
            setSellingPrice(suggestion.suggested_price);
            setListingPrice(suggestion.suggested_price);

            const calc = await api.calculatePricing({
              selling_price: suggestion.suggested_price,
              expected_winning_price: expectedPrice,
              category: d?.category || undefined,
              shipping_cost: 3500,
            });
            setPricing(calc);
            setShippingCost(calc.shipping_cost ?? 3500);
          } catch {
            // 価格計算失敗は致命的でない
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

  const recalculate = useCallback(
    async (expPrice: number, shipCost: number, othCost: number) => {
      if (!expPrice) return;
      try {
        const suggestion = await api.suggestPrice({
          expected_winning_price: expPrice,
          category: detail?.category || undefined,
          target_profit_rate: 20,
        });
        setSellingPrice(suggestion.suggested_price);

        const calc = await api.calculatePricing({
          selling_price: suggestion.suggested_price,
          expected_winning_price: expPrice,
          category: detail?.category || undefined,
          shipping_cost: shipCost,
        });
        const adjustedProfit = calc.profit - othCost;
        const adjustedProfitRate =
          suggestion.suggested_price > 0
            ? Math.round(
                (adjustedProfit / suggestion.suggested_price) * 100
              )
            : 0;
        setPricing({
          ...calc,
          profit: adjustedProfit,
          profit_rate: adjustedProfitRate,
          other_cost: othCost,
        });
      } catch {
        // 再計算失敗
      }
    },
    [api, detail]
  );

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;
    const t = templates.find((tpl) => tpl.id === parseInt(templateId, 10));
    if (t && monitor) {
      let desc = t.body;
      desc = desc.replace(/\{product_title\}/g, monitor.product_title || "");
      desc = desc.replace(/\{brand\}/g, "");
      desc = desc.replace(/\{model_number\}/g, monitor.asin || "");
      desc = desc.replace(/\{condition\}/g, subCondition);
      setDescription(desc);
    }
  };

  const handleListing = async () => {
    if (!sku.trim()) {
      setListingMessage("SKUを入力してください");
      return;
    }
    if (!listingPrice) {
      setListingMessage("販売価格を入力してください");
      return;
    }
    if (!monitor) return;
    setSubmitting(true);
    setListingMessage("");
    try {
      await api.createListing({
        product_id: monitor.product_id,
        link_id: monitor.id,
        sku: sku.trim(),
        price: listingPrice,
        sub_condition: subCondition,
        lead_time_days: leadTime,
        description: description || null,
        template_id: selectedTemplate ? parseInt(selectedTemplate, 10) : null,
      });
      navigate("/listings");
    } catch (err) {
      setListingMessage(
        err instanceof Error ? err.message : "出品に失敗しました"
      );
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!monitor) return <div className="error-msg">監視対象が見つかりません</div>;

  const mainImage = detail?.image_urls[0] ?? null;
  const title = detail?.title ?? monitor.auction_title;
  const historyKeyword = monitor.product_title
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  const yahooHistoryUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(
    historyKeyword
  )}&va=&abatch=0&s1=end&o1=d&closed=1`;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "5px 6px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 13,
    background: "#fffde7",
  };

  return (
    <div>
      {/* ヤフオク情報 */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
          ヤフオク情報
        </h3>

        {/* 写真 + タイトル */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          {mainImage && (
            <img
              src={mainImage}
              alt=""
              style={{
                width: 120,
                height: 90,
                objectFit: "cover",
                borderRadius: 6,
                flexShrink: 0,
                border: "1px solid #eee",
              }}
            />
          )}
          <div>
            <div
              style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.5 }}
            >
              {title}
            </div>
            {detail?.url && (
              <a
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1976d2", fontSize: 12 }}
              >
                ヤフオクで見る
              </a>
            )}
          </div>
        </div>

        {/* オークション情報テーブル */}
        <table
          className="table"
          style={{ marginBottom: 20, tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>開始日時</th>
              <th>終了日時</th>
              <th>現在価格</th>
              <th>即決価格</th>
              <th>残り時間</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: 13 }}>{detail?.start_time || "-"}</td>
              <td style={{ fontSize: 13 }}>{detail?.end_time || "-"}</td>
              <td className="price">
                {detail?.current_price != null
                  ? formatPrice(detail.current_price)
                  : "-"}
              </td>
              <td className="price-buynow">
                {detail?.buy_now_price != null
                  ? formatPrice(detail.buy_now_price)
                  : "-"}
              </td>
              <td style={{ fontSize: 13 }}>-</td>
            </tr>
          </tbody>
        </table>

        {/* 価格計算テーブル */}
        <table className="table" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>販売価格</th>
              <th>予想落札価格</th>
              <th>Amazon手数料</th>
              <th>送料</th>
              <th>その他手数料</th>
              <th>利益額</th>
              <th>利益率</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, fontSize: 14 }}>
                {sellingPrice > 0 ? sellingPrice.toLocaleString() : "-"}
              </td>
              <td>
                <input
                  type="number"
                  value={expectedWinningPrice || ""}
                  onChange={(e) =>
                    setExpectedWinningPrice(Number(e.target.value))
                  }
                  onBlur={() =>
                    recalculate(expectedWinningPrice, shippingCost, otherCost)
                  }
                  style={inputStyle}
                />
              </td>
              <td style={{ fontSize: 13 }}>
                {pricing ? pricing.amazon_fee.toLocaleString() : "-"}
              </td>
              <td>
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(Number(e.target.value))}
                  onBlur={() =>
                    recalculate(expectedWinningPrice, shippingCost, otherCost)
                  }
                  style={inputStyle}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={otherCost}
                  onChange={(e) => setOtherCost(Number(e.target.value))}
                  onBlur={() =>
                    recalculate(expectedWinningPrice, shippingCost, otherCost)
                  }
                  style={inputStyle}
                />
              </td>
              <td>
                {pricing ? (
                  <span
                    className={
                      pricing.profit >= 0
                        ? "profit-positive"
                        : "profit-negative"
                    }
                    style={{ fontSize: 14, fontWeight: 700 }}
                  >
                    {pricing.profit.toLocaleString()}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td>
                {pricing ? (
                  <span
                    className={
                      pricing.profit_rate >= 0
                        ? "profit-positive"
                        : "profit-negative"
                    }
                    style={{ fontSize: 14, fontWeight: 700 }}
                  >
                    {pricing.profit_rate}%
                  </span>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 落札履歴 */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
          落札履歴
          <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>
            (キーワード: {historyKeyword})
          </span>
          <a
            href={yahooHistoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#1976d2",
              fontSize: 12,
              fontWeight: 400,
              marginLeft: 12,
            }}
          >
            ヤフオクで見る
          </a>
        </h3>

        {history && history.results.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>オークション名</th>
                <th style={{ textAlign: "right", width: 100 }}>落札価格</th>
                <th style={{ width: 130 }}>落札日時</th>
              </tr>
            </thead>
            <tbody>
              {history.results.slice(0, 20).map((r) => (
                <tr key={r.auction_id}>
                  <td style={{ fontSize: 13 }}>{r.title}</td>
                  <td
                    className="price"
                    style={{ textAlign: "right", fontSize: 13 }}
                  >
                    {r.winning_price.toLocaleString()}
                  </td>
                  <td style={{ fontSize: 12, color: "#888" }}>
                    {r.end_date
                      ? r.end_date
                          .slice(0, 16)
                          .replace("T", " ")
                          .replace(/-/g, "/")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#999", fontSize: 13 }}>
            落札履歴が見つかりませんでした
          </div>
        )}
      </div>

      {/* Amazon出品 */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
          Amazon出品
        </h3>

        {/* 横一列フォームテーブル */}
        <table className="table" style={{ tableLayout: "fixed", marginBottom: 14 }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>型番 (SKU)</th>
              <th>サブコンディション</th>
              <th>リードタイム</th>
              <th>監視数</th>
              <th>販売価格</th>
              <th>前回価格</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                />
              </td>
              <td>
                <select
                  value={subCondition}
                  onChange={(e) => setSubCondition(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <option value="中古 - ほぼ新品">ほぼ新品</option>
                  <option value="中古 - 非常に良い">非常に良い</option>
                  <option value="中古 - 良い">良い</option>
                  <option value="中古 - 可">可</option>
                </select>
              </td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    value={leadTime}
                    onChange={(e) =>
                      setLeadTime(parseInt(e.target.value, 10) || 8)
                    }
                    min={1}
                    max={30}
                    style={{
                      width: 48,
                      padding: "4px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  />
                  <span style={{ fontSize: 12 }}>日</span>
                </div>
              </td>
              <td style={{ fontSize: 13, textAlign: "center", color: "#555" }}>
                1
              </td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    value={listingPrice || ""}
                    onChange={(e) => setListingPrice(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                  <span style={{ fontSize: 12 }}>円</span>
                </div>
              </td>
              <td style={{ fontSize: 13, color: "#bbb", textAlign: "center" }}>
                -
              </td>
            </tr>
          </tbody>
        </table>

        {/* 説明文 + テンプレート + 出品ボタン */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            {templates.length > 0 && (
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{
                  marginBottom: 6,
                  padding: "4px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 12,
                  width: "100%",
                }}
              >
                <option value="">テンプレートを選択...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="商品説明を入力..."
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 12,
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flexShrink: 0, paddingTop: templates.length > 0 ? 32 : 0 }}>
            <button
              type="button"
              onClick={handleListing}
              disabled={submitting}
              style={{
                background: submitting ? "#aaa" : "#2e7d32",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 28px",
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {submitting ? "出品中..." : "出品する"}
            </button>
          </div>
        </div>

        {listingMessage && (
          <div
            style={{
              marginTop: 10,
              background: listingMessage.startsWith("出品準備完了")
                ? "#e8f5e9"
                : "#fbe9e7",
              color: listingMessage.startsWith("出品準備完了")
                ? "#2e7d32"
                : "#bf360c",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {listingMessage}
          </div>
        )}
      </div>
    </div>
  );
}
