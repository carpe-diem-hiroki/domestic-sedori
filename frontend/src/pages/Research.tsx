import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { SearchResult } from "../types";

export function Research() {
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const api = useApi();

  // 監視追加モーダル
  const [addTarget, setAddTarget] = useState<SearchResult | null>(null);
  const [addAsin, setAddAsin] = useState("");
  const [addProductTitle, setAddProductTitle] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addMessage, setAddMessage] = useState("");

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.searchYahoo(keyword.trim());
      setResults(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "検索に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = (r: SearchResult) => {
    setAddTarget(r);
    setAddAsin("");
    setAddProductTitle(r.title);
    setAddMessage("");
  };

  const closeAddModal = () => {
    setAddTarget(null);
    setAddAsin("");
    setAddProductTitle("");
    setAddMessage("");
  };

  useEffect(() => {
    if (!addTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAddModal();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [addTarget]);

  const handleAddMonitor = async () => {
    if (!addTarget) return;
    if (!addAsin.trim()) {
      setAddMessage("ASINを入力してください");
      return;
    }
    setAddSubmitting(true);
    setAddMessage("");
    try {
      await api.addMonitor({
        asin: addAsin.trim(),
        product_title: addProductTitle || addTarget.title,
        auction_id: addTarget.auction_id,
        auction_title: addTarget.title,
        current_price: addTarget.current_price,
        buy_now_price: addTarget.buy_now_price,
        url: addTarget.url,
      });
      setAddMessage("監視対象に追加しました");
      setTimeout(closeAddModal, 1200);
    } catch (err) {
      setAddMessage(
        `追加失敗: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">リサーチ</h2>

      <div className="search-bar">
        <input
          type="text"
          className="form-input"
          placeholder="キーワードまたは型番を入力（例: TH-32J300）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? "検索中..." : "ヤフオク検索"}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading && <div className="loading">ヤフオクを検索中...</div>}

      {!loading && results.length > 0 && (
        <div className="card">
          <div style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
            {results.length}件の結果
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r) => (
              <div key={r.auction_id} className="auction-card">
                <div className="auction-card-img">
                  {r.image_url && <img src={r.image_url} alt="" />}
                </div>
                <div className="auction-card-info">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="auction-card-title"
                  >
                    {r.title}
                  </a>
                  <div className="auction-card-meta">
                    <span className="price">
                      現在: {formatPrice(r.current_price)}
                    </span>
                    {r.buy_now_price && (
                      <span className="price-buynow">
                        即決: {formatPrice(r.buy_now_price)}
                      </span>
                    )}
                    <span>残り: {r.end_time_text || "-"}</span>
                    <span>入札: {r.bid_count ?? 0}</span>
                  </div>
                </div>
                <div className="auction-card-actions">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => openAddModal(r)}
                  >
                    監視追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 監視追加モーダル */}
      {addTarget && (
        <div
          role="dialog"
          aria-label="監視対象に追加"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAddModal();
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              width: 400,
              maxWidth: "90vw",
            }}
          >
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>監視対象に追加</h3>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
              {addTarget.title}
            </div>

            <div className="form-group">
              <label>Amazon ASIN</label>
              <input
                type="text"
                className="form-input"
                placeholder="例: B09XYDQZV6"
                value={addAsin}
                onChange={(e) => setAddAsin(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Amazon商品タイトル</label>
              <input
                type="text"
                className="form-input"
                placeholder="Amazonの商品名"
                value={addProductTitle}
                onChange={(e) => setAddProductTitle(e.target.value)}
              />
            </div>

            {addMessage && (
              <div
                style={{
                  padding: 8,
                  borderRadius: 6,
                  fontSize: 12,
                  marginBottom: 8,
                  background: addMessage.startsWith("監視対象に") ? "#e8f5e9" : "#fbe9e7",
                  color: addMessage.startsWith("監視対象に") ? "#2e7d32" : "#bf360c",
                }}
              >
                {addMessage}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddMonitor}
                disabled={addSubmitting}
              >
                {addSubmitting ? "追加中..." : "追加"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAddModal}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
