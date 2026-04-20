// DIRECTION — "QUIETUDE v2"
// Ajustes pedidos: fundo branco puro, "Rotina da manhã", "quatro passos",
// minutos reais somados, todos os passos com a mesma presença visual (todos coloridos).

function ProtocoloQuietudeV2({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 1 : 0;
  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);

  // Soma real da duração — parseia cada step.dur ("1 min", "30 seg", "45 seg")
  const totalSec = steps.reduce((a, x) => {
    const m = x.dur.match(/(\d+)\s*(min|seg)/i);
    if (!m) return a;
    const n = parseInt(m[1]);
    return a + (m[2].toLowerCase() === 'min' ? n * 60 : n);
  }, 0);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const totalLabel = secs === 0 ? `${mins} min` : `${mins} min ${secs} seg`;

  // Fundo branco puro agora
  const bg = '#FFFFFF';
  const ink = '#2B2724';
  const inkSoft = 'rgba(43,39,36,0.55)';
  const inkHair = 'rgba(43,39,36,0.10)';
  const inkWhisper = 'rgba(43,39,36,0.35)';

  const orb = mode === 'am'
    ? 'radial-gradient(circle at 35% 30%, #FFE8DF 0%, #F9C9B6 35%, #E89178 75%, #C86651 100%)'
    : 'radial-gradient(circle at 35% 30%, #E8D3CB 0%, #B88A7A 35%, #7D5040 75%, #3D2520 100%)';

  return (
    <div style={{
      background: bg, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative', color: ink,
    }}>
      {/* Masthead */}
      <div style={{
        paddingTop: 62, paddingLeft: 28, paddingRight: 28,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 2.8,
          color: inkSoft, textTransform: 'uppercase',
        }}>NIKS</div>
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: 0.5,
          color: inkSoft, fontVariantNumeric: 'tabular-nums',
        }}>14 nov · qui</div>
      </div>

      {/* Talismã */}
      <div style={{
        padding: '56px 28px 0',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: orb,
          boxShadow: mode === 'am'
            ? '0 18px 44px rgba(232,145,120,0.28), inset 0 2px 0 rgba(255,255,255,0.5)'
            : '0 18px 44px rgba(61,37,32,0.4), inset 0 2px 0 rgba(255,255,255,0.15)',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: 14, left: 26, width: 42, height: 26,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%)',
            filter: 'blur(4px)',
          }}/>
        </div>
      </div>

      {/* Title block */}
      <div style={{ padding: '36px 28px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 2.5,
          color: accent, textTransform: 'uppercase',
        }}>
          {mode === 'am' ? 'Rotina da manhã' : 'Rotina da noite'}
        </div>
        <div style={{
          fontFamily: displayFont, fontSize: 38, fontWeight: 400,
          color: ink, lineHeight: 1.05, letterSpacing: '-0.025em',
          marginTop: 14,
        }}>
          <span style={{ fontStyle: 'italic' }}>Hoje,</span> {steps.length === 4 ? 'quatro' : 'cinco'} passos.
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, marginTop: 22,
        }}>
          <div style={{ width: 36, height: 0.5, background: inkHair }}/>
          <div style={{ width: 5, height: 5, borderRadius: 3, background: accent }}/>
          <div style={{ width: 36, height: 0.5, background: inkHair }}/>
        </div>

        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: 0.4,
          color: inkSoft, marginTop: 20,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {totalLabel} &nbsp;·&nbsp; score 72
        </div>
      </div>

      {/* Steps — all with equal visual presence, each has its own coral bar */}
      <div style={{ padding: '64px 28px 0' }}>
        {steps.map((s, i) => {
          const done = i < doneCount;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start',
              gap: 20, padding: '22px 0 22px 16px',
              borderBottom: i < steps.length - 1 ? `0.5px solid ${inkHair}` : 'none',
              position: 'relative',
              opacity: done ? 0.42 : 1,
            }}>
              {/* Every step gets its own coral bar */}
              <div style={{
                position: 'absolute', left: 0, top: 22, bottom: 22,
                width: 2, borderRadius: 1, background: accent,
              }}/>

              <div style={{
                fontFamily: displayFont, fontSize: 16, fontWeight: 400,
                color: accent, fontStyle: 'italic',
                width: 22, flexShrink: 0, paddingTop: 4,
                letterSpacing: '-0.01em',
              }}>
                {toRoman(i + 1)}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: displayFont, fontSize: 20, fontWeight: 400,
                  color: ink, lineHeight: 1.2, letterSpacing: '-0.015em',
                  textDecoration: done ? 'line-through' : 'none',
                  textDecorationColor: inkWhisper,
                  textDecorationThickness: '0.5px',
                }}>{s.t}</div>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
                  color: inkSoft, marginTop: 6,
                }}>{s.ingredient}</div>
              </div>

              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
                color: inkSoft, flexShrink: 0, paddingTop: 6,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {done ? (
                  <div style={{
                    width: 18, height: 18, borderRadius: 9,
                    background: inkWhisper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: -2,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path d="M2 5L4.2 7L8 3" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ) : s.dur}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 86, zIndex: 25,
        padding: '48px 24px 0',
        background: `linear-gradient(180deg, ${bg}00 0%, ${bg}ee 35%, ${bg} 100%)`,
      }}>
        <div style={{
          background: accent, borderRadius: 100,
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: `0 14px 32px ${accent}38`,
        }}>
          <div style={{
            color: '#fff', fontSize: 14, fontWeight: 500,
            fontFamily: displayFont, fontStyle: 'italic',
            letterSpacing: '-0.005em',
          }}>Começar minha rotina</div>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8m0 0L7.5 3.5M11 7L7.5 10.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloQuietudeV2 });
