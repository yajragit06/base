/** The Base mark: a page tree resting on a base line. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="base-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#base-mark)" />
      <circle cx="32" cy="18" r="6" fill="#fff" />
      <path d="M32 24v8M20 32h24M20 32v6M44 32v6" stroke="#fff" strokeWidth="3" fill="none" />
      <rect x="15" y="38" width="10" height="8" rx="2" fill="#fff" />
      <rect x="39" y="38" width="10" height="8" rx="2" fill="#fff" />
      <rect x="12" y="50" width="40" height="3" rx="1.5" fill="#fff" />
    </svg>
  );
}
