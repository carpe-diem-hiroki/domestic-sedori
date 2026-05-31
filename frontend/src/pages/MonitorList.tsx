import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { MonitorItem } from "../types";

const FILTER_LABELS: Record<string, string> = {
  ending_soon: "終了間近",
  no_bids: "入札なし",
  has_bids: "入札あり",
  has_buynow: "即決あり",
};

export function MonitorList() {
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "";

  const [items, setItems] = useState<MonitorItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");
  const api = useApi();

  useEffect(() => {
    setLoading(true);
    api
      .listMonitors("active")
      .then((data) => setItems(data.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込みに失敗しました")
      )
      .finally(() => setLoading(false));
  }, [api]);

  const handleRemove = async () => {
    if (removeTarget == null) return;
    try {
      await api.removeMonitor(removeTarget);
      setItems((prev) => prev.filter((item) => item.id !== removeTarget));
      setRemoveTarget(null);
      setRemoveError("");
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "解除に失敗しました");
      setRemoveTarget(null);
    }
  };

  // クライアントサイドフィルタリング（カテゴリ + キーワード）
  const filteredItems = (() => {
    let result = items;

    // カテゴリフィルター
    switch (filter) {
      case "has_buynow":
        result = result.filter((item) => item.buy_now_price != null);
        break;
      case "ending_soon":
      case "no_bids":
      case "has_bids":
      default:
        break;
    }

    // キーワード検索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.product_title.toLowerCase().includes(q) ||
          item.auction_title.toLowerCase().includes(q) ||
          item.asin.toLowerCase().includes(q)
      );
    }

    return result;
  })();

  const filterLabel = filter ? FILTER_LABELS[filter] : null;
  const needsBackendNote =
    filter === "ending_soon" ||
    filter === "no_bids" ||
    filter === "has_bids";

  return (
    <div>
      <h2 className="page-title">
        監視中の商品
        {filterLabel && (
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "#888",
              marginLeft: 10,
            }}
          >
            / {filterLabel}
          </span>
        )}
      </h2>

      {/* 検索バー */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          className="form-input"
          placeholder="商品名・ASIN・オークションタイトルで検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 480 }}
        />
      </div>

      {loading && <div className="loading">読み込み中...</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && !error && needsBackendNote && (
        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #ffe082",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            color: "#795548",
            marginBottom: 12,
          }}
        >
          このフィルターはリアルタイムデータが必要です。現在は全件表示しています。
        </div>
      )}

      {removeError && (
        <div className="error-msg" style={{ marginBottom: 12 }}>
          {removeError}
        </div>
      )}

      {!loading && !error && filteredItems.length === 0 ? (
        <div className="card">
          <p style={{ color: "#999" }}>
            {filter
              ? "条件に一致する商品がありません。"
              : "監視対象がありません。ヤフオクページから追加してください。"}
          </p>
        </div>
      ) : !loading && !error ? (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Amazon商品</th>
                <th>ヤフオク</th>
                <th>現在価格</th>
                <th>即決</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontSize: 12, color: "#999" }}>
                      {item.asin}
                    </div>
                    <div style={{ fontSize: 13 }}>{item.product_title}</div>
                  </td>
                  <td>
                    <Link
                      to={`/monitors/${item.id}`}
                      style={{ fontSize: 13, color: "#1976d2" }}
                    >
                      {item.auction_title.length > 30
                        ? `${item.auction_title.slice(0, 30)}...`
                        : item.auction_title}
                    </Link>
                  </td>
                  <td className="price">{formatPrice(item.current_price)}</td>
                  <td className="price-buynow">
                    {formatPrice(item.buy_now_price)}
                  </td>
                  <td>
                    <span className={`badge badge-${item.status}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setRemoveTarget(item.id)}
                    >
                      解除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {removeTarget != null && (
        <ConfirmDialog
          message="監視を解除しますか？"
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
