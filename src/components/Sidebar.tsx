import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/api-settings", label: "API Settings" },
  { to: "/websites", label: "Website Manager" },
  { to: "/content", label: "Content Manager" },
  { to: "/image-planner", label: "AI Image Planner" },
  { to: "/jobs", label: "Job Queue" },
  { to: "/image-review", label: "Image Review" },
  { to: "/backups", label: "Backup / Rollback" },
  { to: "/templates", label: "Prompt Templates" },
  { to: "/global-settings", label: "Global Settings" }
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <nav>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
