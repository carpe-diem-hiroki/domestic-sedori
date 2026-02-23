import { formatPrice } from "../utils/format";
import type { HistoryResponse } from "../types";

interface AuctionHistoryPanelProps {
  history: HistoryResponse | null;
}

export function AuctionHistoryPanel({ history }: AuctionHistoryPanelProps) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
        落札履歴
        {history && (
          <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>
            ({history.count}件 / 中央値: {formatPrice(history.median_price)})
          </span>
        )}
      </h3>
      {history && history.results.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>落札価格</th>
              <th>終了日</th>
            </tr>
          </thead>
          <tbody>
            {history.results.slice(0, 15).map((h) => (
              <tr key={h.auction_id}>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.title}
                </td>
                <td className="price">{formatPrice(h.winning_price)}</td>
                <td style={{ fontSize: 12 }}>{h.end_date?.slice(0, 10) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: "#999", fontSize: 13 }}>落札履歴なし</div>
      )}
    </div>
  );
}
