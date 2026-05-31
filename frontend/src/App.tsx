import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Research } from "./pages/Research";
import { PriceDiff } from "./pages/PriceDiff";
import { MonitorList } from "./pages/MonitorList";
import { MonitorDetail } from "./pages/MonitorDetail";
import { MonitorAdd } from "./pages/MonitorAdd";
import { EndedList } from "./pages/EndedList";
import { Listings } from "./pages/Listings";
import { Chances } from "./pages/Chances";
import { Stats } from "./pages/Stats";
import { Settings } from "./pages/Settings";

function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <h2 style={{ fontSize: 24, marginBottom: 8 }}>404</h2>
      <p style={{ color: "#666", marginBottom: 16 }}>ページが見つかりません</p>
      <Link to="/monitors" className="btn btn-primary">
        監視中の商品へ
      </Link>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/monitors" replace />} />
          <Route path="/research" element={<Research />} />
          <Route path="/price-diff" element={<PriceDiff />} />
          <Route path="/monitors" element={<MonitorList />} />
          <Route path="/monitors/:id" element={<MonitorDetail />} />
          <Route path="/monitor/add" element={<MonitorAdd />} />
          <Route path="/ended" element={<EndedList />} />
          <Route path="/chances" element={<Chances />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
