// DIRECTION 2 — "CLÍNICA DE LUXO"
// Spa dermatológico premium. Cream background, numeração romana,
// cartões elevados com filete coral, tipografia tranquila, progress ring grande.
// Sensação: consultório da Dra. Barbara Sturm, silencioso e confiante.

function ProtocoloClinica({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 2 : 0;

  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);
  const pct = doneCount / steps.length;
  const ringSize = 130;
  const r = 58;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{
      background: PROTO.pearl, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative',
    }}>
      {/* Top chrome — logo + "clinical" chip */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 2.5,
          color: PROTO.ink, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 800 }}>N</div>
          NIKS · ATELIER
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 100,
          border: '0.5px solid rgba(0,0,0,0.15)',
          fontSize: 10, fontWeight: 600, letterSpacing: 1.2,
          color: PROTO.gray6, textTransform: 'uppercase',
        }}>
          Dia 14
        </div>
      </div>

      {/* Hero — ring progress + greeting */}
      <div style={{
        padding: '40px 24px 0',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Ring */}
        <div style={{ position: 'relative', width: ringSize, height: ringSize }}>
          {/* ornamental outer ring */}
          <svg width={ringSize} height={ringSize} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1"/>
            <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke={accent} strokeWidth="2"
              strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"/>
            {/* tiny tick marks at each step */}
            {steps.map((_, i) => {
              const angle = (i / steps.length) * Math.PI * 2 - Math.PI/2;
              const x1 = ringSize/2 + Math.cos(angle) * (r + 6);
              const y1 = ringSize/2 + Math.sin(angle) * (r + 6);
              const x2 = ringSize/2 + Math.cos(angle) * (r + 11);
              const y2 = ringSize/2 + Math.sin(angle) * (r + 11);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i < doneCount ? accent : 'rgba(0,0,0,0.2)'} strokeWidth="1.2" strokeLinecap="round"/>;
            })}
          </svg>
          {/* Roman numeral center */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              color: PROTO.gray6, textTransform: 'uppercase',
            }}>
              Concluído
            </div>
            <div style={{
              fontFamily: displayFont, fontSize: 38, fontWeight: 400,
              color: PROTO.ink, lineHeight: 1, letterSpacing: '-0.02em',
              marginTop: 4,
            }}>
              {toRoman(doneCount) || '—'}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 500, letterSpacing: 1.2,
              color: PROTO.gray6, textTransform: 'uppercase',
              marginTop: 2,
            }}>
              de {toRoman(steps.length)}
            </div>
          </div>
        </div>

        {/* Greeting */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
            color: accent, textTransform: 'uppercase',
          }}>
            {mode === 'am' ? '☀ Rito matinal' : '☾ Rito noturno'}
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 30, fontWeight: 400,
            color: PROTO.ink, lineHeight: 1.1, letterSpacing: '-0.015em',
            marginTop: 10,
          }}>
            Seu protocolo<br/>personalizado
          </div>
          <div style={{
            fontSize: 12, color: PROTO.inkSoft, lineHeight: 1.55,
            marginTop: 10, maxWidth: 280, margin: '10px auto 0',
          }}>
            Quatro etapas, formuladas para sua análise de <span style={{ color: accent, fontWeight: 600 }}>score 72</span>.
          </div>
        </div>
      </div>

      {/* Mode toggle — serif segmented */}
      <div style={{ padding: '28px 24px 0' }}>
        <div style={{
          display: 'flex', background: '#fff', borderRadius: 100,
          padding: 4, border: '0.5px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {['am', 'pm'].map(m => {
            const active = m === mode;
            return (
              <div key={m} style={{
                flex: 1, padding: '10px 0', borderRadius: 100,
                background: active ? PROTO.ink : 'transparent',
                color: active ? '#fff' : PROTO.gray6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: displayFont, fontSize: 15, fontWeight: 500,
                letterSpacing: '-0.01em', fontStyle: 'italic',
              }}>
                {m === 'am' ? Icon.sun(active ? '#fff' : PROTO.gray6, 14) : Icon.moon(active ? '#fff' : PROTO.gray6, 14)}
                {m === 'am' ? 'manhã' : 'noite'}
              </div>
            );
          })}
        </div>
      </div>

      {/* Roman-numbered steps — premium cards with coral filet */}
      <div style={{ padding: '24px 18px 0' }}>
        {steps.map((s, i) => {
          const done = i < doneCount;
          const current = i === doneCount;
          return (
            <div key={i} style={{
              background: PROTO.white, borderRadius: 20, marginBottom: 10,
              padding: '18px 18px 18px 22px', position: 'relative',
              border: '0.5px solid rgba(0,0,0,0.06)',
              boxShadow: current ? '0 4px 24px rgba(251,123,107,0.12)' : '0 1px 4px rgba(0,0,0,0.03)',
              display: 'flex', gap: 14, alignItems: 'flex-start',
              opacity: done ? 0.55 : 1,
              overflow: 'hidden',
            }}>
              {/* left filet */}
              <div style={{
                position: 'absolute', left: 0, top: 12, bottom: 12,
                width: 2, borderRadius: 1,
                background: current ? accent : (done ? accent : 'rgba(0,0,0,0.08)'),
              }}/>

              {/* Roman numeral */}
              <div style={{
                flexShrink: 0, width: 40, textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: displayFont, fontSize: 26, fontWeight: 400,
                  color: current ? accent : PROTO.ink,
                  lineHeight: 1, letterSpacing: '-0.01em',
                  fontStyle: 'italic',
                }}>
                  {toRoman(i + 1)}
                </div>
                <div style={{
                  height: 1, width: 20, background: accent, margin: '6px auto',
                  opacity: 0.5,
                }}/>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 1,
                  color: PROTO.gray6, textTransform: 'uppercase',
                }}>
                  {s.dur}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: PROTO.ink,
                  textDecoration: done ? 'line-through' : 'none',
                  textDecorationColor: PROTO.gray5,
                }}>
                  {s.t}
                </div>
                <div style={{
                  fontSize: 12, color: PROTO.inkSoft, lineHeight: 1.5,
                  marginTop: 4,
                }}>
                  {s.s}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginTop: 10,
                  fontSize: 10, fontWeight: 500, letterSpacing: 0.5,
                  color: PROTO.gray6,
                  fontFamily: PROTO.mono,
                }}>
                  {Icon.droplet(PROTO.gray6, 11)} {s.ingredient}
                </div>
              </div>

              {/* Check circle */}
              <div style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 14,
                border: done ? 'none' : `1.2px solid rgba(0,0,0,0.15)`,
                background: done ? accent : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                alignSelf: 'center',
              }}>
                {done && Icon.check('#fff', 13)}
                {current && !done && (
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: accent }}/>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Closing signature card */}
      <div style={{ padding: '16px 18px 0' }}>
        <div style={{
          background: PROTO.coralTint, borderRadius: 20,
          padding: '18px 20px',
          border: `0.5px solid ${PROTO.coralTintDeep}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22,
            background: PROTO.white, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${PROTO.coralTintDeep}`,
          }}>
            {Icon.flower(accent, 22)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
              color: accent, textTransform: 'uppercase',
            }}>
              Assinatura NIKS
            </div>
            <div style={{
              fontFamily: displayFont, fontSize: 15, fontWeight: 500,
              color: PROTO.ink, marginTop: 3, lineHeight: 1.25,
              fontStyle: 'italic',
            }}>
              "O luxo está na constância, não na intensidade."
            </div>
          </div>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloClinica });
