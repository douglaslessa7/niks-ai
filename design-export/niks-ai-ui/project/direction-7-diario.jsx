// DIRECTION 7 — "DIÁRIO"
// O ritual como diário da pele. Streak horizontal de dias no topo,
// cards de steps como "entradas de diário" com tipografia manuscrita em detalhes.
// Fundo off-white tipo papel, detalhes em coral + ink. Sensação: journal de beleza.

function ProtocoloDiario({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 2 : 0;

  // Last 14 days streak
  const days = [
    { d: 1, done: true }, { d: 2, done: true }, { d: 3, done: false },
    { d: 4, done: true }, { d: 5, done: true }, { d: 6, done: true },
    { d: 7, done: true }, { d: 8, done: false }, { d: 9, done: true },
    { d: 10, done: true }, { d: 11, done: true }, { d: 12, done: true },
    { d: 13, done: true }, { d: 14, done: false, current: true },
  ];

  const streak = 7;

  return (
    <div style={{
      background: '#FAF7F1', minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative',
    }}>
      {/* Paper texture line */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(90deg, transparent 48%, rgba(29,58,68,0.04) 48%, rgba(29,58,68,0.04) 49%, transparent 49%)',
        pointerEvents: 'none',
      }}/>

      {/* Header */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        position: 'relative', zIndex: 2,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
            color: accent, textTransform: 'uppercase',
          }}>
            Quinta · 14 de abril
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 34, fontWeight: 400,
            color: PROTO.ink, lineHeight: 1, marginTop: 6,
            letterSpacing: '-0.02em', fontStyle: 'italic',
          }}>
            Diário da pele
          </div>
        </div>
        {/* AM/PM */}
        <div style={{
          padding: '6px 4px', background: PROTO.white, borderRadius: 100,
          border: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', gap: 2,
        }}>
          {['am', 'pm'].map(m => {
            const a = m === mode;
            return (
              <div key={m} style={{
                padding: '4px 10px', borderRadius: 100,
                background: a ? PROTO.ink : 'transparent',
                color: a ? '#fff' : PROTO.gray6,
                fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {m === 'am' ? Icon.sun(a ? '#fff' : PROTO.gray6, 11) : Icon.moon(a ? '#fff' : PROTO.gray6, 11)}
                {m.toUpperCase()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Streak track */}
      <div style={{ padding: '28px 24px 0', position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.8,
            color: PROTO.gray6, textTransform: 'uppercase',
          }}>
            Últimos 14 dias
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: PROTO.ink,
          }}>
            <span style={{ fontFamily: displayFont, fontStyle: 'italic', fontSize: 16, color: accent }}>{streak}</span> dias em ritmo
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 4,
          background: PROTO.white, padding: '14px 12px', borderRadius: 16,
          border: '0.5px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: '100%', height: 28, borderRadius: 4,
                background: d.current ? 'transparent' : (d.done ? accent : '#F0EDE4'),
                border: d.current ? `1.5px dashed ${accent}` : 'none',
                opacity: d.done ? 1 : 0.7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: d.done ? '#fff' : '#999',
              }}>
                {d.current ? '·' : (d.done ? '✓' : '')}
              </div>
              <div style={{
                fontSize: 8, fontWeight: 600, color: d.current ? accent : PROTO.gray6,
                letterSpacing: 0.3,
              }}>
                {d.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's entry title */}
      <div style={{
        padding: '32px 24px 0', position: 'relative', zIndex: 2,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 12,
          borderBottom: `0.5px solid ${PROTO.ink}`, paddingBottom: 12,
        }}>
          <div style={{
            fontFamily: displayFont, fontSize: 20, fontWeight: 500,
            color: PROTO.ink, letterSpacing: '-0.01em',
          }}>
            Hoje — {mode === 'am' ? 'manhã' : 'noite'}
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            color: accent, textTransform: 'uppercase',
          }}>
            {doneCount}/{steps.length} · {steps.reduce((a,x) => a + parseInt(x.dur), 0)} min
          </div>
        </div>
      </div>

      {/* Step entries */}
      <div style={{ padding: '0 24px', position: 'relative', zIndex: 2 }}>
        {steps.map((s, i) => {
          const done = i < doneCount;
          const current = i === doneCount;
          return (
            <div key={i} style={{
              padding: '22px 0',
              borderBottom: '0.5px solid rgba(0,0,0,0.1)',
              display: 'flex', gap: 16, alignItems: 'flex-start',
              position: 'relative',
            }}>
              {/* Timestamp/marker */}
              <div style={{ flexShrink: 0, width: 52, paddingTop: 2 }}>
                <div style={{
                  fontFamily: displayFont, fontSize: 14, fontWeight: 500,
                  color: done ? PROTO.gray5 : PROTO.ink, fontStyle: 'italic',
                  letterSpacing: '-0.01em',
                }}>
                  {mode === 'am'
                    ? ['07:02', '07:05', '07:07', '07:09'][i]
                    : ['21:30', '21:33', '21:36', '21:40', '21:45'][i]}
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 1,
                  color: PROTO.gray6, textTransform: 'uppercase',
                  marginTop: 3,
                }}>
                  N° {String(i + 1).padStart(2, '0')}
                </div>
              </div>

              {/* Ink marker */}
              <div style={{
                flexShrink: 0, width: 12, display: 'flex', justifyContent: 'center',
                paddingTop: 6,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: done ? accent : (current ? 'transparent' : 'transparent'),
                  border: current ? `1.5px solid ${accent}` : (done ? 'none' : `0.5px dashed ${PROTO.gray5}`),
                  boxShadow: current ? `0 0 0 3px ${accent}22` : 'none',
                }}/>
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1.8,
                  color: accent, textTransform: 'uppercase',
                  marginBottom: 4,
                }}>
                  {s.note}
                </div>
                <div style={{
                  fontFamily: displayFont, fontSize: 19, fontWeight: 500,
                  color: done ? PROTO.gray5 : PROTO.ink,
                  lineHeight: 1.15, letterSpacing: '-0.01em',
                  textDecoration: done ? 'line-through' : 'none',
                  textDecorationThickness: '0.5px',
                }}>
                  {s.t}
                </div>
                <div style={{
                  fontSize: 12, color: PROTO.inkSoft, lineHeight: 1.55,
                  marginTop: 6,
                  fontStyle: 'italic', fontFamily: displayFont, fontWeight: 400,
                }}>
                  "{s.benefit}"
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: 0.5,
                  color: PROTO.gray6, marginTop: 8,
                  fontFamily: PROTO.mono,
                }}>
                  {s.ingredient} · {s.dur}
                </div>
              </div>

              {/* handwritten stamp for done */}
              {done && (
                <div style={{
                  flexShrink: 0, transform: 'rotate(-8deg)',
                  border: `1.5px solid ${accent}`, borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                  color: accent, textTransform: 'uppercase',
                  fontFamily: displayFont, fontStyle: 'italic',
                  marginTop: 8,
                }}>
                  feito
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Handwritten signature at bottom */}
      <div style={{ padding: '32px 24px 0', position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{
          fontFamily: displayFont, fontSize: 15, fontWeight: 400,
          color: PROTO.ink, fontStyle: 'italic', lineHeight: 1.4,
        }}>
          — com carinho,
          <br/>
          <span style={{ fontSize: 20 }}>Nina</span>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloDiario });
