import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit";
import { SECTIONS } from "../nav";
import { Logo } from "./Brand";
import Footer from "./Footer";

export default function Layout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const section =
    SECTIONS.find((s) => pathname.startsWith(s.base)) ?? SECTIONS[0];

  return (
    <div className="wrap">
      <header className="site-header">
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
          <Logo /> Backstop
        </Link>
        <button
          className="nav-toggle"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={`nav ${menuOpen ? "open" : ""}`}>
          {SECTIONS.map((s) => (
            <Link
              key={s.id}
              to={s.tabs[0].to}
              className={pathname.startsWith(s.base) ? "active" : ""}
              onClick={() => setMenuOpen(false)}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="header-cta">
          <ConnectButton />
        </div>
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
      <Footer />
    </div>
  );
}
