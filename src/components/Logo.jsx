export default function Logo({ size = 26, iconSize = 19, accent = '#e8b13c' }) {
  return (
    <div
      style={{
        width: size, height: size, flex: 'none', borderRadius: size * 0.3,
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg viewBox="0 0 48 48" style={{ width: iconSize, height: iconSize, display: 'block' }} aria-hidden="true">
        <circle cx="21" cy="27" r="15" fill="none" stroke={accent} strokeWidth="2.6" />
        <path d="M6 27 H36" fill="none" stroke={accent} strokeWidth="1.7" opacity="0.9" />
        <path d="M21 12 V42" fill="none" stroke={accent} strokeWidth="1.7" opacity="0.9" />
        <path d="M10.5 16.5 C17 22 17 32 10.5 37.5" fill="none" stroke={accent} strokeWidth="1.7" opacity="0.9" />
        <path d="M31.5 16.5 C25 22 25 32 31.5 37.5" fill="none" stroke={accent} strokeWidth="1.7" opacity="0.9" />
        <path d="M30 19 C36 15 38 11 39.5 7.5" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4 3.4" />
        <path d="M43 4 L34.5 7 L39.5 12 Z" fill="#ffffff" transform="rotate(-18 39 8)" />
      </svg>
    </div>
  )
}
