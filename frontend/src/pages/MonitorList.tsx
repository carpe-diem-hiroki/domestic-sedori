import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { MonitorItem } from "../types";

export function MonitorList() {
  const [items, setItems] = useState<MonitorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");
  const api = useApi();

  useEffect(() => {
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

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <h2 className="page-title">監視中の商品</h2>

      {removeError && (
        <div className="error-msg" style={{ marginBottom: 12 }}>{removeError}</div>
      )}

      {items.length === 0 ? (
        <div className="card">
          <p style={{ color: "#999" }}>
            監視対象がありません。リサーチ画面から追加してください。
          </p>
        </div>
      ) : (
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
      )}

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
