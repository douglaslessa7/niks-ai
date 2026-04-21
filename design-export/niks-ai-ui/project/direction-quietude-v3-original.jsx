// DIRECTION — "QUIETUDE v3 ORIGINAL"
// Variante com padding lateral 28px e título 38px (pode quebrar em duas linhas).
// Mantida a pedido do usuário como referência.

function ProtocoloQuietudeV3Original({ accent = PROTO.coral, displayFont = PROTO.serif, mode: initialMode = 'am' }) {
  const [mode, setMode] = React.useState(initialMode);
  const [openStep, setOpenStep] = React.useState(null);
  const [ritualOpen, setRitualOpen] = React.useState(false);

  // keep prop in sync with tweak panel
  React.useEffect(() => { setMode(initialMode); }, [initialMode]);

  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 1 : 0;
  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);

  const totalSec = steps.reduce((a, x) => {
    const m = x.dur.match(/(\d+)\s*(min|seg)/i);
    if (!m) return a;
    const n = parseInt(m[1]);
    return a + (m[2].toLowerCase() === 'min' ? n * 60 : n);
  }, 0);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const totalLabel = secs === 0 ? `${mins} min` : `${mins} min ${secs} seg`;

  const isPM = mode === 'pm';

  // Theme — light (day) vs night (sky)
  const bg = isPM
    ? 'linear-gradient(180deg, #0F1420 0%, #1A1F2E 45%, #2A1F28 100%)'
    : '#FFFFFF';
  const ink = isPM ? '#FFFFFF' : '#2B2724';
  const inkSoft = isPM ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.55)';
  const inkHair = isPM ? 'rgba(255,255,255,0.14)' : 'rgba(43,39,36,0.10)';
  const inkWhisper = isPM ? 'rgba(255,255,255,0.42)' : 'rgba(43,39,36,0.35)';

  // Orb — sunset pearl by day, full moon by night
  const orb = isPM
    ? 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #F4EEE4 30%, #D8CDB8 60%, #A89676 100%)'
    : 'radial-gradient(circle at 35% 30%, #FFE8DF 0%, #F9C9B6 35%, #E89178 75%, #C86651 100%)';

  const orbShadow = isPM
    ? '0 0 60px rgba(255,248,220,0.35), 0 18px 44px rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.6)'
    : '0 18px 44px rgba(232,145,120,0.28), inset 0 2px 0 rgba(255,255,255,0.5)';

  const currentStep = openStep != null ? steps[openStep] : null;

  // Deterministic starfield positions (60 stars)
  return (
    <div style={{
      background: bg, height: '100%', fontFamily: PROTO.sans,
      position: 'relative', color: ink, overflow: 'hidden',
      transition: 'background 700ms ease',
    }}>
      {/* Starfield vivo — only in PM */}
      {isPM && <NightSky/>}
      {/* ----- Scrolling content area — full height, CTA + tabbar float over it ----- */}
      <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 180, position: 'relative', zIndex: 1 }}>
      {/* Masthead */}
      <div style={{
        paddingTop: 62, paddingLeft: 28, paddingRight: 28,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.8, color: inkSoft, textTransform: 'uppercase' }}>NIKS</div>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.5, color: inkSoft, fontVariantNumeric: 'tabular-nums' }}>14 nov · qui</div>
      </div>

      {/* Talismã — sunset pearl / full moon with craters */}
      <div style={{ padding: '56px 28px 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: orb, boxShadow: orbShadow,
          position: 'relative', transition: 'background 700ms ease, box-shadow 700ms ease',
        }}>
          {/* highlight reflection — both modes */}
          <div style={{
            position: 'absolute', top: 14, left: 26, width: 42, height: 26,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%)',
            filter: 'blur(4px)',
          }}/>
          {/* Moon craters — only in PM */}
          {isPM && (
            <>
              <div style={{ position: 'absolute', top: 42, left: 70, width: 14, height: 14, borderRadius: 7,
                background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 60%, transparent 100%)' }}/>
              <div style={{ position: 'absolute', top: 72, left: 38, width: 10, height: 10, borderRadius: 5,
                background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.16) 60%, transparent 100%)' }}/>
              <div style={{ position: 'absolute', top: 56, left: 92, width: 7, height: 7, borderRadius: 4,
                background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.14) 60%, transparent 100%)' }}/>
              <div style={{ position: 'absolute', top: 88, left: 68, width: 6, height: 6, borderRadius: 3,
                background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 60%, transparent 100%)' }}/>
              <div style={{ position: 'absolute', top: 34, left: 50, width: 5, height: 5, borderRadius: 3,
                background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }}/>
            </>
          )}
        </div>
      </div>

      {/* AM/PM switch — integrated, serif italic */}
      <div style={{
        padding: '26px 28px 0',
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14,
      }}>
        <div
          onClick={() => setMode('am')}
          style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            fontStyle: 'italic', letterSpacing: '-0.005em',
            color: mode === 'am' ? accent : inkWhisper,
            cursor: 'pointer', transition: 'color 300ms ease',
            paddingBottom: 3,
            borderBottom: mode === 'am' ? `0.5px solid ${accent}` : '0.5px solid transparent',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          {/* sol — círculo + 8 raios finos */}
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2.4" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="7" y1="1" x2="7" y2="2.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="7" y1="11.2" x2="7" y2="13" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="1" y1="7" x2="2.8" y2="7" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="11.2" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="2.76" y1="2.76" x2="4.04" y2="4.04" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="9.96" y1="9.96" x2="11.24" y2="11.24" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="11.24" y1="2.76" x2="9.96" y2="4.04" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
            <line x1="4.04" y1="9.96" x2="2.76" y2="11.24" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          </svg>
          manhã
        </div>
        <div style={{ width: 3, height: 3, borderRadius: 2, background: inkWhisper }}/>
        <div
          onClick={() => setMode('pm')}
          style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            fontStyle: 'italic', letterSpacing: '-0.005em',
            color: mode === 'pm' ? accent : inkWhisper,
            cursor: 'pointer', transition: 'color 300ms ease',
            paddingBottom: 3,
            borderBottom: mode === 'pm' ? `0.5px solid ${accent}` : '0.5px solid transparent',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          noite
          {/* lua — crescente fino */}
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M11 8.5 A 5 5 0 1 1 5.5 3 A 4 4 0 0 0 11 8.5 Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Title block */}
      <div style={{ padding: '26px 28px 0', textAlign: 'center' }}>
        <div style={{
          fontFamily: displayFont, fontSize: 38, fontWeight: 400,
          color: ink, lineHeight: 1.05, letterSpacing: '-0.025em',
        }}>
          <span style={{ fontStyle: 'italic' }}>{mode === 'am' ? 'Manhã,' : 'Noite,'}</span> {steps.length === 4 ? 'quatro' : 'cinco'} passos.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 22 }}>
          <div style={{ width: 36, height: 0.5, background: inkHair }}/>
          <div style={{ width: 5, height: 5, borderRadius: 3, background: accent }}/>
          <div style={{ width: 36, height: 0.5, background: inkHair }}/>
        </div>

        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: 0.4,
          color: inkSoft, marginTop: 20, fontVariantNumeric: 'tabular-nums',
        }}>
          {totalLabel} &nbsp;·&nbsp; score 72
        </div>
      </div>



      {/* Steps — tocáveis, todos coloridos */}
      <div style={{ padding: '24px 28px 0' }}>
        {steps.map((s, i) => {
          const done = i < doneCount;
          return (
            <div key={i}
              onClick={() => setOpenStep(i)}
              style={{
                display: 'flex', alignItems: 'flex-start',
                gap: 20, padding: '22px 0 22px 16px',
                borderBottom: i < steps.length - 1 ? `0.5px solid ${inkHair}` : 'none',
                position: 'relative',
                opacity: done ? 0.42 : 1,
                cursor: 'pointer',
              }}>
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
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0, paddingTop: 6,
                fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
                color: inkSoft, fontVariantNumeric: 'tabular-nums',
              }}>
                {done ? (
                  <div style={{
                    width: 18, height: 18, borderRadius: 9, background: inkWhisper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: -2,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path d="M2 5L4.2 7L8 3" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ) : <span>{s.dur}</span>}
                {/* chevron — sinaliza tocável */}
                <svg width="7" height="12" viewBox="0 0 7 12" style={{ opacity: 0.9 }}>
                  <path d="M1 1L6 6L1 11" stroke="#FB7B6B" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      </div>
      {/* ----- end scroll ----- */}

      {/* CTA — flutuante, sem background container */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 112,
        padding: '0 24px', zIndex: 25, pointerEvents: 'none',
      }}>
        <div
          onClick={() => setRitualOpen(true)}
          style={{
          background: accent, borderRadius: 100,
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: `0 14px 32px ${accent}38`,
          pointerEvents: 'auto', cursor: 'pointer',
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

      {/* Tab bar — fixa no rodapé */}
      <ProtoTabBar active="protocolo" theme={isPM ? 'dark' : 'light'}/>

      {/* ══════ CERIMÔNIA OVERLAY ══════ */}
      {ritualOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          animation: 'qv3o-cerim-in 420ms cubic-bezier(0.25, 1, 0.5, 1)',
        }}>
          <style>{`
            @keyframes qv3o-cerim-in {
              from { opacity: 0; transform: scale(1.02); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
          <ProtocoloCerimonia
            accent={accent}
            displayFont={displayFont}
            mode={mode}
            currentStep={0}
            onClose={() => setRitualOpen(false)}
          />
        </div>
      )}

      {/* ══════ BOTTOM SHEET — detalhes do passo ══════ */}
      {currentStep && (
        <>
          {/* backdrop */}
          <div
            onClick={() => setOpenStep(null)}
            style={{
              position: 'absolute', inset: 0, zIndex: 40,
              background: isPM ? 'rgba(0,0,0,0.5)' : 'rgba(43,39,36,0.3)', backdropFilter: 'blur(2px)',
              animation: 'qv3-fade 250ms ease',
            }}
          />
          <style>{`
            @keyframes qv3-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes qv3-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
          `}</style>
          {/* sheet */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
            background: isPM ? '#1A1F2E' : bg, borderRadius: '24px 24px 0 0',
            padding: '14px 28px 40px',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.12)',
            animation: 'qv3-slide 320ms cubic-bezier(0.25, 1, 0.5, 1)',
            maxHeight: '78%', overflowY: 'auto',
          }}>
            {/* grab handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2, background: inkHair,
              margin: '0 auto 20px',
            }}/>

            {/* Header — numeral + nome + fechar */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{
                fontFamily: displayFont, fontSize: 18, fontWeight: 400,
                color: accent, fontStyle: 'italic', letterSpacing: '-0.01em',
              }}>
                {toRoman(openStep + 1)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 2.5,
                  color: accent, textTransform: 'uppercase',
                }}>
                  Passo {openStep + 1} · {currentStep.dur}
                </div>
                <div style={{
                  fontFamily: displayFont, fontSize: 28, fontWeight: 400,
                  color: ink, lineHeight: 1.1, letterSpacing: '-0.02em',
                  marginTop: 6,
                }}>
                  {currentStep.t}
                </div>
              </div>
              <div
                onClick={() => setOpenStep(null)}
                style={{
                  width: 30, height: 30, borderRadius: 15,
                  background: 'rgba(43,39,36,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}>
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 2L10 10M10 2L2 10" stroke={inkSoft} strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            {/* Quote — benefit em italic */}
            <div style={{
              marginTop: 24, padding: '16px 0',
              borderTop: `0.5px solid ${inkHair}`,
              borderBottom: `0.5px solid ${inkHair}`,
            }}>
              <div style={{
                fontFamily: displayFont, fontSize: 17, fontWeight: 400,
                color: ink, fontStyle: 'italic', lineHeight: 1.4,
                letterSpacing: '-0.01em',
              }}>
                {currentStep.benefit.charAt(0).toUpperCase() + currentStep.benefit.slice(1)}.
              </div>
            </div>

            {/* Como aplicar — passos numerados */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: 2.2,
                color: inkSoft, textTransform: 'uppercase',
              }}>
                Como aplicar
              </div>
              <div style={{
                fontSize: 14, color: ink, lineHeight: 1.55,
                marginTop: 8,
              }}>
                {currentStep.s}
              </div>
            </div>

            {/* Ativos */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: 2.2,
                color: inkSoft, textTransform: 'uppercase',
              }}>
                Ativos
              </div>
              <div style={{
                fontSize: 14, color: ink, lineHeight: 1.55,
                marginTop: 8,
              }}>
                {currentStep.ingredient}
              </div>
            </div>

            {/* Por que para você */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: 2.2,
                color: inkSoft, textTransform: 'uppercase',
              }}>
                Por que para você
              </div>
              <div style={{
                fontSize: 14, color: ink, lineHeight: 1.55,
                marginTop: 8,
              }}>
                Sua análise apontou score 72 — o {currentStep.note} é o ponto-chave deste passo na sua rotina atual.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { ProtocoloQuietudeV3Original });
