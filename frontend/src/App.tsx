import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Research } from "./pages/Research";
import { MonitorList } from "./pages/MonitorList";
import { MonitorDetail } from "./pages/MonitorDetail";
import { MonitorAdd } from "./pages/MonitorAdd";
import { EndedList } from "./pages/EndedList";
import { Templates } from "./pages/Templates";
import { Settings } from "./pages/Settings";

function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <h2 style={{ fontSize: 24, marginBottom: 8 }}>404</h2>
      <p style={{ color: "#666", marginBottom: 16 }}>ページが見つかりません</p>
      <Link to="/" className="btn btn-primary">
        トップに戻る
      </Link>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Research />} />
          <Route path="/monitors" element={<MonitorList />} />
          <Route path="/monitors/:id" element={<MonitorDetail />} />
          <Route path="/monitor/add" element={<MonitorAdd />} />
          <Route path="/ended" element={<EndedList />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
