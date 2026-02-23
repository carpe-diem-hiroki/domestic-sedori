import { formatPrice } from "../utils/format";
import type { PricingResult } from "../types";

interface PricingPanelProps {
  pricing: PricingResult | null;
  sellingPrice: number;
  onSellingPriceChange: (price: number) => void;
  onRecalculate: () => void;
}

export function PricingPanel({
  pricing,
  sellingPrice,
  onSellingPriceChange,
  onRecalculate,
}: PricingPanelProps) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
        価格計算
      </h3>
      {pricing ? (
        <div style={{ fontSize: 13 }}>
          <div className="form-group">
            <label>販売価格</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                className="form-input"
                title="販売価格"
                value={sellingPrice}
                onChange={(e) => onSellingPriceChange(parseInt(e.target.value, 10) || 0)}
                style={{ width: 150 }}
              />
              <button className="btn btn-secondary" onClick={onRecalculate}>
                再計算
              </button>
            </div>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <tbody>
              <tr><td>予想落札価格</td><td className="price">{formatPrice(pricing.expected_winning_price)}</td></tr>
              <tr><td>Amazon手数料 ({(pricing.amazon_fee_rate * 100).toFixed(0)}%)</td><td>{formatPrice(pricing.amazon_fee)}</td></tr>
              <tr><td>送料</td><td>{formatPrice(pricing.shipping_cost)}</td></tr>
              <tr><td>その他</td><td>{formatPrice(pricing.other_cost)}</td></tr>
              <tr style={{ fontWeight: 600 }}>
                <td>利益</td>
                <td className={pricing.profit >= 0 ? "profit-positive" : "profit-negative"}>
                  {formatPrice(pricing.profit)}
                </td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td>利益率</td>
                <td className={pricing.profit_rate >= 0 ? "profit-positive" : "profit-negative"}>
                  {pricing.profit_rate}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ color: "#999" }}>計算中...</div>
      )}
    </div>
  );
}
