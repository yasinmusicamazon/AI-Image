import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/api-settings", label: "API Settings" },
  { to: "/websites", label: "Website Manager" }
  // Additional screens (Pages/Posts List, AI Image Plan, Image Review,
  // Job Logs, Backup/Rollback, Global Settings) are added in later phases.
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
