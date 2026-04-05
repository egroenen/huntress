export const BrandMark = () => {
  return (
    <svg
      className="console-brand__mark"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="edarr-brand-lens" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#5ad5ef" />
          <stop offset="100%" stopColor="#1786b3" />
        </linearGradient>
        <linearGradient id="edarr-brand-core" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#ffd86e" />
          <stop offset="100%" stopColor="#e2a321" />
        </linearGradient>
      </defs>
      <circle
        cx="28"
        cy="28"
        r="18"
        fill="none"
        stroke="url(#edarr-brand-lens)"
        strokeWidth="7"
      />
      <path
        d="M40.5 40.5L53 53"
        stroke="url(#edarr-brand-lens)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M23.5 18.5h11l-5.5 7.5h6.5L24.5 39l3.5-9H21z"
        fill="url(#edarr-brand-core)"
      />
      <circle cx="28" cy="28" r="4.5" fill="#142131" opacity="0.92" />
    </svg>
  );
};
