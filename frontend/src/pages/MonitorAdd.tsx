import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";

export function MonitorAdd() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const api = useApi();

  const [asin, setAsin] = useState(searchParams.get("asin") || "");
  const [productTitle, setProductTitle] = useState(
    searchParams.get("product_title") || ""
  );
  const [auctionId] = useState(searchParams.get("auction_id") || "");
  const [auctionTitle] = useState(searchParams.get("auction_title") || "");
  const [currentPrice] = useState(searchParams.get("current_price") || "");
  const [buyNowPrice] = useState(searchParams.get("buy_now_price") || "");
  const [url] = useState(searchParams.get("url") || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asin || !auctionId) {
      setError("ASINとオークションIDは必須です");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await api.addMonitor({
        asin,
        product_title: productTitle || auctionTitle,
        auction_id: auctionId,
        auction_title: auctionTitle,
        current_price: currentPrice ? parseInt(currentPrice, 10) : null,
        buy_now_price: buyNowPrice ? parseInt(buyNowPrice, 10) : null,
        url: url || null,
      });
      navigate("/monitors");
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">監視対象に追加</h2>

      <div className="card" style={{ maxWidth: 600 }}>
        {auctionTitle && (
          <div
            style={{
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>ヤフオク商品</div>
            <div>{auctionTitle}</div>
            {currentPrice && (
              <div className="price">現在: {parseInt(currentPrice, 10).toLocaleString()}円</div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Amazon ASIN *</label>
            <input
              type="text"
              className="form-input"
              placeholder="例: B09XYDQZV6"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              pattern="[A-Z0-9]{10}"
              title="ASINは10文字の英数字です"
            />
          </div>

          <div className="form-group">
            <label>Amazon商品タイトル</label>
            <input
              type="text"
              className="form-input"
              placeholder="Amazonの商品名"
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
            />
          </div>

          {error && (
            <div className="error-msg" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "追加中..." : "監視対象に追加"}
          </button>
        </form>
      </div>
    </div>
  );
}
