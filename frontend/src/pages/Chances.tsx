import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { ChanceListResponse } from "../types";

export function Chances() {
  const api = useApi();
  const [data, setData] = useState<ChanceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 閾値（ユーザーが調整可能）
  const [minRate, setMinRate] = useState(15);
  const [minAmount, setMinAmount] = useState(1000);

  const load = (rate: number, amount: number) => {
    setLoading(true);
    setError("");
    api
      .listChances(rate, amount)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込みに失敗しました")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(minRate, minAmount);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return (
    <div>
      <h2 className="page-title">
        🔥 仕入れチャンス
        {data && (
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "#888",
              marginLeft: 10,
            }}
          >
            {data.total}件
          </span>
        )}
      </h2>

      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        監視中の商品から、Amazon販売価格とヤフオク現在価格の差が条件を満たすものを自動抽出します。
      </p>

      {/* 閾値フィルター */}
      <div
        className="card"
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-end",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13 }}>
          <div style={{ marginBottom: 4, color: "#666" }}>利益率の下限</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              value={minRate}
              onChange={(e) => setMinRate(Number(e.target.value))}
              className="form-input"
              style={{ width: 90 }}
            />
            <span>%</span>
          </div>
        </label>
        <label style={{ fontSize: 13 }}>
          <div style={{ marginBottom: 4, color: "#666" }}>利益額の下限</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(Number(e.target.value))}
              className="form-input"
              style={{ width: 110 }}
            />
            <span>円</span>
          </div>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => load(minRate, minAmount)}
        >
          再検索
        </button>
      </div>

      {loading && <div className="loading">読み込み中...</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && !error && data && data.items.length === 0 && (
        <div className="card">
          <p style={{ color: "#999" }}>
            条件を満たす仕入れチャンスはありません。
            <br />
            <span style={{ fontSize: 13 }}>
              ※ Amazon価格が未取得の商品は計算対象外です。スケジューラーが価格を取得すると表示されます。
            </span>
          </p>
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>商品</th>
                <th style={{ width: 110 }}>ヤフオク</th>
                <th style={{ width: 110 }}>Amazon</th>
                <th style={{ width: 100 }}>想定利益</th>
                <th style={{ width: 80 }}>利益率</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.link_id}>
                  <td>
                    <div style={{ fontSize: 12, color: "#999" }}>{c.asin}</div>
                    <Link
                      to={`/monitors/${c.link_id}`}
                      style={{ color: "#1976d2", fontSize: 13 }}
                    >
                      {c.product_title.length > 50
                        ? `${c.product_title.slice(0, 50)}...`
                        : c.product_title}
                    </Link>
                  </td>
                  <td className="price" style={{ fontSize: 13 }}>
                    {formatPrice(c.yahoo_price)}
                  </td>
                  <td className="price-buynow" style={{ fontSize: 13 }}>
                    {formatPrice(c.amazon_price)}
                  </td>
                  <td>
                    <strong className="profit-positive" style={{ fontSize: 14 }}>
                      {formatPrice(c.profit)}
                    </strong>
                  </td>
                  <td>
                    <span
                      className="profit-positive"
                      style={{ fontSize: 14, fontWeight: 700 }}
                    >
                      {c.profit_rate}%
                    </span>
                  </td>
                  <td>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#1976d2", fontSize: 12 }}
                      >
                        Y!で見る
                      </a>
                    )}
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
