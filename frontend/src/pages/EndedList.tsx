import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { MonitorItem } from "../types";

export function EndedList() {
  const [items, setItems] = useState<MonitorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const api = useApi();

  useEffect(() => {
    api
      .listMonitors("ended")
      .then((data) => setItems(data.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込みに失敗しました")
      )
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <h2 className="page-title">終了した商品</h2>

      {items.length === 0 ? (
        <div className="card">
          <p style={{ color: "#999" }}>
            終了したオークションはありません。
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
              {items.map((item) => (
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
                    <span
                      className={`badge ${
                        item.status === "sold" ? "badge-active" : "badge-ended"
                      }`}
                    >
                      {item.status === "sold" ? "落札済" : "終了"}
                    </span>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
