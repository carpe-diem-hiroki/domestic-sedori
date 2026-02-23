import { useCallback, useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Template } from "../types";

export function Templates() {
  const api = useApi();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.listTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "テンプレートの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const startNew = () => {
    setEditingId(null);
    setName("");
    setBody("");
    setError("");
  };

  const startEdit = (t: Template) => {
    setEditingId(t.id);
    setName(t.name);
    setBody(t.body);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setBody("");
    setError("");
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      setError("名前と本文は必須です");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api.updateTemplate(editingId, { name, body });
      } else {
        await api.createTemplate({ name, body });
      }
      cancelEdit();
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget == null) return;
    try {
      await api.deleteTemplate(deleteTarget);
      if (editingId === deleteTarget) cancelEdit();
      setDeleteTarget(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>テンプレート</h2>
        <button className="btn btn-primary" onClick={startNew}>
          新規作成
        </button>
      </div>

      <div className="grid-2">
        {/* 左カラム: テンプレート一覧 */}
        <div>
          {templates.length === 0 ? (
            <div className="card">
              <p style={{ color: "#999" }}>
                テンプレートがありません。「新規作成」で追加してください。
              </p>
            </div>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="card"
                style={{
                  cursor: "pointer",
                  border: editingId === t.id ? "2px solid #ff5722" : "1px solid transparent",
                }}
                onClick={() => startEdit(t)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                      {t.body.length > 80 ? `${t.body.slice(0, 80)}...` : t.body}
                    </div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(t.id);
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 右カラム: 編集フォーム */}
        {(name !== "" || body !== "" || editingId !== null) && (
          <div className="card" style={{ position: "sticky", top: 24 }}>
            <h3 style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
              {editingId ? "テンプレート編集" : "新規テンプレート"}
            </h3>

            <div className="form-group">
              <label>テンプレート名</label>
              <input
                type="text"
                className="form-input"
                placeholder="例: 中古家電 基本テンプレート"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>本文</label>
              <textarea
                className="form-input"
                rows={12}
                placeholder="出品時の商品説明テンプレートを入力..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {error && (
              <div className="error-msg" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <button className="btn btn-secondary" onClick={cancelEdit}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
      {deleteTarget != null && (
        <ConfirmDialog
          message="このテンプレートを削除しますか？"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
