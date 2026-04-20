// DIRECTION 4 — "VITRINE"
// Carrossel horizontal de cards verticais altos como frascos de perfume em uma vitrine.
// Foco na etapa atual (center + taller), as próximas aparecem nos lados (shorter + faded).
// Sensação: perfumaria de luxo, cada passo é um objeto precioso.

function ProtocoloVitrine({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am', currentStep = 2 }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 2 : 0;
  const s = steps[currentStep];

  // Color tints per step — shifting warm palette
  const stepTints = [
    { light: '#FDEEE9', deep: '#F5D9D0', accent: '#FB7B6B' },
    { light: '#FDF4E9', deep: '#F5E4CC', accent: '#E8A070' },
    { light: '#F5EFE5', deep: '#E5D8C4', accent: '#C89868' },
    { light: '#FBE8E0', deep: '#F2CBBB', accent: '#D16F58' },
    { light: '#F3E8E1', deep: '#DCC8BA', accent: '#A67360' },
  ];

  const totalDuration = steps.reduce((acc, x) => acc + parseInt(x.dur), 0);

  return (
    <div style={{
      background: PROTO.cream, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative background type — monogram */}
      <div style={{
        position: 'absolute', top: 180, left: -40, right: -40,
        fontFamily: displayFont, fontSize: 360, fontWeight: 400,
        color: 'rgba(29,58,68,0.03)', lineHeight: 1, pointerEvents: 'none',
        textAlign: 'center', letterSpacing: '-0.05em', fontStyle: 'italic',
        zIndex: 0,
      }}>
        rituel
      </div>

      {/* Header */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 2,
      }}>
        <div>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 2,
            color: accent, textTransform: 'uppercase',
          }}>
            Maison NIKS · Coleção de hoje
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 28, fontWeight: 400,
            color: PROTO.ink, lineHeight: 1.05, marginTop: 6,
            letterSpacing: '-0.015em',
          }}>
            {mode === 'am' ? 'Aurora' : 'Crepúsculo'}
            <span style={{ fontStyle: 'italic', color: accent }}> — {doneCount}/{steps.length}</span>
          </div>
        </div>
        {/* AM/PM chip */}
        <div style={{
          padding: '6px 12px', borderRadius: 100,
          background: PROTO.white, border: '0.5px solid rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 600, color: PROTO.ink,
        }}>
          {mode === 'am' ? Icon.sun(PROTO.ink, 13) : Icon.moon(PROTO.ink, 13)}
          {mode === 'am' ? 'AM' : 'PM'}
        </div>
      </div>

      {/* Total time / narrative */}
      <div style={{
        padding: '20px 24px 0', display: 'flex', gap: 10, alignItems: 'center',
        position: 'relative', zIndex: 2,
      }}>
        {Icon.clock(PROTO.gray6, 13)}
        <div style={{ fontSize: 12, color: PROTO.gray6, fontWeight: 500 }}>
          {totalDuration} min de atenção · "o tempo é o ingrediente mais generoso"
        </div>
      </div>

      {/* Progress rail at top */}
      <div style={{
        padding: '20px 24px 0', display: 'flex', gap: 6,
        position: 'relative', zIndex: 2,
      }}>
        {steps.map((st, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              height: 2, borderRadius: 1,
              background: i <= currentStep ? accent : 'rgba(29,58,68,0.15)',
            }}/>
            <div style={{
              fontSize: 9, fontWeight: i === currentStep ? 700 : 500,
              color: i === currentStep ? accent : PROTO.gray6,
              letterSpacing: 1, textTransform: 'uppercase',
            }}>
              {String(i + 1).padStart(2, '0')}
            </div>
          </div>
        ))}
      </div>

      {/* The vitrine — tall perfume-bottle cards */}
      <div style={{
        padding: '32px 0 0', position: 'relative', zIndex: 2,
        height: 440, overflow: 'visible',
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '20px 24px', overflow: 'hidden', height: '100%',
        }}>
          {steps.map((st, i) => {
            const offset = i - currentStep;
            const isActive = offset === 0;
            const absOffset = Math.abs(offset);
            const tint = stepTints[i % stepTints.length];
            const done = i < doneCount;

            // Geometry per offset
            const scale = isActive ? 1 : (absOffset === 1 ? 0.82 : 0.64);
            const opacity = isActive ? 1 : (absOffset === 1 ? 0.75 : 0.35);
            const width = isActive ? 220 : (absOffset === 1 ? 140 : 90);
            const translateX = isActive ? 0 : (offset > 0 ? -20 * absOffset : 20 * absOffset);

            return (
              <div key={i} style={{
                flexShrink: 0, width, height: '100%',
                opacity, transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                transform: `translateX(${translateX}px)`,
                display: 'flex', alignItems: 'center',
              }}>
                <div style={{
                  background: `linear-gradient(180deg, ${tint.light} 0%, ${tint.deep} 100%)`,
                  borderRadius: 24, width: '100%', height: isActive ? '100%' : '85%',
                  position: 'relative', overflow: 'hidden',
                  border: `0.5px solid rgba(0,0,0,0.06)`,
                  boxShadow: isActive
                    ? '0 24px 48px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.5)'
                    : '0 8px 20px rgba(0,0,0,0.06)',
                  padding: isActive ? '24px 20px' : '16px 14px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                  {/* top: numeral + status */}
                  <div>
                    <div style={{
                      fontFamily: displayFont, fontSize: isActive ? 48 : 28,
                      fontWeight: 400, color: tint.accent,
                      lineHeight: 0.9, letterSpacing: '-0.03em',
                      fontStyle: 'italic',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    {isActive && (
                      <div style={{
                        width: 24, height: 1, background: tint.accent,
                        marginTop: 10, marginBottom: 10, opacity: 0.6,
                      }}/>
                    )}
                    <div style={{
                      fontSize: isActive ? 10 : 8, fontWeight: 700,
                      letterSpacing: isActive ? 2 : 1.2,
                      color: tint.accent, textTransform: 'uppercase',
                    }}>
                      {st.note}
                    </div>
                  </div>

                  {/* bottle illustration — center */}
                  {isActive && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                      <svg width="80" height="110" viewBox="0 0 80 110">
                        {/* cap */}
                        <rect x="28" y="4" width="24" height="16" rx="2" fill={tint.accent} opacity="0.95"/>
                        <rect x="32" y="18" width="16" height="8" fill={tint.accent} opacity="0.7"/>
                        {/* neck */}
                        <rect x="30" y="24" width="20" height="10" fill="rgba(255,255,255,0.7)"/>
                        {/* body */}
                        <path d="M22 36 Q16 40 16 50 L16 98 Q16 106 24 106 L56 106 Q64 106 64 98 L64 50 Q64 40 58 36 Z"
                          fill="rgba(255,255,255,0.85)" stroke={tint.accent} strokeWidth="0.5" strokeOpacity="0.3"/>
                        {/* liquid */}
                        <path d="M22 70 Q16 70 16 75 L16 98 Q16 106 24 106 L56 106 Q64 106 64 98 L64 75 Q64 70 58 70 Z"
                          fill={tint.accent} opacity="0.35"/>
                        {/* label */}
                        <rect x="24" y="56" width="32" height="22" fill="rgba(255,255,255,0.9)" stroke={tint.accent} strokeWidth="0.3"/>
                        <line x1="28" y1="62" x2="52" y2="62" stroke={tint.accent} strokeWidth="0.4" opacity="0.6"/>
                        <text x="40" y="71" textAnchor="middle" fontFamily="serif" fontSize="6" fontStyle="italic" fill={tint.accent}>N°{i+1}</text>
                      </svg>
                    </div>
                  )}

                  {/* bottom: title + duration */}
                  <div>
                    <div style={{
                      fontFamily: displayFont, fontSize: isActive ? 20 : 13,
                      fontWeight: 500, color: PROTO.ink,
                      lineHeight: 1.15, letterSpacing: '-0.01em',
                      textDecoration: done ? 'line-through' : 'none',
                      opacity: done ? 0.5 : 1,
                    }}>
                      {st.t}
                    </div>
                    {isActive && (
                      <div style={{
                        fontSize: 11, color: PROTO.inkSoft, lineHeight: 1.45,
                        marginTop: 8,
                      }}>
                        {st.s.split('.')[0]}.
                      </div>
                    )}
                    <div style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: 1,
                      color: PROTO.inkSoft, textTransform: 'uppercase',
                      marginTop: isActive ? 12 : 6,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {Icon.clock(PROTO.inkSoft, 10)} {st.dur}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action row — done + swipe */}
      <div style={{ padding: '24px 24px 0', position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {/* dots */}
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === currentStep ? 20 : 4, height: 4, borderRadius: 2,
                background: i === currentStep ? accent : 'rgba(29,58,68,0.2)',
                transition: 'all 300ms',
              }}/>
            ))}
          </div>
          <div style={{
            padding: '12px 22px', borderRadius: 100,
            background: PROTO.ink, color: '#fff',
            fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 6px 16px rgba(29,58,68,0.25)',
          }}>
            Aplicar N°{currentStep + 1}
            {Icon.arrowR('#fff', 14)}
          </div>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloVitrine });
