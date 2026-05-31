import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import type {
  CompetitorOffer,
  ListingItem,
  MonitorItem,
  SearchResult,
} from "../types";

// --- 個別出品カード ---

interface ListingCardProps {
  listing: ListingItem;
  monitors: MonitorItem[];
  onUpdate: (updated: ListingItem) => void;
}

function ListingCard({ listing, monitors, onUpdate }: ListingCardProps) {
  const api = useApi();
  const [competitors, setCompetitors] = useState<CompetitorOffer[] | null>(null);
  const [currentAuctions, setCurrentAuctions] = useState<SearchResult[] | null>(null);
  const [editMode, setEditMode] = useState(false);

  // 編集フォーム
  const [editSku, setEditSku] = useState(listing.sku);
  const [editPrice, setEditPrice] = useState(listing.price);
  const [editCondition, setEditCondition] = useState(listing.sub_condition);
  const [editLeadTime, setEditLeadTime] = useState(listing.lead_time_days);
  const [editDescription, setEditDescription] = useState(listing.description ?? "");
  const [editPurchase, setEditPurchase] = useState(listing.actual_purchase_price ?? 0);
  const [editMinPrice, setEditMinPrice] = useState(listing.min_price ?? 0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // 売却フォーム
  const [soldMode, setSoldMode] = useState(false);
  const [soldPrice, setSoldPrice] = useState(listing.price);
  const [soldShipping, setSoldShipping] = useState(800);
  const [soldSaving, setSoldSaving] = useState(false);
  const [soldError, setSoldError] = useState("");

  useEffect(() => {
    api
      .getCompetitors(listing.asin)
      .then((data) => setCompetitors(data.offers.slice(0, 5)))
      .catch(() => setCompetitors([]));

    const keyword = listing.product_title.split(/\s+/).slice(0, 3).join(" ");
    api
      .searchYahoo(keyword)
      .then((results) => setCurrentAuctions(results.slice(0, 5)))
      .catch(() => setCurrentAuctions([]));
  }, [listing.asin, listing.product_title, api]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await api.updateListing(listing.id, {
        sku: editSku,
        price: editPrice,
        sub_condition: editCondition,
        lead_time_days: editLeadTime,
        description: editDescription || undefined,
        actual_purchase_price: editPurchase > 0 ? editPurchase : undefined,
        min_price: editMinPrice > 0 ? editMinPrice : undefined,
      });
      onUpdate(updated);
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleSold = async () => {
    setSoldSaving(true);
    setSoldError("");
    try {
      const updated = await api.markListingSold(listing.id, {
        sold_price: soldPrice,
        shipping_cost: soldShipping,
      });
      onUpdate(updated);
      setSoldMode(false);
    } catch (err) {
      setSoldError(err instanceof Error ? err.message : "記録に失敗しました");
    } finally {
      setSoldSaving(false);
    }
  };

  // 想定利益（仕入れ値が登録されている場合）= 販売価格 - 仕入れ - 手数料15% - 送料800
  const estimatedProfit =
    listing.actual_purchase_price != null
      ? listing.price -
        listing.actual_purchase_price -
        Math.round(listing.price * 0.15) -
        800
      : null;

  const asinUrl = `https://www.amazon.co.jp/dp/${listing.asin}`;
  const inputCss: React.CSSProperties = {
    width: "100%",
    padding: "3px 6px",
    border: "1px solid #ccc",
    borderRadius: 3,
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {/* ヘッダー：画像 + タイトル + 出品テーブル */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        {listing.image_url ? (
          <img
            src={listing.image_url}
            alt=""
            style={{
              width: 80,
              height: 60,
              objectFit: "cover",
              borderRadius: 4,
              flexShrink: 0,
              border: "1px solid #eee",
            }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 60,
              background: "#f5f5f5",
              borderRadius: 4,
              flexShrink: 0,
              border: "1px solid #eee",
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={asinUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "#1976d2",
              lineHeight: 1.4,
              display: "block",
              marginBottom: 8,
            }}
          >
            {listing.product_title}
          </a>

          <table
            className="table"
            style={{ tableLayout: "fixed", marginBottom: 0 }}
          >
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>ASIN</th>
                <th>SKU</th>
                <th>コンディション</th>
                <th>リードタイム</th>
                <th>販売価格</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontSize: 13 }}>{listing.asin}</td>
                <td style={{ fontSize: 13 }}>{listing.sku}</td>
                <td style={{ fontSize: 13 }}>{listing.sub_condition}</td>
                <td style={{ fontSize: 13 }}>{listing.lead_time_days}日</td>
                <td className="price">{listing.price.toLocaleString()}円</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 説明文 */}
      <div
        style={{
          fontSize: 13,
          color: listing.description ? "#555" : "#bbb",
          background: "#fafafa",
          border: "1px solid #eee",
          borderRadius: 4,
          padding: "8px 10px",
          marginBottom: 12,
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {listing.description || "（説明文なし）"}
      </div>

      {/* 監視中のオークション */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{ fontSize: 13, color: "#666", fontWeight: 600, marginBottom: 6 }}
        >
          監視中のオークション
        </div>
        {monitors.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "#aaa",
              padding: "6px 10px",
              background: "#fafafa",
              border: "1px solid #eee",
              borderRadius: 4,
            }}
          >
            監視中のオークションはありません
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th style={{ width: 90 }}>現在価格</th>
                <th style={{ width: 70 }}>状態</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontSize: 13 }}>
                    {m.auction_title.length > 50
                      ? `${m.auction_title.slice(0, 50)}...`
                      : m.auction_title}
                  </td>
                  <td className="price" style={{ fontSize: 13 }}>
                    {m.current_price != null
                      ? `${m.current_price.toLocaleString()}円`
                      : "-"}
                  </td>
                  <td>
                    <span className={`badge badge-${m.status}`}>{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 実績管理バー */}
      {listing.status === "sold" ? (
        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "center",
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 600, color: "#2e7d32" }}>✓ 売却済み</span>
          {listing.sold_date && (
            <span style={{ color: "#666" }}>
              {listing.sold_date.slice(0, 10)}
            </span>
          )}
          <span>
            売値:{" "}
            <strong className="price">
              {listing.sold_price?.toLocaleString()}円
            </strong>
          </span>
          {listing.actual_purchase_price != null && (
            <span style={{ color: "#666" }}>
              仕入: {listing.actual_purchase_price.toLocaleString()}円
            </span>
          )}
          {listing.actual_profit != null && (
            <span>
              実績利益:{" "}
              <strong
                className={
                  listing.actual_profit >= 0
                    ? "profit-positive"
                    : "profit-negative"
                }
              >
                {listing.actual_profit.toLocaleString()}円
              </strong>
            </span>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "center",
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 13,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#666" }}>
            仕入れ値:{" "}
            {listing.actual_purchase_price != null ? (
              <strong>{listing.actual_purchase_price.toLocaleString()}円</strong>
            ) : (
              <span style={{ color: "#bbb" }}>未登録</span>
            )}
          </span>
          {listing.min_price != null && (
            <span style={{ color: "#666" }}>
              最低価格: {listing.min_price.toLocaleString()}円
            </span>
          )}
          {estimatedProfit != null && (
            <span style={{ color: "#666" }}>
              想定利益:{" "}
              <strong
                className={
                  estimatedProfit >= 0 ? "profit-positive" : "profit-negative"
                }
              >
                {estimatedProfit.toLocaleString()}円
              </strong>
            </span>
          )}
          <button
            type="button"
            className="btn btn-success btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              setSoldMode(!soldMode);
              setSoldPrice(listing.price);
              setSoldError("");
            }}
          >
            💰 売れた
          </button>
        </div>
      )}

      {/* 売却記録フォーム */}
      {soldMode && listing.status !== "sold" && (
        <div
          style={{
            background: "#f1f8e9",
            border: "1px solid #c5e1a5",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
            display: "flex",
            gap: 16,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 4, color: "#666" }}>売れた価格</div>
            <input
              type="number"
              value={soldPrice}
              onChange={(e) => setSoldPrice(Number(e.target.value))}
              style={{ ...inputCss, width: 110 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 4, color: "#666" }}>送料</div>
            <input
              type="number"
              value={soldShipping}
              onChange={(e) => setSoldShipping(Number(e.target.value))}
              style={{ ...inputCss, width: 90 }}
            />
          </label>
          {soldError && (
            <div style={{ fontSize: 13, color: "#bf360c" }}>{soldError}</div>
          )}
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={handleSold}
            disabled={soldSaving}
          >
            {soldSaving ? "記録中..." : "売却を記録"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSoldMode(false)}
          >
            キャンセル
          </button>
        </div>
      )}

      {/* 出品情報を編集ボタン */}
      <div style={{ marginBottom: editMode ? 10 : 12 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setEditMode(!editMode);
            setSaveError("");
          }}
        >
          ✏ 出品情報を編集
        </button>
      </div>

      {/* 編集フォーム */}
      {editMode && (
        <div
          style={{
            background: "#fafafa",
            border: "1px solid #e0e0e0",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <table
            className="table"
            style={{ tableLayout: "fixed", marginBottom: 10 }}
          >
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>SKU</th>
                <th>コンディション</th>
                <th>リードタイム</th>
                <th>販売価格</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <input
                    type="text"
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    style={inputCss}
                  />
                </td>
                <td>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    style={inputCss}
                  >
                    <option value="中古 - ほぼ新品">ほぼ新品</option>
                    <option value="中古 - 非常に良い">非常に良い</option>
                    <option value="中古 - 良い">良い</option>
                    <option value="中古 - 可">可</option>
                  </select>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <input
                      type="number"
                      value={editLeadTime}
                      onChange={(e) =>
                        setEditLeadTime(parseInt(e.target.value, 10) || 8)
                      }
                      min={1}
                      max={30}
                      style={{ ...inputCss, width: 46 }}
                    />
                    <span style={{ fontSize: 13 }}>日</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value))}
                      style={inputCss}
                    />
                    <span style={{ fontSize: 13 }}>円</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 仕入れ値・最低価格 */}
          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              仕入れ値（落札価格）
              <input
                type="number"
                value={editPurchase}
                onChange={(e) => setEditPurchase(Number(e.target.value))}
                style={{ ...inputCss, width: 90 }}
              />
              円
            </label>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              最低価格（値下げ下限）
              <input
                type="number"
                value={editMinPrice}
                onChange={(e) => setEditMinPrice(Number(e.target.value))}
                style={{ ...inputCss, width: 90 }}
              />
              円
            </label>
          </div>

          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={4}
            placeholder="商品説明..."
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 13,
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
              marginBottom: 8,
            }}
          />

          {saveError && (
            <div
              style={{
                fontSize: 13,
                color: "#bf360c",
                background: "#fbe9e7",
                padding: "6px 10px",
                borderRadius: 4,
                marginBottom: 8,
              }}
            >
              {saveError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditMode(false)}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 競合情報 + 現在開催中オークション（2列） */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div
            style={{ fontSize: 13, color: "#666", fontWeight: 600, marginBottom: 6 }}
          >
            競合の出品情報
            {competitors === null && (
              <span style={{ color: "#aaa", fontWeight: 400, marginLeft: 6 }}>
                取得中...
              </span>
            )}
          </div>
          {competitors === null ? (
            <div style={{ fontSize: 13, color: "#bbb" }}>●●● 取得中</div>
          ) : competitors.length === 0 ? (
            <div style={{ fontSize: 13, color: "#aaa" }}>データなし</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>出品者</th>
                  <th>コンディション</th>
                  <th>価格</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13 }}>{c.seller_name ?? "-"}</td>
                    <td style={{ fontSize: 13 }}>{c.condition}</td>
                    <td className="price" style={{ fontSize: 13 }}>
                      {c.total_price.toLocaleString()}円
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div
            style={{ fontSize: 13, color: "#666", fontWeight: 600, marginBottom: 6 }}
          >
            現在開催中のオークション
            {currentAuctions === null && (
              <span style={{ color: "#aaa", fontWeight: 400, marginLeft: 6 }}>
                取得中...
              </span>
            )}
          </div>
          {currentAuctions === null ? (
            <div style={{ fontSize: 13, color: "#bbb" }}>●●● 取得中</div>
          ) : currentAuctions.length === 0 ? (
            <div style={{ fontSize: 13, color: "#aaa" }}>データなし</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th style={{ width: 80 }}>現在価格</th>
                </tr>
              </thead>
              <tbody>
                {currentAuctions.map((a) => (
                  <tr key={a.auction_id}>
                    <td style={{ fontSize: 13 }}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#1976d2" }}
                      >
                        {a.title.length > 35
                          ? `${a.title.slice(0, 35)}...`
                          : a.title}
                      </a>
                    </td>
                    <td className="price" style={{ fontSize: 13 }}>
                      {a.current_price != null
                        ? `${a.current_price.toLocaleString()}円`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// --- 出品一覧ページ ---

export function Listings() {
  const api = useApi();
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [allMonitors, setAllMonitors] = useState<MonitorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.listListings(),
      api.listMonitors("active").then((d) => d.items),
    ])
      .then(([listingsData, monitorsData]) => {
        setListings(listingsData);
        setAllMonitors(monitorsData);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込みに失敗しました")
      )
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <h2 className="page-title">出品</h2>

      {listings.length === 0 ? (
        <div className="card">
          <p style={{ color: "#999" }}>
            出品中の商品はありません。監視商品の詳細画面から出品してください。
          </p>
        </div>
      ) : (
        listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            monitors={allMonitors.filter((m) => m.asin === listing.asin)}
            onUpdate={(updated) =>
              setListings((prev) =>
                prev.map((l) => (l.id === updated.id ? updated : l))
              )
            }
          />
        ))
      )}
    </div>
  );
}
