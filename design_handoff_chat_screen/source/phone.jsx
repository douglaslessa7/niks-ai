/* global React */

// Minimal iPhone frame — 390x844 logical, scaled by canvas
function Phone({ children, dark = false }) {
  return (
    <div style={{
      width: 390, height: 844, borderRadius: 52, overflow: 'hidden',
      position: 'relative', background: dark ? '#0F1420' : '#FFFFFF',
      boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 1px rgba(43,39,36,0.10), 0 40px 80px rgba(43,39,36,0.18), 0 12px 32px rgba(43,39,36,0.08)',
      WebkitFontSmoothing: 'antialiased',
      fontFamily: 'var(--niks-ui)',
      color: 'var(--niks-ink)',
    }}>
      {/* dynamic island */}
      <div style={{
        position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
        width: 122, height: 35, borderRadius: 22, background: '#000', zIndex: 50,
      }} />
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {/* home indicator */}
      <div style={{
        position: 'absolute', bottom: 8, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: 60, pointerEvents: 'none',
      }}>
        <div style={{ width: 134, height: 5, borderRadius: 100, background: dark ? 'rgba(255,255,255,0.55)' : 'rgba(43,39,36,0.30)' }} />
      </div>
    </div>
  );
}

// iOS status bar — minimal
function StatusBarMini({ dark = false, time = '9:41' }) {
  const c = dark ? '#FFFFFF' : '#1A1A1A';
  return (
    <div style={{
      height: 54, padding: '18px 30px 0', display: 'flex',
      justifyContent: 'space-between', alignItems: 'center',
      color: c, flexShrink: 0, position: 'relative', zIndex: 5,
    }}>
      <span style={{ font: '600 16px/1 -apple-system, system-ui', letterSpacing: '-0.3px' }}>{time}</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill={c}><rect x="0" y="6" width="3" height="5" rx="0.7"/><rect x="4.5" y="4" width="3" height="7" rx="0.7"/><rect x="9" y="2" width="3" height="9" rx="0.7"/><rect x="13.5" y="0" width="3" height="11" rx="0.7"/></svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke={c} strokeOpacity="0.35"/><rect x="2" y="2" width="17" height="8" rx="1.5" fill={c}/><path d="M22 4v4c.8-.3 1.4-1 1.4-2s-.6-1.7-1.4-2z" fill={c} fillOpacity="0.4"/></svg>
      </span>
    </div>
  );
}

Object.assign(window, { Phone, StatusBarMini });
