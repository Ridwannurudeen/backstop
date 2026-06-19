import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

const THEME_KEY = "backstop:theme";
const THEME_COLORS: Record<ThemeMode, string> = {
  dark: "#0a0f16",
  light: "#f6f9fd",
};

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === "dark" || value === "light";

function storedTheme(): ThemeMode | null {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return isThemeMode(saved) ? saved : null;
  } catch {
    return null;
  }
}

function preferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const saved = storedTheme();
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (meta) meta.content = THEME_COLORS[theme];
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(preferredTheme);
  const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && isThemeMode(event.newValue)) {
        setTheme(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "light"}
      onClick={() => setTheme(nextTheme)}
    >
      <span className={theme === "dark" ? "active" : ""}>Dark</span>
      <span className={theme === "light" ? "active" : ""}>Light</span>
    </button>
  );
}
