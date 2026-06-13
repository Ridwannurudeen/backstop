// Backstop wordmark mark (a protection shield) + the Sui droplet for the
// "Built on Sui" footer badge. Single-colour, no decoration.

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2.5 4.5 5.4v6.1c0 4.6 3.1 7.9 7.5 9.5 4.4-1.6 7.5-4.9 7.5-9.5V5.4L12 2.5Z"
        stroke="var(--sui)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 12.1 11 14.6l4.6-5.1"
        stroke="var(--sui)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SuiDrop({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="var(--sui)"
      aria-hidden="true"
    >
      <path d="M12 2.4c3.9 5 7.1 8.5 7.1 12.2A7.1 7.1 0 1 1 4.9 14.6C4.9 10.9 8.1 7.4 12 2.4Z" />
    </svg>
  );
}
