import { useState } from "react";
import { useApi } from "../hooks/useApi";
import type { AmazonProduct, MonitorItem, Template } from "../types";

interface ListingFormProps {
  monitor: MonitorItem;
  amazonProduct: AmazonProduct | null;
  sellingPrice: number;
}

export function ListingForm({ monitor, amazonProduct, sellingPrice }: ListingFormProps) {
  const api = useApi();
  const [showForm, setShowForm] = useState(false);
  const [sku, setSku] = useState("");
  const [condition, setCondition] = useState("中古 - 良い");
  const [leadTime, setLeadTime] = useState(8);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const openForm = async () => {
    setShowForm(true);
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    setSku(`${monitor.asin}-${dateStr}`);
    try {
      const t = await api.listTemplates();
      setTemplates(t);
    } catch {
      setTemplates([]);
    }
  };

  const handleTemplateChange = (templateId: number) => {
    setSelectedTemplate(templateId);
    const t = templates.find((tpl) => tpl.id === templateId);
    if (t) {
      let desc = t.body;
      desc = desc.replace(/\{product_title\}/g, amazonProduct?.title || monitor.product_title || "");
      desc = desc.replace(/\{brand\}/g, amazonProduct?.brand || "");
      desc = desc.replace(/\{model_number\}/g, amazonProduct?.model_number || "");
      desc = desc.replace(/\{condition\}/g, condition);
      setDescription(desc);
    }
  };

  const handleSubmit = async () => {
    if (!sku.trim()) {
      setMessage("SKUを入力してください");
      return;
    }
    setSubmitting(true);
    setMessage("");
    setMessage(
      `出品準備完了: SKU=${sku}, 販売価格=${sellingPrice}円, コンディション=${condition}, リードタイム=${leadTime}日`
    );
    setSubmitting(false);
  };

  if (!showForm) {
    return (
      <div className="card">
        <button
          type="button"
          className="btn btn-primary"
          onClick={openForm}
          style={{ width: "100%" }}
        >
          新規出品
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
        Amazon出品
      </h3>
      <div className="form-group">
        <label>SKU</label>
        <input
          type="text"
          className="form-input"
          title="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>販売価格</label>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {sellingPrice.toLocaleString()}円
        </div>
        <div style={{ fontSize: 11, color: "#999" }}>
          上の価格計算で変更できます
        </div>
      </div>
      <div className="form-group">
        <label>コンディション</label>
        <select
          className="form-input"
          title="コンディション"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          <option>中古 - ほぼ新品</option>
          <option>中古 - 非常に良い</option>
          <option>中古 - 良い</option>
          <option>中古 - 可</option>
        </select>
      </div>
      <div className="form-group">
        <label>リードタイム（日）</label>
        <input
          type="number"
          className="form-input"
          title="リードタイム"
          style={{ width: 80 }}
          min={1}
          max={30}
          value={leadTime}
          onChange={(e) => setLeadTime(parseInt(e.target.value, 10) || 8)}
        />
      </div>
      {templates.length > 0 && (
        <div className="form-group">
          <label>説明テンプレート</label>
          <select
            className="form-input"
            title="説明テンプレート"
            value={selectedTemplate ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) handleTemplateChange(parseInt(val, 10));
            }}
          >
            <option value="">テンプレートを選択...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label>商品説明</label>
        <textarea
          className="form-input"
          title="商品説明"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
      {message && (
        <div
          style={{
            background: message.startsWith("出品準備完了") ? "#e8f5e9" : "#fbe9e7",
            color: message.startsWith("出品準備完了") ? "#2e7d32" : "#bf360c",
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {message}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "出品中..." : "新規出品"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowForm(false)}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
