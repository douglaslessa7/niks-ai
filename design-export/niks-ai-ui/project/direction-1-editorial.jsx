// DIRECTION 1 — "EDITORIAL DE BELEZA"
// Sephora-esque: eyebrow pequenino em CAPS, serif display enorme,
// muito whitespace, paleta monocromática + coral como acento editorial.
// Sensação: revista de luxo, layout confiante, respiração aristocrática.

function ProtocoloEditorial({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 2 : 0;
  const modeLabel = mode === 'am' ? 'RITUAL DA MANHÃ' : 'RITUAL DA NOITE';
  const modeSubtitle = mode === 'am' ? 'Capítulo I' : 'Capítulo II';
  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

  return (
    <div style={{
      background: PROTO.white, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative',
    }}>
      {/* Top chrome — editorial masthead */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2,
          color: PROTO.ink, textTransform: 'uppercase',
        }}>
          NIKS · VOL. 04
        </div>
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: 1.5,
          color: PROTO.gray6, textTransform: 'uppercase',
        }}>
          {dateStr.toUpperCase()}
        </div>
      </div>

      {/* horizontal hair-line */}
      <div style={{ margin: '16px 24px 0', height: 0.5, background: 'rgba(0,0,0,0.2)' }}/>

      {/* Eyebrow */}
      <div style={{ padding: '32px 24px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
          color: accent, textTransform: 'uppercase',
        }}>
          {modeSubtitle} · {modeLabel}
        </div>
      </div>

      {/* Display title — serif, massive */}
      <div style={{ padding: '18px 24px 0', textAlign: 'center' }}>
        <div style={{
          fontFamily: displayFont,
          fontSize: 54, fontWeight: 400,
          color: PROTO.ink, lineHeight: 0.95,
          letterSpacing: '-0.02em',
          fontStyle: 'italic',
        }}>
          Bom dia,
        </div>
        <div style={{
          fontFamily: displayFont,
          fontSize: 54, fontWeight: 400,
          color: PROTO.ink, lineHeight: 0.95,
          letterSpacing: '-0.02em',
          marginTop: 4,
        }}>
          Nina.
        </div>
      </div>

      {/* Intro paragraph — editorial body */}
      <div style={{ padding: '22px 40px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 13, color: PROTO.inkSoft, lineHeight: 1.65,
          fontWeight: 400,
        }}>
          Seu ritual de hoje foi composto a partir da sua última análise — score <span style={{ color: accent, fontWeight: 600 }}>72</span>. Quatro gestos. Dez minutos. A pele agradece a repetição.
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 0' }}>
        <Divider color={accent} width={80}/>
      </div>

      {/* Mode switcher — ultra minimal, just a text line */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 32,
        padding: '28px 24px 0',
      }}>
        {['am', 'pm'].map(m => {
          const active = m === mode;
          return (
            <div key={m} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              borderBottom: active ? `1px solid ${PROTO.ink}` : 'none',
              paddingBottom: 4,
            }}>
              {m === 'am' ? Icon.sun(active ? PROTO.ink : PROTO.gray5, 14) : Icon.moon(active ? PROTO.ink : PROTO.gray5, 14)}
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: active ? PROTO.ink : PROTO.gray5,
              }}>
                {m === 'am' ? 'Manhã' : 'Noite'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress — fraction + thin rule */}
      <div style={{ padding: '36px 24px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 10,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.8,
            color: PROTO.gray6, textTransform: 'uppercase',
          }}>
            Progresso
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 28, fontWeight: 400,
            color: PROTO.ink, letterSpacing: '-0.02em',
          }}>
            <span style={{ color: accent }}>{String(doneCount).padStart(2, '0')}</span>
            <span style={{ color: PROTO.gray5, fontSize: 20, margin: '0 4px' }}>/</span>
            <span>{String(steps.length).padStart(2, '0')}</span>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: -0.5, left: 0,
            width: `${(doneCount / steps.length) * 100}%`,
            height: 2, background: accent, transition: 'width 600ms',
          }}/>
        </div>
      </div>

      {/* Steps — editorial "articles" */}
      <div style={{ padding: '40px 24px 0' }}>
        {steps.map((s, i) => {
          const done = i < doneCount;
          const current = i === doneCount;
          return (
            <div key={i} style={{
              paddingTop: 24, paddingBottom: 24,
              borderTop: i === 0 ? `0.5px solid ${PROTO.ink}` : 'none',
              borderBottom: `0.5px solid rgba(0,0,0,0.1)`,
              display: 'flex', gap: 18, alignItems: 'flex-start',
              opacity: done ? 0.4 : 1,
            }}>
              {/* Step number — oversized serif */}
              <div style={{ flexShrink: 0, width: 48 }}>
                <div style={{
                  fontFamily: displayFont, fontSize: 40, fontWeight: 400,
                  color: current ? accent : PROTO.ink,
                  lineHeight: 0.9, letterSpacing: '-0.02em',
                  fontStyle: 'italic',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                  color: PROTO.gray6, textTransform: 'uppercase',
                  marginTop: 4,
                }}>
                  {s.dur}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingTop: 2 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1.8,
                  color: accent, textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  {s.note}
                </div>
                <div style={{
                  fontFamily: displayFont, fontSize: 22, fontWeight: 500,
                  color: PROTO.ink, lineHeight: 1.1,
                  letterSpacing: '-0.01em',
                  textDecoration: done ? 'line-through' : 'none',
                  textDecorationColor: PROTO.gray5,
                  textDecorationThickness: '1px',
                }}>
                  {s.t}
                </div>
                <div style={{
                  fontSize: 12, color: PROTO.inkSoft, lineHeight: 1.55,
                  marginTop: 8,
                }}>
                  {s.s}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: 0.8,
                  color: PROTO.gray6, textTransform: 'uppercase',
                  marginTop: 10,
                  fontFamily: PROTO.mono,
                }}>
                  {s.ingredient}
                </div>
              </div>

              {/* Check ornament */}
              <div style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: 12,
                border: done ? 'none' : `0.5px solid ${PROTO.ink}`,
                background: done ? PROTO.ink : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 8,
              }}>
                {done && Icon.check('#fff', 12)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Editorial footer — verse */}
      <div style={{ padding: '48px 40px 0', textAlign: 'center' }}>
        <Divider color={accent} width={60}/>
        <div style={{
          fontFamily: displayFont, fontSize: 17, fontWeight: 400,
          color: PROTO.ink, lineHeight: 1.4, marginTop: 20,
          fontStyle: 'italic',
        }}>
          "A pele lembra<br/>o cuidado."
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1.8,
          color: PROTO.gray6, textTransform: 'uppercase',
          marginTop: 14,
        }}>
          NIKS · Um diário da pele
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloEditorial });
