/* global React */

// === Tab bar (light) ===
function TabBar({ active = 'home', onChange, theme = 'day' }) {
  const isNight = theme === 'night';
  const tabs = [
    { id: 'home', label: 'início', icon: (a) => a
      ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    },
    { id: 'rotina', label: 'rotina', icon: (a) => a
      ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
      : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
    },
    { id: 'perfil', label: 'perfil', icon: (a) => a
      ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/></svg>
      : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/></svg>
    },
  ];
  const activeColor = isNight ? '#F9A898' : '#FB7B6B';
  const inactive = isNight ? 'rgba(255,255,255,0.45)' : '#8A8A8E';
  return (
    <div style={{ position: 'absolute', left: 16, right: 90, bottom: 24, display: 'flex', justifyContent: 'space-around',
        background: isNight ? 'rgba(26,31,46,0.85)' : '#fff',
        border: isNight ? '1px solid rgba(255,255,255,0.08)' : '1px solid #F0F0F0',
        borderRadius: 20, padding: '10px 8px',
        backdropFilter: isNight ? 'blur(20px)' : 'none',
        boxShadow: isNight ? 'var(--sh-tab-dark)' : 'var(--sh-tab-light)' }}>
      {tabs.map(t => {
        const a = t.id === active;
        return (
          <div key={t.id} onClick={() => onChange?.(t.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 52, padding: '4px 0', cursor: 'pointer', color: a ? activeColor : inactive, font: `${a ? 600 : 500} 12px/1 var(--niks-ui)` }}>
            {t.icon(a)}
            <span>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function FAB({ onClick, theme = 'day' }) {
  return (
    <div onClick={onClick} style={{ position: 'absolute', right: 18, bottom: 30, width: 60, height: 60, borderRadius: '50%', background: 'var(--niks-coral)', boxShadow: 'var(--sh-fab-coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </div>
  );
}

// === Status bar / chrome ===
function StatusBar({ theme = 'day' }) {
  const c = theme === 'night' ? '#fff' : '#1A1A1A';
  return (
    <div style={{ height: 44, padding: '0 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: c, font: '600 15px/1 var(--niks-ui)', flexShrink: 0 }}>
      <span>9:41</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="1"/><rect x="4.5" y="4" width="3" height="7" rx="1"/><rect x="9" y="2" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5"/><rect x="2" y="2" width="15" height="7" rx="1" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor"/></svg>
      </span>
    </div>
  );
}

// === Night background ===
function NightBg() {
  const stars = React.useMemo(() => Array.from({ length: 56 }).map((_, i) => ({
    left: ((i * 37 + 13) % 100), top: ((i * 53 + 7) % 100),
    size: i % 3 === 0 ? 1.3 : 0.7, op: 0.3 + ((i * 17) % 60) / 100,
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--niks-night-bg)', overflow: 'hidden' }}>
      {stars.map((s, i) => <div key={i} style={{ position: 'absolute', left: s.left + '%', top: s.top + '%', width: s.size * 2, height: s.size * 2, borderRadius: '50%', background: '#fff', opacity: s.op }} />)}
    </div>
  );
}

Object.assign(window, { TabBar, FAB, StatusBar, NightBg });
