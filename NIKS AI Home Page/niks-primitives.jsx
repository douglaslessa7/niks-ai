// niks-primitives.jsx — Shared NIKS AI building blocks
// Logo, back button, progress bar, pill CTA, coral pill. Pure React, no deps.

const NIKS = {
  coral: '#FB7B6B',
  coralSoft: '#FF9B8A',
  coralShadow: 'rgba(251,123,107,0.25)',
  coralGlow: 'rgba(251,123,107,0.4)',
  ink: '#1D3A44',
  cream: '#F6F4EE',
  white: '#FFFFFF',
  gray1: '#F5F5F7',
  gray2: '#F3F3F5',
  gray5: '#9CA3AF',
  gray6: '#8A8A8E',
  gray8: '#6B7280',
  premium: '#CBA052',
  border: 'rgba(0,0,0,0.08)',
  hairline: 'rgba(0,0,0,0.07)',
  gradient: 'linear-gradient(180deg,#FCEAE5 0%,#FDF0ED 40%,#FDFAF9 70%,#FFFFFF 100%)',
  font: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
};

// iPhone safe area top (~62px for Dynamic Island frame)
const NIKS_TOP_SAFE = 62;

// ─── N-in-brackets logo (from home.tsx) ──────────────────────────
function NiksLogo({ size = 32, color = NIKS.ink }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <g stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M 20 42 L 20 32 A 12 12 0 0 1 32 20 L 42 20"/>
        <path d="M 100 42 L 100 32 A 12 12 0 0 0 88 20 L 78 20"/>
        <path d="M 20 78 L 20 88 A 12 12 0 0 0 32 100 L 42 100"/>
        <path d="M 100 78 L 100 88 A 12 12 0 0 1 88 100 L 78 100"/>
      </g>
      <path
        d="M 60 26 C 74 26, 82 37, 84 50 C 88 50, 90 52, 90 55 C 90 58, 88 60, 84 60 C 82 76, 72 90, 60 94 C 48 90, 38 76, 36 60 C 32 60, 30 58, 30 55 C 30 52, 32 50, 36 50 C 38 37, 46 26, 60 26 Z"
        fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M 42 46 Q 47 44 52 46" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M 78 46 Q 73 44 68 46" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M 53 77 Q 60 80 67 77" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <g fill={color}>
        <circle cx="60" cy="36" r="2.5"/>
        <circle cx="50" cy="38" r="1.5"/>
        <circle cx="70" cy="38" r="1.5"/>
        <circle cx="44" cy="62" r="2.5"/>
        <circle cx="76" cy="62" r="2.5"/>
      </g>
    </svg>
  );
}

function NiksWordmark({ size = 18, color = NIKS.ink, gap = 8 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <NiksLogo size={size * 1.8} color={color} />
      <div style={{ fontSize: size, fontWeight: 800, color, letterSpacing: 0.2, fontFamily: NIKS.font }}>NIKS AI</div>
    </div>
  );
}

// ─── Back button (circle, 40×40) ─────────────────────────────────
function NiksBack() {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 20,
      background: 'rgba(255,255,255,0.85)',
      border: '0.5px solid rgba(0,0,0,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={NIKS.gray8} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </div>
  );
}

// ─── Progress bar (2px coral fill) ───────────────────────────────
function NiksProgress({ percent = 50 }) {
  return (
    <div style={{ height: 2, background: 'rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${percent}%`, background: NIKS.coral, borderRadius: 1 }} />
    </div>
  );
}

// ─── Onboarding top chrome (back + progress) ─────────────────────
function NiksOnboardingHeader({ percent = 50 }) {
  return (
    <div style={{ paddingTop: NIKS_TOP_SAFE, paddingLeft: 18, paddingRight: 18 }}>
      <NiksBack />
      <div style={{ marginTop: 16 }}>
        <NiksProgress percent={percent} />
      </div>
    </div>
  );
}

// ─── Primary pill CTA ────────────────────────────────────────────
function NiksCTA({ label = 'Continuar', disabled = false, full = true, style = {} }) {
  return (
    <div style={{
      background: disabled ? '#E5E7EB' : NIKS.coral,
      borderRadius: 100,
      paddingTop: 16, paddingBottom: 16,
      textAlign: 'center',
      width: full ? '100%' : undefined,
      opacity: disabled ? 0.6 : 1,
      color: disabled ? NIKS.gray5 : NIKS.white,
      fontWeight: 600,
      fontSize: 16,
      fontFamily: NIKS.font,
      boxShadow: disabled ? 'none' : '0 2px 10px rgba(251,123,107,0.22)',
      ...style,
    }}>
      {label}
    </div>
  );
}

// ─── Outline pill CTA ────────────────────────────────────────────
function NiksOutlineCTA({ label = 'Secondary', full = true, style = {} }) {
  return (
    <div style={{
      background: NIKS.white,
      border: `1.5px solid ${NIKS.coral}`,
      borderRadius: 100,
      paddingTop: 14.5, paddingBottom: 14.5,
      textAlign: 'center',
      width: full ? '100%' : undefined,
      color: NIKS.coral,
      fontWeight: 600, fontSize: 16, fontFamily: NIKS.font,
      ...style,
    }}>
      {label}
    </div>
  );
}

// ─── Concern pill (selectable) ───────────────────────────────────
function NiksConcernPill({ label, selected, width = '48%' }) {
  return (
    <div style={{
      width,
      background: NIKS.white,
      borderRadius: 100,
      paddingTop: 14, paddingBottom: 14, paddingLeft: 16, paddingRight: 16,
      textAlign: 'center', position: 'relative',
      border: `1.5px solid ${selected ? NIKS.coral : 'transparent'}`,
      boxShadow: selected
        ? '0 2px 12px rgba(251,123,107,0.15)'
        : '0 2px 8px rgba(0,0,0,0.06)',
      fontSize: 15, fontWeight: 500, color: NIKS.ink, fontFamily: NIKS.font,
      boxSizing: 'border-box',
    }}>
      {label}
      {selected && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: 18, height: 18, borderRadius: 9,
          background: NIKS.coral,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: NIKS.white,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Eyebrow label (coral, tracked, uppercase) ───────────────────
function NiksEyebrow({ children, color = NIKS.coral }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color, letterSpacing: 1.2,
      textTransform: 'uppercase', fontFamily: NIKS.font, marginBottom: 8,
    }}>{children}</div>
  );
}

// ─── Generic title/subtitle block ────────────────────────────────
function NiksTitle({ children, size = 26 }) {
  return (
    <div style={{
      fontSize: size, fontWeight: 800, color: NIKS.ink,
      lineHeight: `${Math.round(size * 1.2)}px`,
      letterSpacing: '-0.01em', fontFamily: NIKS.font,
    }}>{children}</div>
  );
}

function NiksSubtitle({ children }) {
  return (
    <div style={{
      fontSize: 13, color: NIKS.gray5, lineHeight: '20px',
      fontFamily: NIKS.font,
    }}>{children}</div>
  );
}

// ─── Tab bar (floating pill) ─────────────────────────────────────
function NiksTabBar({ active = 'scanear' }) {
  const tabs = [
    { key: 'scanear', label: 'scanear', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
        <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      </svg>
    )},
    { key: 'protocolo', label: 'protocolo', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
      </svg>
    )},
    { key: 'perfil', label: 'perfil', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    )},
  ];
  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 20, zIndex: 20,
      display: 'flex', justifyContent: 'space-around',
      background: NIKS.white, borderRadius: 20,
      border: '1px solid #F0F0F0',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      paddingTop: 10, paddingBottom: 10, paddingLeft: 8, paddingRight: 8,
    }}>
      {tabs.map(t => {
        const isActive = t.key === active;
        const color = isActive ? NIKS.coral : NIKS.gray6;
        return (
          <div key={t.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 52, color }}>
            <div style={{ width: 26, height: 26 }}>{t.icon}</div>
            <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, fontFamily: NIKS.font, color }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Decorative sparkle ✦ glyph ──────────────────────────────────
function NiksSparkle({ size = 12, color = NIKS.coral }) {
  return <span style={{ color, fontSize: size, lineHeight: 1 }}>✦</span>;
}

Object.assign(window, {
  NIKS, NIKS_TOP_SAFE,
  NiksLogo, NiksWordmark, NiksBack, NiksProgress, NiksOnboardingHeader,
  NiksCTA, NiksOutlineCTA, NiksConcernPill,
  NiksEyebrow, NiksTitle, NiksSubtitle,
  NiksTabBar, NiksSparkle,
});
