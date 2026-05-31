import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import { KeepaGraph } from "../components/KeepaGraph";
import type { PriceDiffResponse, PriceDiffRow } from "../types";

const PLACEHOLDER = `① Amazonのカテゴリ/検索/ランキングURL（全ASINを自動収集）
  例: https://www.amazon.co.jp/s?k=家電
  例: https://www.amazon.co.jp/gp/bestsellers/appliances（売れ筋ランキング）

② ブログ記事などのURL（中のAmazon商品リンクからASINを収集）

③ ASIN を改行・スペースで複数指定
  例:
  B09XYDQZV6
  B08N5WRWNW`;

function MemoField({ asin }: { asin: string }) {
  const key = `sedori-memo-${asin}`;
  const [val, setVal] = useState(() => localStorage.getItem(key) ?? "");
  return (
    <textarea
      value={val}
      maxLength={100}
      placeholder="メモ（100文字まで）"
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => localStorage.setItem(key, val)}
      rows={3}
      style={{
        width: "100%",
        fontSize: 12,
        border: "1px solid #ddd",
        borderRadius: 4,
        padding: "4px 6px",
        resize: "vertical",
        boxSizing: "border-box",
      }}
    />
  );
}

function ResultRow({ r }: { r: PriceDiffRow }) {
  const isChance = r.profit_rate != null && r.profit_rate >= 15 && (r.profit ?? 0) > 0;

  return (
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "150px 460px 1fr 200px",
        gap: 14,
        marginBottom: 14,
        alignItems: "start",
        borderLeft: isChance ? "4px solid #2e7d32" : "4px solid transparent",
      }}
    >
      {/* 1. 画像 + JAN/ASIN */}
      <div style={{ textAlign: "center" }}>
        {r.amazon_image ? (
          <img
            src={r.amazon_image}
            alt=""
            style={{ width: 96, height: 96, objectFit: "contain", border: "1px solid #eee", borderRadius: 4 }}
          />
        ) : (
          <div style={{ width: 96, height: 96, background: "#f5f5f5", borderRadius: 4, margin: "0 auto" }} />
        )}
        <div style={{ fontSize: 11, color: "#666", marginTop: 6, textAlign: "left" }}>
          <div>
            <span style={{ color: "#999" }}>ASIN </span>
            <a href={`https://www.amazon.co.jp/dp/${r.asin}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>
              {r.asin}
            </a>
          </div>
          {r.jan && (
            <div>
              <span style={{ color: "#999" }}>JAN </span>
              {r.jan}
            </div>
          )}
        </div>
      </div>

      {/* 2. Keepaグラフ + 商品名 */}
      <div style={{ minWidth: 0 }}>
        <a
          href={`https://www.amazon.co.jp/dp/${r.asin}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: "#1976d2", display: "block", marginBottom: 6, lineHeight: 1.4 }}
        >
          {r.amazon_title
            ? r.amazon_title.length > 70
              ? `${r.amazon_title.slice(0, 70)}...`
              : r.amazon_title
            : "(タイトル取得失敗)"}
        </a>
        <KeepaGraph asin={r.asin} width={440} height={150} />
      </div>

      {/* 3. 価格比較（Amazon販売 vs ヤフオク仕入れ複数） */}
      <div style={{ fontSize: 12 }}>
        {r.error ? (
          <div style={{ color: "#c62828" }}>{r.error}</div>
        ) : (
          <>
            <div style={{ marginBottom: 6 }}>
              <span style={{ background: "#ff9900", color: "#fff", borderRadius: 3, padding: "1px 6px", fontSize: 11 }}>
                Amazon販売
              </span>{" "}
              <strong className="price-buynow" style={{ fontSize: 14 }}>
                {r.amazon_price != null ? formatPrice(r.amazon_price) : "-"}
              </strong>
            </div>
            <div style={{ color: "#666", marginBottom: 4 }}>
              ヤフオク仕入れ（相場 中央値{" "}
              <strong className="price">{r.best_yahoo_price != null ? formatPrice(r.best_yahoo_price) : "-"}</strong>
              ・{r.yahoo_count}件）
            </div>
            <table className="table" style={{ marginBottom: 0 }}>
              <tbody>
                {r.yahoo_listings.map((y, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11 }}>
                      <a href={y.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>
                        {y.title.length > 30 ? `${y.title.slice(0, 30)}...` : y.title}
                      </a>
                    </td>
                    <td className="price" style={{ fontSize: 12, whiteSpace: "nowrap", textAlign: "right" }}>
                      {y.price != null ? formatPrice(y.price) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.profit != null && (
              <div style={{ marginTop: 8 }}>
                想定利益{" "}
                <strong className={r.profit >= 0 ? "profit-positive" : "profit-negative"} style={{ fontSize: 15 }}>
                  {formatPrice(r.profit)}
                </strong>{" "}
                <span className={r.profit_rate != null && r.profit_rate >= 0 ? "profit-positive" : "profit-negative"} style={{ fontWeight: 700 }}>
                  （{r.profit_rate}%）
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. メモ */}
      <div>
        <MemoField asin={r.asin} />
      </div>
    </div>
  );
}

type FilterKey = "all" | "profit1000" | "rate10" | "both";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "profit1000", label: "利益¥1,000以上" },
  { key: "rate10", label: "利益率10%以上" },
  { key: "both", label: "¥1,000以上 かつ 10%以上" },
];

function passesFilter(r: PriceDiffRow, f: FilterKey): boolean {
  const profit = r.profit ?? -Infinity;
  const rate = r.profit_rate ?? -Infinity;
  switch (f) {
    case "profit1000":
      return profit >= 1000;
    case "rate10":
      return rate >= 10;
    case "both":
      return profit >= 1000 && rate >= 10;
    default:
      return true;
  }
}

export function PriceDiff() {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PriceDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

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
        Amazon一覧ページURL・ブログ記事URL・ASINリストから、ヤフオク相場との価格差を一気に算出します。
        各商品にKeepaの価格推移グラフを表示します。
        <br />
        <span style={{ fontSize: 12, color: "#999" }}>
          ※ 同一商品（型番/ブランド+容量一致）のみ対象。相場は中央値で、別ジャンル・別容量・セット品・ジャンクは除外。
        </span>
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
        <button type="button" className="btn btn-primary" onClick={handleSearch} disabled={loading || !query.trim()}>
          {loading ? "検索中...（収集と価格調査に少し時間がかかります）" : "価格差を一括検索"}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {loading && <div className="loading">Amazonから収集 → ヤフオク相場を調査中...</div>}

      {!loading && data && (
        <>
          {/* フィルタ設定 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#666", marginRight: 4 }}>フィルタ:</span>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`btn btn-sm ${filter === f.key ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {(() => {
            const filtered = data.items.filter((r) => passesFilter(r, filter));
            return (
              <>
                <div style={{ marginBottom: 10, fontSize: 13, color: "#666" }}>
                  {data.mode === "url" ? "URLから自動収集" : "ASIN指定"} ・ 検索結果{" "}
                  <strong>{data.total}</strong>件中{" "}
                  <strong>{filtered.length}</strong>件を表示（利益率の高い順）
                </div>
                {filtered.length === 0 ? (
                  <div className="card">
                    <p style={{ color: "#999" }}>条件に合う商品がありません。</p>
                  </div>
                ) : (
                  filtered.map((r) => <ResultRow key={r.asin} r={r} />)
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
