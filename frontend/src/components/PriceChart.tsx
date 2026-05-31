import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApi } from "../hooks/useApi";
import type { SnapshotPoint } from "../types";

interface PriceChartProps {
  linkId: number;
}

const RANGES = [
  { days: 7, label: "7日" },
  { days: 30, label: "30日" },
  { days: 90, label: "90日" },
];

/** ISO日時を "M/D" 形式に短縮 */
function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function PriceChart({ linkId }: PriceChartProps) {
  const api = useApi();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SnapshotPoint[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    api
      .getSnapshots(linkId, days)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "取得に失敗しました")
      );
  }, [linkId, days, api]);

  const chartData = (data ?? []).map((p) => ({
    label: formatDay(p.captured_at),
    yahoo: p.yahoo_price,
    amazon: p.amazon_price,
    profit: p.profit_rate,
  }));

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 14, color: "#666", margin: 0 }}>価格推移</h3>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              className={`btn btn-sm ${
                days === r.days ? "btn-primary" : "btn-secondary"
              }`}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="error-msg">{error}</div>
      ) : data === null ? (
        <div className="loading" style={{ padding: 40 }}>
          読み込み中...
        </div>
      ) : chartData.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#aaa",
            fontSize: 13,
          }}
        >
          まだ価格データがありません。
          <br />
          監視を続けると、毎回のチェックごとにグラフへ記録されます。
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="price"
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(value, name) => {
                if (value == null) return ["-", name];
                const num = Number(value);
                if (name === "想定利益率") return [`${num}%`, name];
                return [`¥${num.toLocaleString()}`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="yahoo"
              name="ヤフオク相場"
              stroke="#1976d2"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="amazon"
              name="Amazon販売価格"
              stroke="#d32f2f"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="profit"
              name="想定利益率"
              stroke="#4caf50"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
