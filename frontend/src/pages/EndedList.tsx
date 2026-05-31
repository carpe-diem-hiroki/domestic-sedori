import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { MonitorItem } from "../types";

const FILTER_LABELS: Record<string, string> = {
  won: "落札済み",
  not_won: "落札なし",
  sold: "売れた",
};

export function EndedList() {
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "";

  const [items, setItems] = useState<MonitorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const api = useApi();

  useEffect(() => {
    setLoading(true);
    api
      .listMonitors("ended")
      .then((data) => setItems(data.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込みに失敗しました")
      )
      .finally(() => setLoading(false));
  }, [api]);

  // クライアントサイドフィルタリング
  const filteredItems = (() => {
    switch (filter) {
      case "won":
        return items.filter((item) => item.status === "won" || item.status === "sold");
      case "not_won":
        return items.filter(
          (item) => item.status !== "won" && item.status !== "sold"
        );
      case "sold":
        return items.filter((item) => item.status === "sold");
      default:
        return items;
    }
  })();

  const filterLabel = filter ? FILTER_LABELS[filter] : null;

  const statusLabel = (status: string) => {
    switch (status) {
      case "won":
        return { text: "落札済", cls: "badge-active" };
      case "sold":
        return { text: "売れた", cls: "badge-active" };
      default:
        return { text: "終了", cls: "badge-ended" };
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <h2 className="page-title">
        終了した商品
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

      {filteredItems.length === 0 ? (
        <div className="card">
          <p style={{ color: "#999" }}>
            {filter
              ? "条件に一致する商品がありません。"
              : "終了したオークションはありません。"}
          </p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Amazon商品</th>
                <th>ヤフオク</th>
                <th>最終価格</th>
                <th>即決</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const { text, cls } = statusLabel(item.status);
                return (
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
                      <span className={`badge ${cls}`}>{text}</span>
                    </td>
                    <td>
                      <Link
                        to={`/monitors/${item.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
