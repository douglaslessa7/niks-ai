// DIRECTION 6 — "COUTURE"
// Direto da referência Sephora mas maximizado. Preto profundo + coral + branco.
// Ultra tipográfico, horizontal rules, números em serif imenso, sem ícones desnecessários.
// Sensação: convite para um desfile de alta costura. Conciso e imperativo.

function ProtocoloCouture({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 2 : 0;
  const total = steps.length;

  return (
    <div style={{
      background: PROTO.white, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative',
    }}>
      {/* Top masthead — black bar */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24, paddingBottom: 20,
        background: PROTO.black, color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        position: 'relative',
      }}>
        <div>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 3,
            color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
          }}>
            Nº 014 · {mode === 'am' ? 'Matinée' : 'Soirée'}
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 26, fontWeight: 400,
            color: '#fff', lineHeight: 1, marginTop: 6,
            fontStyle: 'italic', letterSpacing: '-0.01em',
          }}>
            NIKS
          </div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2,
          color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase',
        }}>
          {doneCount}/{total}
        </div>
      </div>

      {/* Thin coral rule */}
      <div style={{ height: 2, background: accent }}/>

      {/* AM/PM pill switch — black filled */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{
          display: 'flex', gap: 0,
          border: `1px solid ${PROTO.black}`, borderRadius: 0,
        }}>
          {['am', 'pm'].map(m => {
            const active = m === mode;
            return (
              <div key={m} style={{
                flex: 1, padding: '12px 0', textAlign: 'center',
                background: active ? PROTO.black : '#fff',
                color: active ? '#fff' : PROTO.black,
                fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
                textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {m === 'am' ? 'Manhã · AM' : 'Noite · PM'}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bold statement */}
      <div style={{ padding: '48px 24px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 3,
          color: accent, textTransform: 'uppercase',
        }}>
          WELCOME · NINA
        </div>
        <div style={{
          fontFamily: displayFont, fontSize: 44, fontWeight: 400,
          color: PROTO.black, lineHeight: 0.98, marginTop: 16,
          letterSpacing: '-0.025em',
        }}>
          The ritual
          <br/>
          <span style={{ fontStyle: 'italic', color: accent }}>for your skin.</span>
        </div>
        <div style={{
          fontSize: 13, color: '#404040', lineHeight: 1.6, maxWidth: 300,
          margin: '18px auto 0',
        }}>
          Quatro atos, cuidadosamente coreografados para sua pele de hoje. Um gesto por vez. Uma pele por vez.
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0 0' }}>
        <div style={{ width: 40, height: 1, background: PROTO.black }}/>
      </div>

      {/* Steps — one per section with giant serif numbers */}
      <div style={{ padding: '24px 0 0' }}>
        {steps.map((s, i) => {
          const done = i < doneCount;
          const current = i === doneCount;
          return (
            <div key={i} style={{
              padding: '32px 24px',
              borderTop: i === 0 ? `1px solid ${PROTO.black}` : `0.5px solid rgba(0,0,0,0.15)`,
              borderBottom: i === steps.length - 1 ? `1px solid ${PROTO.black}` : 'none',
              position: 'relative',
              background: current ? `linear-gradient(180deg, ${PROTO.coralTint} 0%, transparent 100%)` : 'transparent',
            }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                {/* Gigantic number */}
                <div style={{
                  flexShrink: 0, minWidth: 76,
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: displayFont, fontSize: 76, fontWeight: 400,
                    color: done ? '#D0D0D0' : (current ? accent : PROTO.black),
                    lineHeight: 0.85, letterSpacing: '-0.04em',
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: 2,
                    color: '#808080', textTransform: 'uppercase',
                    marginTop: 10,
                  }}>
                    ━ {s.dur} ━
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingTop: 8 }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 2.2,
                    color: accent, textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>
                    {s.note} · STEP {i + 1}
                  </div>
                  <div style={{
                    fontFamily: displayFont, fontSize: 24, fontWeight: 400,
                    color: done ? '#A0A0A0' : PROTO.black,
                    lineHeight: 1.05, letterSpacing: '-0.015em',
                    textDecoration: done ? 'line-through' : 'none',
                    textDecorationThickness: '0.5px',
                  }}>
                    {s.t}
                  </div>
                  <div style={{
                    fontSize: 12, color: '#404040', lineHeight: 1.55,
                    marginTop: 10,
                  }}>
                    {s.s}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 14, paddingTop: 10,
                    borderTop: '0.5px solid rgba(0,0,0,0.12)',
                    fontSize: 9, fontWeight: 600, letterSpacing: 1.5,
                    color: '#606060', textTransform: 'uppercase',
                    fontFamily: PROTO.mono,
                  }}>
                    {s.ingredient}
                  </div>
                </div>
              </div>

              {/* Done mark — bottom right, minimal */}
              {done && (
                <div style={{
                  position: 'absolute', top: 24, right: 24,
                  fontSize: 9, fontWeight: 700, letterSpacing: 2,
                  color: accent, textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  ✓ Feito
                </div>
              )}
              {current && (
                <div style={{
                  position: 'absolute', top: 24, right: 24,
                  fontSize: 9, fontWeight: 700, letterSpacing: 2,
                  color: accent, textTransform: 'uppercase',
                  padding: '4px 10px', border: `1px solid ${accent}`,
                }}>
                  Agora
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer quote */}
      <div style={{ padding: '48px 24px 0', textAlign: 'center' }}>
        <div style={{
          fontFamily: displayFont, fontSize: 18, fontWeight: 400,
          color: PROTO.black, lineHeight: 1.35,
          fontStyle: 'italic', letterSpacing: '-0.005em',
        }}>
          "O cuidado é a mais silenciosa<br/>forma de elegância."
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
          color: '#808080', textTransform: 'uppercase',
          marginTop: 14,
        }}>
          — NIKS · Diário
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloCouture });
