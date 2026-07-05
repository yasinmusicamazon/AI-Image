import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./screens/Dashboard";
import ApiSettingsScreen from "./screens/ApiSettings";
import WebsiteManagerScreen from "./screens/WebsiteManager";
import ContentManagerScreen from "./screens/ContentManager";
import ImagePlannerScreen from "./screens/ImagePlanner";
import JobQueueScreen from "./screens/JobQueue";
import ImageReviewScreen from "./screens/ImageReview";
import BackupRollbackScreen from "./screens/BackupRollback";
import PromptTemplatesScreen from "./screens/PromptTemplates";
import GlobalSettingsScreen from "./screens/GlobalSettings";

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
          <Route path="/content" element={<ContentManagerScreen />} />
          <Route path="/image-planner" element={<ImagePlannerScreen />} />
          <Route path="/jobs" element={<JobQueueScreen />} />
          <Route path="/image-review" element={<ImageReviewScreen />} />
          <Route path="/backups" element={<BackupRollbackScreen />} />
          <Route path="/templates" element={<PromptTemplatesScreen />} />
          <Route path="/global-settings" element={<GlobalSettingsScreen />} />
        </Routes>
      </main>
    </div>
  );
}
