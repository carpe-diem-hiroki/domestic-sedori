import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { PriceDiffResponse } from "../types";

const PLACEHOLDER = `Amazonのカテゴリ/検索ページのURLを貼り付け（自動でASINを収集）
例: https://www.amazon.co.jp/s?k=家電

または ASIN を改行・スペースで複数指定
例:
B09XYDQZV6
B08N5WRWNW`;

export function PriceDiff() {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PriceDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await api.bulkPriceDiff(query.trim());
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">💹 価格差検索（一括）</h2>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 12 }}>
        Amazon一覧ページのURLを貼ると、そのページの全商品ASINを自動収集して
        ヤフオク相場との価格差を一気に算出します。ASINの直接貼り付けも可能です。
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={5}
          placeholder={PLACEHOLDER}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 10,
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading ? "検索中...（収集と価格調査に少し時間がかかります）" : "価格差を一括検索"}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {loading && (
        <div className="loading">
          Amazonから収集 → ヤフオク相場を調査中...
        </div>
      )}

      {!loading && data && (
        <div className="card">
          <div style={{ marginBottom: 10, fontSize: 13, color: "#666" }}>
            {data.mode === "url" ? "URLから自動収集" : "ASIN指定"} ・ {data.total}件
            （利益率の高い順）
          </div>
          {data.items.length === 0 ? (
            <p style={{ color: "#999" }}>結果がありませんでした。</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>商品</th>
                  <th style={{ width: 100 }}>Amazon</th>
                  <th style={{ width: 110 }}>ヤフオク最安</th>
                  <th style={{ width: 100 }}>想定利益</th>
                  <th style={{ width: 80 }}>利益率</th>
                  <th style={{ width: 60 }}>Y!件数</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const isChance =
                    r.profit_rate != null && r.profit_rate >= 15 && (r.profit ?? 0) > 0;
                  return (
                    <tr
                      key={r.asin}
                      style={isChance ? { background: "#f1f8e9" } : undefined}
                    >
                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          {r.amazon_image && (
                            <img
                              src={r.amazon_image}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: "contain",
                                flexShrink: 0,
                                border: "1px solid #eee",
                                borderRadius: 3,
                              }}
                            />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: "#999" }}>{r.asin}</div>
                            <a
                              href={`https://www.amazon.co.jp/dp/${r.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#1976d2", fontSize: 13 }}
                            >
                              {r.amazon_title
                                ? r.amazon_title.length > 44
                                  ? `${r.amazon_title.slice(0, 44)}...`
                                  : r.amazon_title
                                : "(タイトル取得失敗)"}
                            </a>
                            {r.error && (
                              <div style={{ color: "#c62828", fontSize: 11 }}>
                                {r.error}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="price-buynow" style={{ fontSize: 13 }}>
                        {r.amazon_price != null ? formatPrice(r.amazon_price) : "-"}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {r.best_yahoo_price != null ? (
                          r.best_yahoo_url ? (
                            <a
                              href={r.best_yahoo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="price"
                            >
                              {formatPrice(r.best_yahoo_price)}
                            </a>
                          ) : (
                            <span className="price">
                              {formatPrice(r.best_yahoo_price)}
                            </span>
                          )
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {r.profit != null ? (
                          <strong
                            className={
                              r.profit >= 0 ? "profit-positive" : "profit-negative"
                            }
                          >
                            {formatPrice(r.profit)}
                          </strong>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {r.profit_rate != null ? (
                          <span
                            className={
                              r.profit_rate >= 0
                                ? "profit-positive"
                                : "profit-negative"
                            }
                            style={{ fontWeight: 700 }}
                          >
                            {r.profit_rate}%
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.yahoo_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
