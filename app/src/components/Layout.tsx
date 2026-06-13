import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit";
import { SECTIONS } from "../nav";
import { Logo, SuiDrop } from "./Brand";

export default function Layout() {
  const { pathname } = useLocation();
  const section =
    SECTIONS.find((s) => pathname.startsWith(s.base)) ?? SECTIONS[0];

  return (
    <div className="wrap">
      <header className="site-header">
        <Link to="/" className="brand">
          <Logo /> Backstop
        </Link>
        <nav className="nav">
          {SECTIONS.map((s) => (
            <Link
              key={s.id}
              to={s.tabs[0].to}
              className={pathname.startsWith(s.base) ? "active" : ""}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <ConnectButton />
      </header>

      {section.tabs.length > 1 && (
        <div className="subnav">
          {section.tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      )}

      <Outlet />

      <footer className="site-footer">
        <span>The risk &amp; trust layer for Sui.</span>
        <Link to="/" className="built-on-sui">
          <SuiDrop /> Built on Sui
        </Link>
      </footer>
    </div>
  );
}
