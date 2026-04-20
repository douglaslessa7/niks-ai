// DIRECTION 5 — "CONSTELAÇÃO"
// Visual radical: a pele é um céu. Cada etapa é uma estrela em constelação.
// Tap em cada estrela expande seu "capítulo". Escuro e luminoso.
// Sensação: planetário de luxo, observatório privado, mapa celestial.

function ProtocoloConstelacao({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'pm', expandedStep = 2 }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 2 : 1;
  const s = steps[expandedStep];

  // Positions for constellation points — asymmetric but curated
  // (normalized 0-100 in a 360x260 box)
  const positions = mode === 'pm'
    ? [
        { x: 18, y: 28, mag: 4 },
        { x: 42, y: 16, mag: 3 },
        { x: 64, y: 38, mag: 5 },
        { x: 38, y: 62, mag: 4 },
        { x: 78, y: 76, mag: 3 },
      ]
    : [
        { x: 22, y: 72, mag: 4 },
        { x: 48, y: 52, mag: 5 },
        { x: 72, y: 30, mag: 4 },
        { x: 38, y: 22, mag: 3 },
      ];

  const isDark = mode === 'pm';
  const bg = isDark
    ? 'linear-gradient(180deg, #0F1420 0%, #1A1F2E 40%, #2A1F28 100%)'
    : 'linear-gradient(180deg, #1E2134 0%, #413248 40%, #7E5A5C 75%, #E89B8A 100%)';

  const fg = isDark ? '#FFFFFF' : '#FFFFFF';
  const fgMuted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.75)';

  return (
    <div style={{
      minHeight: '100%', fontFamily: PROTO.sans,
      background: bg, position: 'relative',
      paddingBottom: 120, color: fg, overflow: 'hidden',
    }}>
      {/* Starfield — tiny dots everywhere */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i * 137) % 100;
          const y = ((i * 89) % 100);
          const size = [1, 1, 1, 1.5, 2][i % 5];
          return (
            <div key={i} style={{
              position: 'absolute', left: `${x}%`, top: `${y * 0.8}%`,
              width: size, height: size, borderRadius: size,
              background: '#fff', opacity: 0.1 + (i % 5) * 0.08,
            }}/>
          );
        })}
      </div>

      {/* Top chrome */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 5,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
            color: accent, textTransform: 'uppercase',
          }}>
            Observatório NIKS
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 24, fontWeight: 400,
            color: fg, lineHeight: 1.1, marginTop: 4,
            letterSpacing: '-0.01em', fontStyle: 'italic',
          }}>
            {mode === 'am' ? 'Aurora' : 'Noturnal'}
          </div>
        </div>

        {/* AM/PM switch */}
        <div style={{
          padding: 3, borderRadius: 100,
          background: 'rgba(255,255,255,0.08)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          display: 'flex', gap: 2,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        }}>
          {['am', 'pm'].map(m => {
            const active = m === mode;
            return (
              <div key={m} style={{
                padding: '6px 10px', borderRadius: 100,
                background: active ? '#fff' : 'transparent',
                color: active ? PROTO.ink : 'rgba(255,255,255,0.6)',
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {m === 'am' ? Icon.sun(active ? PROTO.ink : 'rgba(255,255,255,0.6)', 11) : Icon.moon(active ? PROTO.ink : 'rgba(255,255,255,0.6)', 11)}
                {m === 'am' ? 'AM' : 'PM'}
              </div>
            );
          })}
        </div>
      </div>

      {/* Constellation canvas */}
      <div style={{
        padding: '28px 24px 0', position: 'relative', zIndex: 3,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
          color: fgMuted, textTransform: 'uppercase',
          textAlign: 'center', marginBottom: 16,
        }}>
          {doneCount} de {steps.length} estrelas acesas · toque para abrir
        </div>

        <div style={{
          width: '100%', height: 270, position: 'relative',
          border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 24,
          background: 'radial-gradient(ellipse at 50% 50%, rgba(251,123,107,0.12) 0%, transparent 70%)',
          padding: 16, boxSizing: 'border-box',
        }}>
          {/* Connecting lines */}
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 16, width: 'calc(100% - 32px)', height: 'calc(100% - 32px)' }} preserveAspectRatio="none">
            {positions.map((p, i) => {
              if (i === 0) return null;
              const prev = positions[i - 1];
              const lit = i <= doneCount;
              return (
                <line key={i}
                  x1={`${prev.x}%`} y1={`${prev.y}%`}
                  x2={`${p.x}%`} y2={`${p.y}%`}
                  stroke={lit ? accent : 'rgba(255,255,255,0.2)'}
                  strokeWidth="0.8"
                  strokeDasharray={lit ? 'none' : '2 3'}
                  opacity={lit ? 0.6 : 0.4}
                />
              );
            })}
          </svg>

          {/* Stars */}
          {positions.map((p, i) => {
            const lit = i < doneCount;
            const isExpanded = i === expandedStep;
            const size = p.mag * 4 + (isExpanded ? 6 : 0);
            return (
              <div key={i} style={{
                position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 2,
              }}>
                {/* glow */}
                {(lit || isExpanded) && (
                  <div style={{
                    position: 'absolute', inset: -size, width: size * 3, height: size * 3,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
                    opacity: isExpanded ? 0.5 : 0.3,
                    transform: 'translate(-50%, -50%)',
                    left: '50%', top: '50%',
                  }}/>
                )}
                {/* label above */}
                <div style={{
                  position: 'absolute', bottom: size + 8, left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                  color: isExpanded ? accent : fgMuted,
                  textTransform: 'uppercase',
                }}>
                  {String(i + 1).padStart(2, '0')} · {steps[i].note}
                </div>
                {/* star */}
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  background: lit ? accent : (isExpanded ? accent : 'rgba(255,255,255,0.35)'),
                  border: isExpanded ? `1px solid ${accent}` : 'none',
                  outline: isExpanded ? `3px solid ${accent}33` : 'none',
                  boxShadow: lit || isExpanded ? `0 0 16px ${accent}` : 'none',
                }}/>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded step — "today's star" */}
      <div style={{ padding: '28px 24px 0', position: 'relative', zIndex: 3 }}>
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '0.5px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 24, padding: '24px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Star glyph */}
            <div style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 22,
              background: `radial-gradient(circle, ${accent} 0%, rgba(251,123,107,0.3) 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 24px ${accent}88`,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
                <path d="M12 2 l2.5 7 L22 11 l-7 2.5 L12 22 l-2.5-8.5 L2 11 l7.5-2 z"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 2,
                color: accent, textTransform: 'uppercase',
              }}>
                Passo {expandedStep + 1} · {s.dur}
              </div>
              <div style={{
                fontFamily: displayFont, fontSize: 24, fontWeight: 400,
                color: fg, lineHeight: 1.15, marginTop: 6,
                letterSpacing: '-0.01em',
              }}>
                {s.t}
              </div>
              <div style={{
                fontSize: 13, color: fgMuted, lineHeight: 1.55,
                marginTop: 10,
              }}>
                {s.s}
              </div>
              {/* Benefit quote */}
              <div style={{
                marginTop: 14, padding: '12px 14px',
                background: 'rgba(251,123,107,0.08)',
                border: `0.5px solid ${accent}33`,
                borderRadius: 12,
                fontSize: 11, color: fg, lineHeight: 1.5,
                fontFamily: displayFont, fontStyle: 'italic',
              }}>
                "{s.benefit}"
              </div>
              {/* Ingredient line */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
                fontSize: 10, color: fgMuted, fontFamily: PROTO.mono,
                letterSpacing: 0.5,
              }}>
                {Icon.droplet(fgMuted, 11)} {s.ingredient}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{
            marginTop: 18, padding: '14px 16px',
            background: accent, color: '#fff', borderRadius: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 14, fontWeight: 600, letterSpacing: 0.2,
            boxShadow: `0 8px 24px ${accent}66`,
          }}>
            Acender esta estrela {Icon.check('#fff', 14)}
          </div>
        </div>
      </div>

      {/* Tab bar — dark */}
      <ProtoTabBar active="protocolo" theme="dark"/>
    </div>
  );
}

Object.assign(window, { ProtocoloConstelacao });
