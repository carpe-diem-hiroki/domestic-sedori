import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { SchedulerStatus } from "../types";

interface FeeRate {
  category: string;
  rate: number;
}

const DEFAULT_FEE_RATES: FeeRate[] = [
  { category: "家電", rate: 8 },
  { category: "ゲーム", rate: 15 },
  { category: "おもちゃ", rate: 10 },
  { category: "その他", rate: 15 },
];

export function Settings() {
  const api = useApi();
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerError, setSchedulerError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    api.getSchedulerStatus().then(setSchedulerStatus).catch(() => null);
  }, [api]);

  const toggleScheduler = async () => {
    setSchedulerLoading(true);
    setSchedulerError("");
    try {
      if (schedulerStatus?.running) {
        await api.stopScheduler();
      } else {
        await api.startScheduler();
      }
      const status = await api.getSchedulerStatus();
      setSchedulerStatus(status);
    } catch (err) {
      setSchedulerError(err instanceof Error ? err.message : "操作に失敗しました");
    }
    setSchedulerLoading(false);
  };

  const runNow = async () => {
    setSchedulerLoading(true);
    setSchedulerError("");
    try {
      await api.runSchedulerNow();
      const status = await api.getSchedulerStatus();
      setSchedulerStatus(status);
    } catch (err) {
      setSchedulerError(err instanceof Error ? err.message : "実行に失敗しました");
    }
    setSchedulerLoading(false);
  };

  const [feeRates, setFeeRates] = useState<FeeRate[]>(() => {
    try {
      const saved = localStorage.getItem("sedori_fee_rates");
      if (!saved) return DEFAULT_FEE_RATES;
      const parsed: unknown = JSON.parse(saved);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (item: unknown) =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as FeeRate).category === "string" &&
            typeof (item as FeeRate).rate === "number"
        )
      ) {
        return parsed as FeeRate[];
      }
      return DEFAULT_FEE_RATES;
    } catch {
      return DEFAULT_FEE_RATES;
    }
  });

  const [defaultShipping, setDefaultShipping] = useState(() => {
    return parseInt(localStorage.getItem("sedori_default_shipping") || "800", 10);
  });

  const [otherCost, setOtherCost] = useState(() => {
    return parseInt(localStorage.getItem("sedori_other_cost") || "0", 10);
  });

  const [targetProfitRate, setTargetProfitRate] = useState(() => {
    return parseInt(localStorage.getItem("sedori_target_profit_rate") || "15", 10);
  });

  const [saved, setSaved] = useState(false);

  const handleFeeRateChange = (index: number, rate: number) => {
    setFeeRates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], rate };
      return next;
    });
  };

  const handleSave = () => {
    localStorage.setItem("sedori_fee_rates", JSON.stringify(feeRates));
    localStorage.setItem("sedori_default_shipping", String(defaultShipping));
    localStorage.setItem("sedori_other_cost", String(otherCost));
    localStorage.setItem("sedori_target_profit_rate", String(targetProfitRate));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setFeeRates(DEFAULT_FEE_RATES);
    setDefaultShipping(800);
    setOtherCost(0);
    setTargetProfitRate(15);
    setShowResetConfirm(false);
  };

  return (
    <div>
      <h2 className="page-title">設定</h2>

      <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Amazon手数料率 */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Amazon手数料率（カテゴリ別）
          </h3>
          {feeRates.map((item, i) => (
            <div
              key={item.category}
              className="form-group"
              style={{ display: "flex", alignItems: "center", gap: 12 }}
            >
              <label style={{ width: 80, marginBottom: 0 }}>{item.category}</label>
              <input
                type="number"
                className="form-input"
                title={`${item.category}の手数料率`}
                style={{ width: 80 }}
                min={0}
                max={100}
                value={item.rate}
                onChange={(e) =>
                  handleFeeRateChange(i, parseInt(e.target.value, 10) || 0)
                }
              />
              <span style={{ fontSize: 14, color: "#666" }}>%</span>
            </div>
          ))}
        </div>

        {/* 送料・経費 */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            送料・経費
          </h3>
          <div className="form-group">
            <label>デフォルト送料</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                className="form-input"
                title="デフォルト送料"
                style={{ width: 120 }}
                min={0}
                value={defaultShipping}
                onChange={(e) =>
                  setDefaultShipping(parseInt(e.target.value, 10) || 0)
                }
              />
              <span style={{ fontSize: 14, color: "#666" }}>円</span>
            </div>
          </div>
          <div className="form-group">
            <label>その他経費（梱包材など）</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                className="form-input"
                title="その他経費"
                style={{ width: 120 }}
                min={0}
                value={otherCost}
                onChange={(e) =>
                  setOtherCost(parseInt(e.target.value, 10) || 0)
                }
              />
              <span style={{ fontSize: 14, color: "#666" }}>円</span>
            </div>
          </div>
        </div>

        {/* 利益設定 */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            利益設定
          </h3>
          <div className="form-group">
            <label>目標利益率</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                className="form-input"
                title="目標利益率"
                style={{ width: 80 }}
                min={0}
                max={100}
                value={targetProfitRate}
                onChange={(e) =>
                  setTargetProfitRate(parseInt(e.target.value, 10) || 0)
                }
              />
              <span style={{ fontSize: 14, color: "#666" }}>%</span>
            </div>
          </div>
        </div>

        {/* スケジューラー */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            監視スケジューラー
          </h3>
          {schedulerStatus ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>状態:</strong>{" "}
                <span
                  className={`badge ${schedulerStatus.running ? "badge-active" : "badge-ended"}`}
                >
                  {schedulerStatus.running ? "稼働中" : "停止中"}
                </span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>チェック間隔:</strong> {schedulerStatus.interval_minutes}分
              </div>
              {schedulerStatus.next_run && (
                <div style={{ marginBottom: 12 }}>
                  <strong>次回実行:</strong>{" "}
                  {new Date(schedulerStatus.next_run).toLocaleString("ja-JP")}
                </div>
              )}
              {schedulerError && (
                <div className="error-msg" style={{ marginBottom: 8 }}>
                  {schedulerError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn ${schedulerStatus.running ? "btn-secondary" : "btn-primary"}`}
                  onClick={toggleScheduler}
                  disabled={schedulerLoading}
                >
                  {schedulerStatus.running ? "停止" : "開始"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={runNow}
                  disabled={schedulerLoading}
                >
                  今すぐ実行
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color: "#999", fontSize: 13 }}>
              バックエンドに接続できません
            </div>
          )}
        </div>

        {/* ボタン */}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            保存
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetConfirm(true)}
          >
            デフォルトに戻す
          </button>
        </div>

        {saved && (
          <div
            style={{
              background: "#e8f5e9",
              color: "#2e7d32",
              padding: 12,
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            設定を保存しました
          </div>
        )}
      </div>

      {showResetConfirm && (
        <ConfirmDialog
          message="すべての設定をデフォルトに戻しますか？"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
}
