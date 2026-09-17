import { sunken } from '../theme'
// The app's one "filter what's below" control. Anything that looks like this
// — a full-width track of equal, centred segments with one lit up — is read
// as filtering the list under it, so don't reuse the shape for anything else
// (a form's type picker, say); that collision is exactly what made My
// Schedule's Training/Game/Event buttons look like a filter they never were.
// `style` merges into the container so the baked-in screen margin can be
// dropped where the surrounding layout already indents.
export default function Tabs({ tabs, active, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 2, margin: '0 18px 12px', ...sunken(.07), borderRadius: 12, padding: 3, ...style }}>
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
