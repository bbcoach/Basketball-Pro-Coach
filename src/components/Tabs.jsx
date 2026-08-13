export default function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, margin: '0 18px 12px', background: 'rgba(255,255,255,.07)', borderRadius: 10, padding: 3 }}>
      {tabs.map(([key, label]) => (
        <div
          key={key}
          onClick={() => onChange(key)}
          style={{
            flex: 1, textAlign: 'center', padding: '7px 6px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: active === key ? 'rgba(255,255,255,.16)' : 'transparent',
            color: active === key ? '#fff' : 'rgba(255,255,255,.5)',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}
