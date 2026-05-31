import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { StatsSummary } from "../types";

// サマリー数字カード
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? "#333" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

export function Stats() {
  const api = useApi();
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [data, setData] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .getStats(period)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込みに失敗しました")
      )
      .finally(() => setLoading(false));
  }, [api, period]);

  return (
    <div>
      <h2 className="page-title">
        集計
        <span style={{ marginLeft: 12, display: "inline-flex", gap: 4 }}>
          {(["month", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`btn btn-sm ${
                period === p ? "btn-primary" : "btn-secondary"
              }`}
              onClick={() => setPeriod(p)}
            >
              {p === "month" ? "今月" : "全期間"}
            </button>
          ))}
        </span>
      </h2>

      {loading && <div className="loading">読み込み中...</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && !error && data && (
        <>
          {/* サマリーカード */}
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <StatCard
              label={`売上（${period === "month" ? "今月" : "全期間"}）`}
              value={formatPrice(data.sold.total_sales)}
              sub={`${data.sold.count}件 売却`}
            />
            <StatCard
              label="実績利益"
              value={formatPrice(data.sold.total_profit)}
              sub={`利益率 ${data.sold.avg_profit_rate}%`}
              color={data.sold.total_profit >= 0 ? "#2e7d32" : "#c62828"}
            />
            <StatCard
              label="出品中の在庫"
              value={`${data.inventory.active_count}点`}
              sub={`総額 ${formatPrice(data.inventory.total_price)}`}
            />
            <StatCard
              label="監視中 / 終了"
              value={`${data.monitors.active} / ${data.monitors.ended}`}
            />
          </div>

          {/* 価格帯別 売上・利益 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
              価格帯別の売上・利益（{period === "month" ? "今月" : "全期間"}）
            </h3>
            <table className="table">
              <thead>
                <tr>
                  <th>価格帯（売値）</th>
                  <th style={{ width: 100 }}>売却数</th>
                  <th style={{ width: 140 }}>利益合計</th>
                  <th style={{ width: 100 }}>平均利益率</th>
                </tr>
              </thead>
              <tbody>
                {data.price_bands.map((b) => (
                  <tr key={b.label}>
                    <td style={{ fontSize: 13 }}>{b.label}</td>
                    <td style={{ fontSize: 13 }}>{b.sold_count}件</td>
                    <td>
                      <span
                        className={
                          b.total_profit >= 0
                            ? "profit-positive"
                            : "profit-negative"
                        }
                        style={{ fontWeight: 600 }}
                      >
                        {formatPrice(b.total_profit)}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{b.avg_profit_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>
              ※
              利益率が高い価格帯＝効率が良い帯。売却数が多い帯＝回転が速い帯。両者のバランスで仕入れ方針を判断できます。
            </p>
          </div>

          {/* 直近売れた商品 */}
          <div className="card">
            <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
              直近売れた商品
            </h3>
            {data.recent_sold.length === 0 ? (
              <p style={{ color: "#999", fontSize: 13 }}>
                まだ売却記録がありません。出品ページで「売れた」を記録すると集計されます。
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th style={{ width: 110 }}>売値</th>
                    <th style={{ width: 110 }}>実績利益</th>
                    <th style={{ width: 110 }}>販売日</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_sold.map((s) => (
                    <tr key={s.listing_id}>
                      <td>
                        <div style={{ fontSize: 12, color: "#999" }}>
                          {s.asin}
                        </div>
                        <Link
                          to={`/listings`}
                          style={{ color: "#1976d2", fontSize: 13 }}
                        >
                          {s.product_title.length > 50
                            ? `${s.product_title.slice(0, 50)}...`
                            : s.product_title}
                        </Link>
                      </td>
                      <td className="price" style={{ fontSize: 13 }}>
                        {s.sold_price != null ? formatPrice(s.sold_price) : "-"}
                      </td>
                      <td>
                        {s.actual_profit != null ? (
                          <span
                            className={
                              s.actual_profit >= 0
                                ? "profit-positive"
                                : "profit-negative"
                            }
                            style={{ fontWeight: 600 }}
                          >
                            {formatPrice(s.actual_profit)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {s.sold_date ? s.sold_date.slice(0, 10) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
