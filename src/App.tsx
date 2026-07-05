import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./screens/Dashboard";
import ApiSettingsScreen from "./screens/ApiSettings";
import WebsiteManagerScreen from "./screens/WebsiteManager";

export default function App() {
  return (
    <div className="app-shell">
      <TopBar />
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/api-settings" element={<ApiSettingsScreen />} />
          <Route path="/websites" element={<WebsiteManagerScreen />} />
        </Routes>
      </main>
    </div>
  );
}
