import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { NotificationItem } from "../types";

const NAV_ITEMS = [
  { path: "/", label: "リサーチ", icon: "🔍" },
  { path: "/monitors", label: "監視中", icon: "👁" },
  { path: "/ended", label: "終了", icon: "✓" },
  { path: "/templates", label: "テンプレート", icon: "📝" },
  { path: "/settings", label: "設定", icon: "⚙" },
];

export function Layout() {
  const api = useApi();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUnread = () => {
      api.getUnreadCount().then((r) => setUnreadCount(r.unread_count)).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [api]);

  // クリック外閉じ
  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  const openNotifications = async () => {
    if (showNotifications) {
      setShowNotifications(false);
      return;
    }
    const data = await api.listNotifications(20).catch(() => null);
    if (data) {
      setNotifications(data.items);
      setUnreadCount(data.unread_count);
    }
    setShowNotifications(true);
  };

  const handleNotificationClick = useCallback(async (n: NotificationItem) => {
    if (!n.is_read) {
      await api.markNotificationRead(n.id).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowNotifications(false);
    if (n.link_url) {
      navigate(n.link_url);
    }
  }, [api, navigate]);

  const markAllRead = async () => {
    await api.markAllNotificationsRead().catch(() => {});
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Sedori Tool</h1>
          <button
            type="button"
            className="notification-bell"
            onClick={openNotifications}
            aria-expanded={showNotifications ? "true" : "false"}
            aria-label={`通知 ${unreadCount > 0 ? `(${unreadCount}件未読)` : ""}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              position: "relative",
              fontSize: 18,
              padding: 4,
            }}
          >
            🔔
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -4,
                  background: "#e53935",
                  color: "#fff",
                  borderRadius: "50%",
                  fontSize: 10,
                  width: 16,
                  height: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* 通知ドロップダウン */}
        {showNotifications && (
          <div
            ref={dropdownRef}
            role="dialog"
            aria-label="通知一覧"
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              margin: "0 8px 8px",
              maxHeight: 300,
              overflowY: "auto",
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderBottom: "1px solid #eee",
              }}
            >
              <strong>通知</strong>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#1976d2",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  すべて既読
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: 12, color: "#999", textAlign: "center" }}>
                通知はありません
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNotificationClick(n)}
                  onKeyDown={(e) => e.key === "Enter" && handleNotificationClick(n)}
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid #f5f5f5",
                    cursor: n.link_url ? "pointer" : "default",
                    background: n.is_read ? "transparent" : "#e3f2fd",
                  }}
                >
                  <div style={{ fontWeight: n.is_read ? 400 : 600 }}>
                    {n.title}
                  </div>
                  <div style={{ color: "#666", marginTop: 2 }}>
                    {n.message.split("\n")[0]}
                  </div>
                  <div style={{ color: "#999", marginTop: 2, fontSize: 10 }}>
                    {new Date(n.created_at).toLocaleString("ja-JP")}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                end={item.path === "/"}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
