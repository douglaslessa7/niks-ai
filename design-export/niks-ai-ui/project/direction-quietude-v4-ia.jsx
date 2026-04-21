// DIRECTION — "QUIETUDE v4 IA"
// Baseada na v3 original, mas consome os dados reais do output da IA
// (IA_AM_STEPS / IA_PM_STEPS / IA_DICAS / IA_CRONOGRAMA).
// Mudanças visuais mínimas: mantém a mesma linguagem editorial da v3.

function ProtocoloQuietudeV4IA({ accent = PROTO.coral, displayFont = PROTO.serif, mode: initialMode = 'am' }) {
  const [mode, setMode] = React.useState(initialMode);
  const [openStep, setOpenStep] = React.useState(null);
  const [ritualOpen, setRitualOpen] = React.useState(false);
  const [dicasOpen, setDicasOpen] = React.useState(false);
  const [cronoOpen, setCronoOpen] = React.useState(false);

  React.useEffect(() => { setMode(initialMode); }, [initialMode]);

  const steps = mode === 'am' ? IA_AM_STEPS : IA_PM_STEPS;
  const doneCount = mode === 'am' ? 1 : 0;
  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);

  const isPM = mode === 'pm';
  const bg = isPM
    ? 'linear-gradient(180deg, #0F1420 0%, #1A1F2E 45%, #2A1F28 100%)'
    : '#FFFFFF';
  const ink = isPM ? '#FFFFFF' : '#2B2724';
  const inkSoft = isPM ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.55)';
  const inkHair = isPM ? 'rgba(255,255,255,0.14)' : 'rgba(43,39,36,0.10)';
  const inkWhisper = isPM ? 'rgba(255,255,255,0.42)' : 'rgba(43,39,36,0.35)';
  const surfaceSoft = isPM ? 'rgba(255,255,255,0.035)' : 'rgba(43,39,36,0.025)';

  const orb = isPM
    ? 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #F4EEE4 30%, #D8CDB8 60%, #A89676 100%)'
    : 'radial-gradient(circle at 35% 30%, #FFE8DF 0%, #F9C9B6 35%, #E89178 75%, #C86651 100%)';
  const orbShadow = isPM
    ? '0 0 60px rgba(255,248,220,0.35), 0 18px 44px rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.6)'
    : '0 18px 44px rgba(232,145,120,0.28), inset 0 2px 0 rgba(255,255,255,0.5)';

  const currentStep = openStep != null ? steps[openStep] : null;

  return (
    <div style={{
      background: bg, height: '100%', fontFamily: PROTO.sans,
      position: 'relative', color: ink, overflow: 'hidden',
      transition: 'background 700ms ease',
    }}>
      {isPM && <NightSky/>}

      <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 180, position: 'relative', zIndex: 1 }}>

      {/* Masthead */}
      <div style={{
        paddingTop: 62, paddingLeft: 28, paddingRight: 28,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.8, color: inkSoft, textTransform: 'uppercase' }}>NIKS</div>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.5, color: inkSoft, fontVariantNumeric: 'tabular-nums' }}>14 nov · qui</div>
      </div>

      {/* Orb */}
      <div style={{ padding: '56px 28px 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: orb, boxShadow: orbShadow,
          position: 'relative', transition: 'background 700ms ease, box-shadow 700ms ease',
        }}>
          <div style={{
            position: 'absolute', top: 14, left: 26, width: 42, height: 26,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%)',
            filter: 'blur(4px)',
          }}/>
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
            </>
          )}
        </div>
      </div>

      {/* AM/PM switch */}
      <div style={{ padding: '26px 28px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        <div onClick={() => setMode('am')} style={{
          fontFamily: displayFont, fontSize: 15, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.005em',
          color: mode === 'am' ? accent : inkWhisper, cursor: 'pointer', transition: 'color 300ms ease',
          paddingBottom: 3, borderBottom: mode === 'am' ? `0.5px solid ${accent}` : '0.5px solid transparent',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
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
        <div onClick={() => setMode('pm')} style={{
          fontFamily: displayFont, fontSize: 15, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.005em',
          color: mode === 'pm' ? accent : inkWhisper, cursor: 'pointer', transition: 'color 300ms ease',
          paddingBottom: 3, borderBottom: mode === 'pm' ? `0.5px solid ${accent}` : '0.5px solid transparent',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          noite
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M11 8.5 A 5 5 0 1 1 5.5 3 A 4 4 0 0 0 11 8.5 Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Title */}
      <div style={{ padding: '26px 28px 0', textAlign: 'center' }}>
        <div style={{
          fontFamily: displayFont, fontSize: 38, fontWeight: 400,
          color: ink, lineHeight: 1.05, letterSpacing: '-0.025em',
        }}>
          <span style={{ fontStyle: 'italic' }}>{mode === 'am' ? 'Manhã,' : 'Noite,'}</span> {['um','dois','três','quatro','cinco','seis'][steps.length - 1]} passos.
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
          {steps.length} etapas &nbsp;·&nbsp; score 72
        </div>
      </div>

      {/* Steps — cards editoriais ricos (expõem nome + ingredient + schedule) */}
      <div style={{ padding: '32px 28px 0' }}>
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

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: displayFont, fontSize: 20, fontWeight: 400,
                  color: ink, lineHeight: 1.2, letterSpacing: '-0.015em',
                  textDecoration: done ? 'line-through' : 'none',
                  textDecorationColor: inkWhisper,
                  textDecorationThickness: '0.5px',
                }}>{s.name}</div>

                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
                  color: inkSoft, marginTop: 6, lineHeight: 1.45,
                }}>{s.ingredient}</div>

                {/* Dias da semana — badge editorial */}
                {s.schedule && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    marginTop: 10,
                    padding: '4px 10px 4px 8px',
                    border: `0.5px solid ${accent}`,
                    borderRadius: 100,
                    background: isPM ? 'rgba(251,123,107,0.06)' : 'rgba(251,123,107,0.04)',
                  }}>
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <circle cx="4" cy="4" r="1.5" fill={accent}/>
                    </svg>
                    <span style={{
                      fontFamily: displayFont, fontStyle: 'italic', fontSize: 12,
                      color: accent, letterSpacing: '-0.005em',
                    }}>{s.schedule.label}</span>
                  </div>
                )}
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
                ) : (s.waitTime && <span>{s.waitTime}</span>)}
                <svg width="7" height="12" viewBox="0 0 7 12" style={{ opacity: 0.9 }}>
                  <path d="M1 1L6 6L1 11" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ DICAS (colapsáveis, mesma linguagem) ═══ */}
      <div style={{ padding: '48px 28px 0' }}>
        {/* Header seção */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 2.8,
            color: accent, textTransform: 'uppercase',
          }}>Recomendações</div>
          <div style={{
            fontFamily: displayFont, fontSize: 22, fontWeight: 400,
            color: ink, fontStyle: 'italic', letterSpacing: '-0.015em',
            marginTop: 6,
          }}>O que esperar do seu protocolo</div>
        </div>

        {/* Marcos temporais + alerta (um abaixo do outro, minimal) */}
        <div
          onClick={() => setDicasOpen(!dicasOpen)}
          style={{
            borderTop: `0.5px solid ${inkHair}`,
            borderBottom: `0.5px solid ${inkHair}`,
            padding: '18px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
          }}>
          <div>
            <div style={{
              fontFamily: displayFont, fontSize: 17, fontWeight: 400,
              color: ink, letterSpacing: '-0.01em',
            }}>
              <span style={{ fontStyle: 'italic', color: accent }}>Prognóstico</span> &nbsp;·&nbsp; {IA_DICAS.length} notas
            </div>
            <div style={{ fontSize: 11, color: inkSoft, marginTop: 4 }}>
              Marcos de evolução e um aviso importante.
            </div>
          </div>
          <svg width="12" height="7" viewBox="0 0 12 7" style={{
            transition: 'transform 300ms ease',
            transform: dicasOpen ? 'rotate(180deg)' : 'rotate(0)',
            flexShrink: 0, marginLeft: 12,
          }}>
            <path d="M1 1L6 6L11 1" stroke={inkSoft} strokeWidth="1" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        {dicasOpen && (
          <div style={{
            padding: '4px 0',
            animation: 'qv4-fadein 320ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            <style>{`@keyframes qv4-fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            {IA_DICAS.map((d, i) => {
              const isAlert = d.kind === 'alerta';
              return (
                <div key={i} style={{
                  padding: '20px 0',
                  borderBottom: i < IA_DICAS.length - 1 ? `0.5px solid ${inkHair}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    {isAlert ? (
                      <div style={{
                        width: 14, height: 14, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M5.5 1L10 9.5H1L5.5 1Z" stroke={accent} strokeWidth="0.8" strokeLinejoin="round"/>
                          <line x1="5.5" y1="4.5" x2="5.5" y2="6.5" stroke={accent} strokeWidth="0.8" strokeLinecap="round"/>
                          <circle cx="5.5" cy="7.8" r="0.5" fill={accent}/>
                        </svg>
                      </div>
                    ) : (
                      <div style={{
                        fontFamily: displayFont, fontSize: 13, fontWeight: 400,
                        color: accent, fontStyle: 'italic',
                        width: 14, flexShrink: 0, letterSpacing: '-0.005em',
                      }}>
                        {toRoman(i)}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: displayFont, fontSize: 18, fontWeight: 400,
                        color: ink, lineHeight: 1.2, letterSpacing: '-0.015em',
                      }}>
                        {isAlert ? (
                          <span style={{ fontStyle: 'italic' }}>{d.title}</span>
                        ) : d.title}
                      </div>
                      <div style={{
                        fontSize: 13, color: inkSoft, lineHeight: 1.6,
                        marginTop: 8,
                      }}>{d.body}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cronograma — separado */}
        <div
          onClick={() => setCronoOpen(!cronoOpen)}
          style={{
            borderBottom: `0.5px solid ${inkHair}`,
            padding: '18px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
          }}>
          <div>
            <div style={{
              fontFamily: displayFont, fontSize: 17, fontWeight: 400,
              color: ink, letterSpacing: '-0.01em',
            }}>
              <span style={{ fontStyle: 'italic', color: accent }}>Introdução gradual</span> &nbsp;·&nbsp; {IA_CRONOGRAMA.length} semanas
            </div>
            <div style={{ fontSize: 11, color: inkSoft, marginTop: 4 }}>
              Como introduzir os ácidos sem agredir a pele.
            </div>
          </div>
          <svg width="12" height="7" viewBox="0 0 12 7" style={{
            transition: 'transform 300ms ease',
            transform: cronoOpen ? 'rotate(180deg)' : 'rotate(0)',
            flexShrink: 0, marginLeft: 12,
          }}>
            <path d="M1 1L6 6L11 1" stroke={inkSoft} strokeWidth="1" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        {cronoOpen && (
          <div style={{
            padding: '4px 0',
            animation: 'qv4-fadein 320ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            {/* Timeline horizontal */}
            <div style={{ padding: '26px 10px 10px', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 10, right: 10, top: 32,
                height: 0.5, background: inkHair,
              }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                {IA_CRONOGRAMA.map((c, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: accent,
                      boxShadow: `0 0 0 3px ${isPM ? 'rgba(255,255,255,0.04)' : 'rgba(251,123,107,0.08)'}`,
                    }}/>
                    <div style={{
                      fontFamily: displayFont, fontSize: 12, fontWeight: 400,
                      fontStyle: 'italic', color: accent, letterSpacing: '-0.005em',
                    }}>{c.week}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista */}
            <div>
              {IA_CRONOGRAMA.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 16, padding: '18px 0',
                  borderBottom: i < IA_CRONOGRAMA.length - 1 ? `0.5px solid ${inkHair}` : 'none',
                }}>
                  <div style={{
                    fontFamily: displayFont, fontSize: 15, fontWeight: 400,
                    color: accent, fontStyle: 'italic',
                    width: 72, flexShrink: 0, letterSpacing: '-0.005em',
                  }}>{c.week}</div>
                  <div style={{
                    fontSize: 13, color: ink, lineHeight: 1.6, flex: 1,
                  }}>{c.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      </div>
      {/* ----- end scroll ----- */}

      {/* CTA flutuante */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 112,
        padding: '0 24px', zIndex: 25, pointerEvents: 'none',
      }}>
        <div onClick={() => setRitualOpen(true)} style={{
          background: accent, borderRadius: 100, padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: `0 14px 32px ${accent}38`,
          pointerEvents: 'auto', cursor: 'pointer',
        }}>
          <div style={{
            color: '#fff', fontSize: 14, fontWeight: 500,
            fontFamily: displayFont, fontStyle: 'italic', letterSpacing: '-0.005em',
          }}>Começar minha rotina</div>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8m0 0L7.5 3.5M11 7L7.5 10.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme={isPM ? 'dark' : 'light'}/>

      {ritualOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          animation: 'qv4-cerim-in 420ms cubic-bezier(0.25, 1, 0.5, 1)',
        }}>
          <style>{`@keyframes qv4-cerim-in { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: scale(1); } }`}</style>
          <ProtocoloCerimonia
            accent={accent} displayFont={displayFont} mode={mode}
            currentStep={0} onClose={() => setRitualOpen(false)}
          />
        </div>
      )}

      {/* BOTTOM SHEET — todos os campos da IA */}
      {currentStep && (
        <>
          <div onClick={() => setOpenStep(null)} style={{
            position: 'absolute', inset: 0, zIndex: 40,
            background: isPM ? 'rgba(0,0,0,0.5)' : 'rgba(43,39,36,0.3)', backdropFilter: 'blur(2px)',
            animation: 'qv4-fade 250ms ease',
          }}/>
          <style>{`
            @keyframes qv4-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes qv4-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
          `}</style>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
            background: isPM ? '#1A1F2E' : bg, borderRadius: '24px 24px 0 0',
            padding: '14px 28px 40px',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.12)',
            animation: 'qv4-slide 320ms cubic-bezier(0.25, 1, 0.5, 1)',
            maxHeight: '88%', overflowY: 'auto',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: inkHair, margin: '0 auto 20px' }}/>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{
                fontFamily: displayFont, fontSize: 18, fontWeight: 400,
                color: accent, fontStyle: 'italic', letterSpacing: '-0.01em',
              }}>{toRoman(openStep + 1)}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 2.5,
                  color: accent, textTransform: 'uppercase',
                }}>
                  Passo {openStep + 1}{currentStep.waitTime ? ` · aguardar ${currentStep.waitTime}` : ''}
                </div>
                {/* 1. Nome do produto */}
                <div style={{
                  fontFamily: displayFont, fontSize: 28, fontWeight: 400,
                  color: ink, lineHeight: 1.1, letterSpacing: '-0.02em',
                  marginTop: 6,
                }}>{currentStep.name}</div>
                {/* 2. Especificação (ingredient) */}
                <div style={{
                  fontSize: 12, fontWeight: 500, letterSpacing: 0.3,
                  color: inkSoft, marginTop: 8, lineHeight: 1.5,
                }}>{currentStep.ingredient}</div>
                {/* Dias (se houver) */}
                {currentStep.schedule && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    marginTop: 10,
                    padding: '4px 10px 4px 8px',
                    border: `0.5px solid ${accent}`,
                    borderRadius: 100,
                    background: isPM ? 'rgba(251,123,107,0.06)' : 'rgba(251,123,107,0.04)',
                  }}>
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <circle cx="4" cy="4" r="1.5" fill={accent}/>
                    </svg>
                    <span style={{
                      fontFamily: displayFont, fontStyle: 'italic', fontSize: 12,
                      color: accent, letterSpacing: '-0.005em',
                    }}>{currentStep.schedule.label}</span>
                  </div>
                )}
              </div>
              <div onClick={() => setOpenStep(null)} style={{
                width: 30, height: 30, borderRadius: 15,
                background: isPM ? 'rgba(255,255,255,0.08)' : 'rgba(43,39,36,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 2L10 10M10 2L2 10" stroke={inkSoft} strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            {/* 3. Instrução (parágrafo editorial em italic serif) */}
            <div style={{
              marginTop: 24, padding: '18px 0',
              borderTop: `0.5px solid ${inkHair}`,
              borderBottom: `0.5px solid ${inkHair}`,
            }}>
              <div style={{
                fontFamily: displayFont,
                fontSize: 15, fontWeight: 400,
                color: ink, lineHeight: 1.65,
                letterSpacing: '-0.003em',
              }}>
                {currentStep.instruction}
                {currentStep.waitTime && (
                  <span style={{ color: accent }}>
                    {' '}Aguardar {currentStep.waitTime} com o produto aplicado antes de passar para o próximo produto.
                  </span>
                )}
              </div>
            </div>

            {/* 4. Como aplicar — passos numerados */}
            <div style={{ marginTop: 24 }}>
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: 2.2,
                color: inkSoft, textTransform: 'uppercase',
              }}>Como aplicar</div>
              <div style={{ marginTop: 12 }}>
                {currentStep.steps.map((instruction, idx) => (
                  <div key={idx} style={{
                    display: 'flex', gap: 4, padding: '12px 0',
                    alignItems: 'center',
                    borderBottom: idx < currentStep.steps.length - 1 ? `0.5px solid ${inkHair}` : 'none',
                  }}>
                    <div style={{
                      fontFamily: displayFont, fontSize: 54, fontWeight: 400,
                      color: accent, fontStyle: 'italic',
                      width: 56, flexShrink: 0, letterSpacing: '-0.03em',
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1,
                    }}>{idx + 1}</div>
                    <div style={{
                      fontSize: 14, color: ink, lineHeight: 1.45, flex: 1,
                    }}>{instruction}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Sugestões de produto */}
            {currentStep.product_suggestions && currentStep.product_suggestions.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 2.2,
                  color: inkSoft, textTransform: 'uppercase',
                }}>Sugestões de produto</div>
                <div style={{ marginTop: 12 }}>
                  {currentStep.product_suggestions.map((prod, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px',
                      marginTop: idx === 0 ? 0 : 8,
                      background: surfaceSoft,
                      border: `0.5px solid ${inkHair}`,
                      borderRadius: 10,
                    }}>
                      {/* mini "frasco" placeholder */}
                      <div style={{
                        width: 32, height: 40, borderRadius: 4,
                        background: `linear-gradient(180deg, ${accent}28 0%, ${accent}14 100%)`,
                        border: `0.5px solid ${accent}40`,
                        position: 'relative', flexShrink: 0,
                      }}>
                        <div style={{
                          position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
                          width: 14, height: 5, borderRadius: 1,
                          background: accent, opacity: 0.6,
                        }}/>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500, color: ink,
                          lineHeight: 1.35, letterSpacing: '-0.005em',
                        }}>{prod}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { ProtocoloQuietudeV4IA });
