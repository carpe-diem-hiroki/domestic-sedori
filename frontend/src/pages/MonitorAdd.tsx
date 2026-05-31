import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { formatPrice } from "../utils/format";
import type { AuctionDetail, AmazonProduct } from "../types";

export function MonitorAdd() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const api = useApi();

  // URL params from extension
  const auctionId = searchParams.get("auction_id") || "";
  const auctionTitleParam = searchParams.get("auction_title") || "";
  const currentPriceParam = searchParams.get("current_price") || "";
  const buyNowPriceParam = searchParams.get("buy_now_price") || "";
  const urlParam = searchParams.get("url") || "";

  // Yahoo auction detail (fetched)
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(!!auctionId);

  // Amazon ASIN
  const [asin, setAsin] = useState(searchParams.get("asin") || "");
  const [productTitle, setProductTitle] = useState(
    searchParams.get("product_title") || ""
  );
  const [amazonProduct, setAmazonProduct] = useState<AmazonProduct | null>(null);
  const [amazonLoading, setAmazonLoading] = useState(false);
  const [amazonError, setAmazonError] = useState("");

  // Image gallery
  const [imgIdx, setImgIdx] = useState(0);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fetch Yahoo detail on load
  useEffect(() => {
    if (!auctionId) return;
    api
      .getDetail(auctionId)
      .then((d) => {
        setDetail(d);
        setDetailLoading(false);
      })
      .catch(() => setDetailLoading(false));
  }, [auctionId]);

  // Fetch Amazon product by ASIN
  const fetchAmazon = async () => {
    const cleanAsin = asin.trim().toUpperCase();
    if (!cleanAsin) return;
    setAmazonLoading(true);
    setAmazonError("");
    try {
      const p = await api.getAmazonProduct(cleanAsin);
      setAmazonProduct(p);
      if (!productTitle && p.title) setProductTitle(p.title);
    } catch {
      setAmazonProduct(null);
      setAmazonError("Amazon商品が見つかりません");
    } finally {
      setAmazonLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asin.trim() || !auctionId) {
      setError("ASINとオークションIDは必須です");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const monitor = await api.addMonitor({
        asin: asin.trim().toUpperCase(),
        product_title:
          productTitle || detail?.title || auctionTitleParam,
        auction_id: auctionId,
        auction_title: detail?.title || auctionTitleParam,
        current_price:
          detail?.current_price ??
          (currentPriceParam ? parseInt(currentPriceParam, 10) : null),
        buy_now_price:
          detail?.buy_now_price ??
          (buyNowPriceParam ? parseInt(buyNowPriceParam, 10) : null),
        url: urlParam || null,
      });
      navigate(`/monitors/${monitor.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const images = detail?.image_urls ?? [];
  const displayTitle = detail?.title || auctionTitleParam;
  const displayPrice =
    detail?.current_price ??
    (currentPriceParam ? parseInt(currentPriceParam, 10) : null);
  const displayBuyNow =
    detail?.buy_now_price ??
    (buyNowPriceParam ? parseInt(buyNowPriceParam, 10) : null);

  return (
    <div>
      <h2 className="page-title">監視対象に追加</h2>

      <div className="grid-2">
        {/* 左カラム: ヤフオク商品 */}
        <div>
          <div className="card">
            {/* 写真ギャラリー */}
            {detailLoading ? (
              <div className="loading" style={{ padding: 24 }}>
                読み込み中...
              </div>
            ) : images.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                {/* メイン画像 */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    paddingBottom: "100%",
                    background: "#f0f0f0",
                    borderRadius: 8,
                    overflow: "hidden",
                    marginBottom: 8,
                  }}
                >
                  <img
                    src={images[imgIdx]}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setImgIdx(
                            (imgIdx - 1 + images.length) % images.length
                          )
                        }
                        style={{
                          position: "absolute",
                          left: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "rgba(0,0,0,0.45)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "50%",
                          width: 36,
                          height: 36,
                          cursor: "pointer",
                          fontSize: 22,
                          lineHeight: 1,
                        }}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setImgIdx((imgIdx + 1) % images.length)
                        }
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "rgba(0,0,0,0.45)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "50%",
                          width: 36,
                          height: 36,
                          cursor: "pointer",
                          fontSize: 22,
                          lineHeight: 1,
                        }}
                      >
                        ›
                      </button>
                      <span
                        style={{
                          position: "absolute",
                          bottom: 8,
                          right: 8,
                          background: "rgba(0,0,0,0.5)",
                          color: "#fff",
                          borderRadius: 10,
                          padding: "2px 8px",
                          fontSize: 12,
                        }}
                      >
                        {imgIdx + 1} / {images.length}
                      </span>
                    </>
                  )}
                </div>

                {/* サムネイル */}
                {images.length > 1 && (
                  <div
                    style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                  >
                    {images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        onClick={() => setImgIdx(i)}
                        style={{
                          width: 52,
                          height: 52,
                          objectFit: "cover",
                          borderRadius: 4,
                          cursor: "pointer",
                          border:
                            i === imgIdx
                              ? "2px solid #ff5722"
                              : "2px solid transparent",
                          opacity: i === imgIdx ? 1 : 0.7,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* オークション情報 */}
            <h3
              style={{ fontSize: 14, color: "#666", marginBottom: 10 }}
            >
              ヤフオク情報
            </h3>
            <div style={{ fontSize: 13 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  marginBottom: 10,
                  lineHeight: 1.4,
                }}
              >
                {displayTitle}
              </div>

              {/* 価格行 */}
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {displayPrice != null && (
                  <div>
                    <span style={{ color: "#888" }}>現在価格: </span>
                    <span className="price">
                      {formatPrice(displayPrice)}
                    </span>
                  </div>
                )}
                {displayBuyNow != null && (
                  <div>
                    <span style={{ color: "#888" }}>即決: </span>
                    <span className="price-buynow">
                      {formatPrice(displayBuyNow)}
                    </span>
                  </div>
                )}
                {detail?.bid_count != null && (
                  <div>
                    <span style={{ color: "#888" }}>入札: </span>
                    {detail.bid_count}件
                  </div>
                )}
              </div>

              {/* 詳細グリッド */}
              {detail && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "6px 12px",
                    marginBottom: 10,
                  }}
                >
                  {detail.condition && (
                    <>
                      <span style={{ color: "#888" }}>状態</span>
                      <span>{detail.condition}</span>
                    </>
                  )}
                  {detail.shipping_info && (
                    <>
                      <span style={{ color: "#888" }}>送料</span>
                      <span>{detail.shipping_info}</span>
                    </>
                  )}
                  {detail.seller_name && (
                    <>
                      <span style={{ color: "#888" }}>出品者</span>
                      <span>{detail.seller_name}</span>
                    </>
                  )}
                  {detail.end_time && (
                    <>
                      <span style={{ color: "#888" }}>終了</span>
                      <span>{detail.end_time}</span>
                    </>
                  )}
                  {detail.category && (
                    <>
                      <span style={{ color: "#888" }}>カテゴリ</span>
                      <span>{detail.category}</span>
                    </>
                  )}
                </div>
              )}

              {urlParam && (
                <a
                  href={urlParam}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#1976d2", fontSize: 12 }}
                >
                  ヤフオクで見る
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 右カラム: Amazon紐づけ + 追加ボタン */}
        <div>
          <div className="card">
            <h3
              style={{ fontSize: 14, color: "#666", marginBottom: 16 }}
            >
              Amazon商品を紐づける
            </h3>

            <form onSubmit={handleSubmit}>
              {/* ASIN入力 */}
              <div className="form-group">
                <label>Amazon ASIN *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="例: B09XYDQZV6"
                    value={asin}
                    onChange={(e) =>
                      setAsin(e.target.value.toUpperCase())
                    }
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={fetchAmazon}
                    disabled={amazonLoading || !asin.trim()}
                  >
                    {amazonLoading ? "検索中..." : "検索"}
                  </button>
                </div>
                {amazonError && (
                  <div
                    style={{
                      color: "#d32f2f",
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {amazonError}
                  </div>
                )}
              </div>

              {/* Amazon商品プレビュー */}
              {amazonProduct && (
                <div
                  style={{
                    background: "#f0f7ff",
                    border: "1px solid #bbdefb",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                  >
                    {amazonProduct.image_url && (
                      <img
                        src={amazonProduct.image_url}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: "contain",
                          borderRadius: 4,
                          flexShrink: 0,
                          background: "#fff",
                        }}
                      />
                    )}
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          marginBottom: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {amazonProduct.title}
                      </div>
                      {amazonProduct.price != null && (
                        <div className="price">
                          {formatPrice(amazonProduct.price)}
                        </div>
                      )}
                      {amazonProduct.brand && (
                        <div style={{ color: "#888", fontSize: 12 }}>
                          {amazonProduct.brand}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 商品タイトル */}
              <div className="form-group">
                <label>Amazon商品タイトル</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Amazonの商品名（自動入力されます）"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                />
              </div>

              {error && (
                <div className="error-msg" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* 追加ボタン */}
              <button
                type="submit"
                className="btn btn-success"
                disabled={submitting || !asin.trim()}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: 16,
                  borderRadius: 8,
                }}
              >
                {submitting ? "追加中..." : "監視対象に追加する"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
