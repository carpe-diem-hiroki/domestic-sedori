import { useState } from "react";

interface KeepaGraphProps {
  asin: string;
  width?: number;
  height?: number;
  range?: number; // 表示日数
}

/**
 * Keepaの価格推移グラフ（公開画像エンドポイント・APIキー不要＝無料）。
 * Amazon本体価格・新品・売れ筋ランキングを含む履歴を画像で表示する。
 */
export function KeepaGraph({ asin, width = 480, height = 160, range = 90 }: KeepaGraphProps) {
  const [ok, setOk] = useState(true);
  if (!asin) return null;

  const src =
    `https://graph.keepa.com/pricehistory.png?asin=${asin}` +
    `&domain=co.jp&width=${width}&height=${height}&range=${range}` +
    `&amazon=1&new=1&salesrank=1`;

  if (!ok) {
    return (
      <div style={{ fontSize: 12, color: "#aaa" }}>
        Keepaグラフを表示できません（
        <a
          href={`https://keepa.com/#!product/5-${asin}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#1976d2" }}
        >
          Keepaで開く
        </a>
        ）
      </div>
    );
  }

  return (
    <a
      href={`https://keepa.com/#!product/5-${asin}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Keepaで詳細を見る"
    >
      <img
        src={src}
        alt="Keepa価格推移"
        loading="lazy"
        onError={() => setOk(false)}
        style={{
          width: "100%",
          maxWidth: width,
          border: "1px solid #eee",
          borderRadius: 4,
        }}
      />
    </a>
  );
}
