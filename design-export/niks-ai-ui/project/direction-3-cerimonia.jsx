// DIRECTION 3 — "CERIMÔNIA"
// Uma etapa por vez, full-screen. Orb respiratório.
// Evoluído: modo noite (céu estrelado + lua) e tipografia unificada com Quietude.
// Também agora interativa: prev/next entre passos.

// ─────────────────────────────────────────────────────────────────
// NightSky — céu noturno vivo: nebulosas respirando,
// 3 camadas de estrelas com parallax/twinkle/deriva, estrelas cadentes
// ─────────────────────────────────────────────────────────────────
function NightSky() {
  // 3 camadas com tamanhos/velocidades diferentes p/ sensação de profundidade
  const layers = React.useMemo(() => {
    const mk = (count, seed, sizeRange, opRange, twinkleRange, driftRange) =>
      Array.from({ length: count }).map((_, i) => {
        const s = seed + i;
        return {
          x: ((s * 137 + 13) % 1000) / 10,
          y: ((s * 89 + 7) % 1000) / 10,
          size: sizeRange[0] + ((s * 31) % 100) / 100 * (sizeRange[1] - sizeRange[0]),
          op: opRange[0] + ((s * 17) % 100) / 100 * (opRange[1] - opRange[0]),
          twinkleDur: twinkleRange[0] + ((s * 23) % 100) / 100 * (twinkleRange[1] - twinkleRange[0]),
          twinkleDelay: ((s * 19) % 100) / 100 * 6,
          driftDur: driftRange[0] + ((s * 41) % 100) / 100 * (driftRange[1] - driftRange[0]),
          driftDelay: ((s * 37) % 100) / 100 * 20,
          driftX: ((s * 13) % 100) / 100 > 0.5 ? 1 : -1,
        };
      });
    return {
      far: mk(70, 100, [0.6, 1.2], [0.15, 0.4], [3, 6], [60, 120]),
      mid: mk(35, 200, [1.0, 1.8], [0.35, 0.7], [2.5, 5], [40, 80]),
      near: mk(14, 300, [1.8, 2.8], [0.6, 1.0], [2, 4], [30, 60]),
    };
  }, []);

  // 3 estrelas cadentes em tempos e posições diferentes
  const shooters = [
    { top: '18%', left: '-5%', delay: '0s', duration: '12s', angle: 18 },
    { top: '52%', left: '-5%', delay: '6s', duration: '14s', angle: 12 },
    { top: '34%', left: '-5%', delay: '11s', duration: '18s', angle: 22 },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {/* Nebulosas respirando — camadas de cor bem sutis */}
      <div style={{
        position: 'absolute', top: '10%', left: '15%',
        width: '60%', height: '55%',
        background: 'radial-gradient(ellipse, rgba(140, 160, 220, 0.14) 0%, rgba(140, 160, 220, 0) 65%)',
        filter: 'blur(12px)',
        animation: 'nebula-breathe-a 22s ease-in-out infinite',
      }}/>
      <div style={{
        position: 'absolute', top: '35%', left: '45%',
        width: '55%', height: '50%',
        background: 'radial-gradient(ellipse, rgba(200, 150, 180, 0.12) 0%, rgba(200, 150, 180, 0) 65%)',
        filter: 'blur(14px)',
        animation: 'nebula-breathe-b 28s ease-in-out infinite',
      }}/>
      <div style={{
        position: 'absolute', top: '55%', left: '-5%',
        width: '50%', height: '45%',
        background: 'radial-gradient(ellipse, rgba(120, 180, 200, 0.1) 0%, rgba(120, 180, 200, 0) 65%)',
        filter: 'blur(16px)',
        animation: 'nebula-breathe-c 32s ease-in-out infinite',
      }}/>

      {/* FAR layer — estrelas pequenas, deriva lenta */}
      {layers.far.map((st, i) => (
        <div key={`f${i}`} style={{
          position: 'absolute', left: `${st.x}%`, top: `${st.y}%`,
          width: st.size, height: st.size, borderRadius: '50%',
          background: '#FFFFFF', opacity: 0,
          animation: `
            star-twinkle ${st.twinkleDur}s ease-in-out ${st.twinkleDelay}s infinite,
            star-drift-${st.driftX > 0 ? 'r' : 'l'} ${st.driftDur}s linear ${st.driftDelay}s infinite
          `,
          willChange: 'opacity, transform',
        }}/>
      ))}

      {/* MID layer */}
      {layers.mid.map((st, i) => (
        <div key={`m${i}`} style={{
          position: 'absolute', left: `${st.x}%`, top: `${st.y}%`,
          width: st.size, height: st.size, borderRadius: '50%',
          background: '#FFF8F0', opacity: 0,
          boxShadow: '0 0 3px rgba(255, 248, 240, 0.6)',
          animation: `
            star-twinkle-mid ${st.twinkleDur}s ease-in-out ${st.twinkleDelay}s infinite,
            star-drift-${st.driftX > 0 ? 'r' : 'l'} ${st.driftDur}s linear ${st.driftDelay}s infinite
          `,
          willChange: 'opacity, transform',
        }}/>
      ))}

      {/* NEAR layer — estrelas grandes com spike de luz */}
      {layers.near.map((st, i) => (
        <div key={`n${i}`} style={{
          position: 'absolute', left: `${st.x}%`, top: `${st.y}%`,
          width: st.size, height: st.size, borderRadius: '50%',
          background: '#FFF5E0', opacity: 0,
          boxShadow: `0 0 ${st.size * 3}px rgba(255, 245, 224, 0.9), 0 0 ${st.size * 6}px rgba(255, 245, 224, 0.4)`,
          animation: `
            star-twinkle-bright ${st.twinkleDur}s ease-in-out ${st.twinkleDelay}s infinite,
            star-drift-${st.driftX > 0 ? 'r' : 'l'} ${st.driftDur}s linear ${st.driftDelay}s infinite
          `,
          willChange: 'opacity, transform',
        }}/>
      ))}

      {/* Estrelas cadentes */}
      {shooters.map((sh, i) => (
        <div key={`sh${i}`} style={{
          position: 'absolute', top: sh.top, left: sh.left,
          width: 90, height: 1,
          transform: `rotate(${sh.angle}deg)`,
          transformOrigin: 'left center',
          background: 'linear-gradient(90deg, rgba(255,245,220,0) 0%, rgba(255,245,220,0.9) 85%, #FFFFFF 100%)',
          borderRadius: 1,
          opacity: 0,
          filter: 'drop-shadow(0 0 3px rgba(255,245,220,0.7))',
          animation: `shooting-star ${sh.duration} ease-out ${sh.delay} infinite`,
          willChange: 'transform, opacity',
        }}/>
      ))}

      <style>{`
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.5; }
        }
        @keyframes star-twinkle-mid {
          0%, 100% { opacity: 0.35; }
          45% { opacity: 0.85; }
          55% { opacity: 0.7; }
        }
        @keyframes star-twinkle-bright {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes star-drift-r {
          0% { transform: translate(0, 0); }
          100% { transform: translate(18px, -6px); }
        }
        @keyframes star-drift-l {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-18px, 5px); }
        }
        @keyframes nebula-breathe-a {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.9; }
          50% { transform: translate(12px, -8px) scale(1.08); opacity: 1; }
        }
        @keyframes nebula-breathe-b {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.8; }
          50% { transform: translate(-10px, 10px) scale(1.1); opacity: 1; }
        }
        @keyframes nebula-breathe-c {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.85; }
          50% { transform: translate(8px, -6px) scale(1.06); opacity: 1; }
        }
        @keyframes shooting-star {
          0% { transform: translate(-100px, 0) rotate(0deg); opacity: 0; }
          2% { opacity: 0; }
          4% { opacity: 1; }
          10% { opacity: 1; }
          16% { transform: translate(600px, 0) rotate(0deg); opacity: 0; }
          100% { transform: translate(600px, 0) rotate(0deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ProtocoloCerimonia({
  accent = PROTO.coral,
  displayFont: _displayFont = PROTO.serif, // ignored — Cerimônia tem tipografia própria
  mode = 'am',
  currentStep: initialStep = 0,
  onClose,
}) {
  // Cerimônia usa DM Serif Display em toda a tela
  const displayFont = "'DM Serif Display', 'Playfair Display', serif";

  const [currentStep, setCurrentStep] = React.useState(initialStep);
  const [celebrationOpen, setCelebrationOpen] = React.useState(false);
  const rawSteps = mode === 'am' ? IA_AM_STEPS : IA_PM_STEPS;
  // Map IA structure into Cerimônia's expected shape: { t, s, ingredient, dur }
  // `s` combines the IA `steps` array into flowing sentences + appends waitTime.
  const steps = rawSteps.map((it) => {
    const joined = (it.steps || []).join(' ');
    const waitClause = it.waitTime
      ? ` Aguardar ${it.waitTime} com o produto aplicado antes de passar para o próximo passo.`
      : '';
    return {
      t: it.name,
      s: joined + waitClause,
      ingredient: it.ingredient,
      // rough per-step duration label — scales with how many sub-steps
      dur: `${Math.max(1, Math.round((it.steps?.length || 2) * 0.5))} min`,
    };
  });
  const s = steps[currentStep];
  const total = steps.length;
  const isPM = mode === 'pm';

  // ─── Theme ────────────────────────────────────────────
  // Day: warm sunset gradients that shift by step
  // Night: deep starry sky (same as Quietude v3 noite)
  const dayGradients = [
    'radial-gradient(ellipse at 50% 30%, #FDE8E1 0%, #FBD5CA 35%, #F5B8A8 100%)',
    'radial-gradient(ellipse at 50% 30%, #FEF0E6 0%, #FADBC7 35%, #EBB497 100%)',
    'radial-gradient(ellipse at 50% 30%, #FCEAE5 0%, #F8C9B9 35%, #E89F8B 100%)',
    'radial-gradient(ellipse at 50% 30%, #FFEDE8 0%, #FFD4C5 35%, #FB9F89 100%)',
    'radial-gradient(ellipse at 50% 30%, #FFE5DD 0%, #FBBFAE 35%, #E88770 100%)',
  ];
  const nightBg = 'linear-gradient(180deg, #0F1420 0%, #1A1F2E 45%, #2A1F28 100%)';

  const bg = isPM ? nightBg : dayGradients[currentStep % dayGradients.length];
  const ink = isPM ? '#FFFFFF' : PROTO.ink;
  const inkSoft = isPM ? 'rgba(255,255,255,0.65)' : PROTO.inkSoft;
  const inkWhisper = isPM ? 'rgba(255,255,255,0.42)' : 'rgba(29,58,68,0.5)';
  const inkHair = isPM ? 'rgba(255,255,255,0.18)' : 'rgba(29,58,68,0.2)';
  const chipBg = isPM ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)';
  const chipBorder = isPM ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
  const ctaBg = isPM ? '#FFFFFF' : PROTO.ink;
  const ctaText = isPM ? PROTO.ink : '#FFFFFF';

  const goPrev = () => setCurrentStep(i => Math.max(0, i - 1));
  const goNext = () => setCurrentStep(i => Math.min(total - 1, i + 1));
  const isLast = currentStep === total - 1;

  return (
    <div style={{
      height: '100%', fontFamily: PROTO.sans,
      background: bg,
      position: 'relative', overflow: 'hidden',
      color: ink,
      transition: 'background 700ms ease',
    }}>
      {/* Starfield — only in PM */}
      {isPM && <NightSky/>}

      {/* Subtle vignette — only in day mode */}
      {!isPM && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 110%, rgba(255,255,255,0.5) 0%, transparent 60%)',
        }}/>
      )}

      {/* Header */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 5,
      }}>
        {/* Close */}
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18,
          background: chipBg,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `0.5px solid ${chipBorder}`,
          cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </div>

        {/* Mode indicator — serif italic in Quietude style */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 100,
          background: chipBg,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `0.5px solid ${chipBorder}`,
        }}>
          {isPM ? (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M11 8.5 A 5 5 0 1 1 5.5 3 A 4 4 0 0 0 11 8.5 Z" stroke={ink} strokeWidth="0.8" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2.4" stroke={ink} strokeWidth="0.8"/>
              <line x1="7" y1="1" x2="7" y2="2.8" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="7" y1="11.2" x2="7" y2="13" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="1" y1="7" x2="2.8" y2="7" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="11.2" y1="7" x2="13" y2="7" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="2.76" y1="2.76" x2="4.04" y2="4.04" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="9.96" y1="9.96" x2="11.24" y2="11.24" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="11.24" y1="2.76" x2="9.96" y2="4.04" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="4.04" y1="9.96" x2="2.76" y2="11.24" stroke={ink} strokeWidth="0.8" strokeLinecap="round"/>
            </svg>
          )}
          <div style={{
            fontFamily: displayFont, fontStyle: 'italic',
            fontSize: 13, fontWeight: 400, color: ink,
            letterSpacing: '-0.005em',
          }}>
            {isPM ? 'rotina da noite' : 'rotina da manhã'}
          </div>
        </div>

        {/* Sound */}
        <div style={{
          width: 36, height: 36, borderRadius: 18,
          background: chipBg,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `0.5px solid ${chipBorder}`,
        }}>
          {Icon.volume(ink, 14)}
        </div>
      </div>

      {/* Progress — hair-line dots */}
      <div style={{
        padding: '24px 48px 0',
        display: 'flex', justifyContent: 'center', gap: 10,
        position: 'relative', zIndex: 5,
      }}>
        {steps.map((_, i) => (
          <div key={i} onClick={() => setCurrentStep(i)} style={{
            flex: 1, height: 1.5, borderRadius: 1,
            background: i <= currentStep ? ink : inkHair,
            opacity: i === currentStep ? 1 : (i < currentStep ? 0.9 : 0.4),
            cursor: 'pointer',
          }}/>
        ))}
      </div>

      {/* Eyebrow — matches Quietude hair-divider style */}
      <div style={{
        padding: '40px 24px 0', textAlign: 'center',
        position: 'relative', zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 0.5, background: inkHair }}/>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: 2.5,
            color: inkSoft, textTransform: 'uppercase',
            fontVariantNumeric: 'tabular-nums',
          }}>
            Passo {currentStep + 1} · {total} &nbsp;·&nbsp; {s.dur}
          </div>
          <div style={{ width: 24, height: 0.5, background: inkHair }}/>
        </div>
      </div>

      {/* Breathing orb / moon — the "object" */}
      <div style={{
        padding: '28px 0 0', display: 'flex', justifyContent: 'center',
        position: 'relative', zIndex: 5,
      }}>
        <div style={{ width: 220, height: 220, position: 'relative' }}>
          {/* breathing rings */}
          <div style={{
            position: 'absolute', inset: -20, borderRadius: '50%',
            border: `0.5px solid ${isPM ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)'}`,
            animation: 'cerimonia-breathe 6s ease-in-out infinite',
          }}/>
          <div style={{
            position: 'absolute', inset: -40, borderRadius: '50%',
            border: `0.5px solid ${isPM ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.3)'}`,
            animation: 'cerimonia-breathe 6s ease-in-out infinite 0.3s',
          }}/>

          {/* center orb — day product / night moon */}
          <div style={{
            position: 'absolute', inset: 10, borderRadius: '50%',
            background: isPM
              ? 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #F4EEE4 30%, #D8CDB8 60%, #A89676 100%)'
              : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9) 0%, rgba(255,230,220,0.7) 40%, rgba(251,123,107,0.4) 100%)',
            boxShadow: isPM
              ? '0 0 80px rgba(255,248,220,0.4), inset -20px -30px 60px rgba(0,0,0,0.15)'
              : 'inset -20px -30px 60px rgba(251,123,107,0.3), 0 20px 60px rgba(251,123,107,0.3)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            transition: 'background 700ms ease',
          }}>
            {/* moon craters (PM only) */}
            {isPM && (
              <>
                <div style={{ position: 'absolute', top: 60, left: 130, width: 22, height: 22, borderRadius: 11,
                  background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 60%, transparent 100%)' }}/>
                <div style={{ position: 'absolute', top: 115, left: 60, width: 16, height: 16, borderRadius: 8,
                  background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.16) 60%, transparent 100%)' }}/>
                <div style={{ position: 'absolute', top: 90, left: 160, width: 11, height: 11, borderRadius: 6,
                  background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.14) 60%, transparent 100%)' }}/>
                <div style={{ position: 'absolute', top: 148, left: 115, width: 9, height: 9, borderRadius: 5,
                  background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 60%, transparent 100%)' }}/>
                <div style={{ position: 'absolute', top: 50, left: 85, width: 7, height: 7, borderRadius: 4,
                  background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }}/>
              </>
            )}

            {/* Numeral — italic, matching Quietude */}
            <div style={{
              fontFamily: displayFont, fontSize: 84, fontWeight: 400,
              color: isPM ? '#3D2F1F' : PROTO.ink, lineHeight: 1,
              letterSpacing: '-0.04em', fontStyle: 'italic',
              position: 'relative', zIndex: 2,
              textShadow: isPM ? '0 1px 0 rgba(255,255,255,0.4)' : 'none',
            }}>
              {String(currentStep + 1).padStart(2, '0')}
            </div>
          </div>
        </div>
      </div>

      {/* Title + body — Quietude-style serif italic mix */}
      <div style={{
        padding: '36px 32px 0', textAlign: 'center',
        position: 'relative', zIndex: 5,
      }}>
        <div style={{
          fontFamily: displayFont, fontSize: 38, fontWeight: 400,
          color: ink, lineHeight: 1.05, letterSpacing: '-0.025em',
        }}>
          <span style={{ fontStyle: 'italic' }}>{s.t.split(' ')[0]},</span>{' '}
          {s.t.split(' ').slice(1).join(' ')}
        </div>

        {/* divider matching Quietude */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 18 }}>
          <div style={{ width: 30, height: 0.5, background: inkHair }}/>
          <div style={{ width: 5, height: 5, borderRadius: 3, background: accent }}/>
          <div style={{ width: 30, height: 0.5, background: inkHair }}/>
        </div>

        <div style={{
          fontSize: 14, color: inkSoft, lineHeight: 1.55,
          marginTop: 16,
        }}>
          {s.s}
        </div>

        {/* Ingredient chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', marginTop: 18,
          background: chipBg, borderRadius: 100,
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          border: `0.5px solid ${chipBorder}`,
          fontSize: 11, fontWeight: 400, letterSpacing: 0.3,
          color: ink, fontFamily: displayFont, fontStyle: 'italic',
        }}>
          {Icon.droplet(ink, 11)} {s.ingredient}
        </div>
      </div>

      {/* Bottom: prev / CTA / next */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 50,
        padding: '0 24px', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* prev */}
          <div onClick={goPrev} style={{
            width: 54, height: 54, borderRadius: 27, flexShrink: 0,
            background: chipBg, border: `0.5px solid ${chipBorder}`,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', opacity: currentStep === 0 ? 0.35 : 1,
            transition: 'opacity 200ms ease',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* main CTA */}
          <div
            onClick={isLast ? () => setCelebrationOpen(true) : goNext}
            style={{
              flex: 1, background: ctaBg, borderRadius: 100,
              padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: isPM ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(29,58,68,0.25)',
              cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 14,
                background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {Icon.check('#fff', 14)}
              </div>
              <div style={{
                color: ctaText, fontSize: 14, fontWeight: 500,
                fontFamily: displayFont, fontStyle: 'italic',
                letterSpacing: '-0.005em',
              }}>
                {isLast ? 'Finalizar rotina' : 'Concluir este passo'}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3L11 8L6 13" stroke={ctaText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* celebration overlay */}
      {celebrationOpen && (
        <CerimoniaCelebration
          mode={mode}
          accent={accent}
          displayFont={displayFont}
          onClose={() => { setCelebrationOpen(false); onClose && onClose(); }}
        />
      )}

      {/* breathing keyframes */}
      <style>{`
        @keyframes cerimonia-breathe {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes cerimonia-celebration-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes cerimonia-celebration-orb-in {
          0% { opacity: 0; transform: scale(0.5); }
          60% { opacity: 1; transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes cerimonia-celebration-text-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cerimonia-celebration-glow {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.06); }
        }
        @keyframes cerimonia-celebration-twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tela de celebração — aparece ao concluir a rotina
// ─────────────────────────────────────────────────────────────────
function CerimoniaCelebration({ mode, accent, displayFont, onClose }) {
  const isPM = mode === 'pm';
  const bg = isPM
    ? 'radial-gradient(ellipse at 50% 30%, #1a2332 0%, #0a1420 60%, #050a12 100%)'
    : 'linear-gradient(180deg, #FFF8F3 0%, #FFEFE4 100%)';
  const textColor = isPM ? '#F5E6D3' : '#1D3A44';
  const subtleColor = isPM ? 'rgba(245,230,211,0.6)' : 'rgba(29,58,68,0.55)';
  const ruleColor = isPM ? 'rgba(245,230,211,0.25)' : 'rgba(29,58,68,0.2)';
  const ctaBg = isPM ? '#F5E6D3' : '#1D3A44';
  const ctaText = isPM ? '#0a1420' : '#FFF8F3';

  // hora do dia
  const now = new Date();
  const h = now.getHours();
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dayLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // estrelas para modo noite
  const stars = React.useMemo(() => {
    if (!isPM) return [];
    return Array.from({ length: 40 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 3,
    }));
  }, [isPM]);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: bg,
      display: 'flex', flexDirection: 'column',
      animation: 'cerimonia-celebration-in 600ms cubic-bezier(0.22, 1, 0.36, 1)',
      overflow: 'hidden',
    }}>
      {/* starfield vivo (PM only) */}
      {isPM && <NightSky/>}

      {/* masthead */}
      <div style={{
        padding: '60px 28px 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{
          fontFamily: displayFont, fontStyle: 'italic',
          fontSize: 12, letterSpacing: '0.02em',
          color: subtleColor,
        }}>
          niks · {isPM ? 'noite' : 'manhã'}
        </div>
        <div style={{
          fontFamily: displayFont,
          fontSize: 12, letterSpacing: '0.12em',
          color: subtleColor, textTransform: 'uppercase',
        }}>
          {timeLabel}
        </div>
      </div>

      {/* centro: orb + título */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 36px',
        position: 'relative', zIndex: 2,
      }}>
        {/* orb / lua */}
        <div style={{
          position: 'relative',
          width: 220, height: 220,
          marginBottom: 48,
          animation: 'cerimonia-celebration-orb-in 900ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}>
          {/* glow */}
          <div style={{
            position: 'absolute', inset: -40,
            borderRadius: '50%',
            background: isPM
              ? 'radial-gradient(circle, rgba(245,230,211,0.25) 0%, transparent 65%)'
              : `radial-gradient(circle, ${accent}55 0%, transparent 65%)`,
            animation: 'cerimonia-celebration-glow 4s ease-in-out infinite',
          }}/>
          {/* outer ring */}
          <div style={{
            position: 'absolute', inset: -16,
            borderRadius: '50%',
            border: `1px solid ${isPM ? 'rgba(245,230,211,0.18)' : 'rgba(251,123,107,0.25)'}`,
          }}/>
          {/* orb body */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: isPM
              ? 'radial-gradient(circle at 35% 35%, #FAF3E3 0%, #E8D9B8 45%, #B8A685 100%)'
              : `radial-gradient(circle at 35% 30%, #FFD4B8 0%, ${accent} 55%, #E85D4E 100%)`,
            boxShadow: isPM
              ? 'inset -10px -10px 30px rgba(0,0,0,0.15), 0 0 60px rgba(245,230,211,0.3)'
              : `0 20px 60px ${accent}40, inset -10px -10px 30px rgba(232,93,78,0.2)`,
          }}>
            {/* crateras da lua */}
            {isPM && (
              <>
                <div style={{ position: 'absolute', top: '28%', left: '38%', width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.08)' }}/>
                <div style={{ position: 'absolute', top: '52%', left: '62%', width: 10, height: 10, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }}/>
                <div style={{ position: 'absolute', top: '68%', left: '30%', width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.05)' }}/>
                <div style={{ position: 'absolute', top: '42%', left: '25%', width: 6, height: 6, borderRadius: '50%', background: 'rgba(0,0,0,0.04)' }}/>
              </>
            )}
          </div>
          {/* checkmark no centro */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
              style={{ filter: isPM ? 'none' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))' }}>
              <path d="M14 24.5L21 31.5L34 17"
                stroke={isPM ? '#1D3A44' : '#FFF8F3'}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* eyebrow */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 20,
          animation: 'cerimonia-celebration-text-in 700ms 400ms cubic-bezier(0.22, 1, 0.36, 1) both',
        }}>
          <div style={{ width: 28, height: 1, background: ruleColor }}/>
          <div style={{
            fontFamily: displayFont, fontStyle: 'italic',
            fontSize: 13, letterSpacing: '0.08em',
            color: subtleColor, textTransform: 'lowercase',
          }}>
            rotina concluída
          </div>
          <div style={{ width: 28, height: 1, background: ruleColor }}/>
        </div>

        {/* título */}
        <div style={{
          fontFamily: displayFont,
          fontSize: 44,
          lineHeight: 1.05,
          color: textColor,
          textAlign: 'center',
          letterSpacing: '-0.02em',
          marginBottom: 20,
          animation: 'cerimonia-celebration-text-in 700ms 550ms cubic-bezier(0.22, 1, 0.36, 1) both',
        }}>
          <span style={{ fontStyle: 'italic' }}>{isPM ? 'Boa' : 'Bem'}</span>
          {isPM ? ' noite,' : ' feita,'}
          <br/>
          <span>{isPM ? 'sua pele descansa.' : 'sua pele agradece.'}</span>
        </div>

        {/* subtexto */}
        <div style={{
          fontFamily: displayFont,
          fontSize: 15, lineHeight: 1.55,
          color: subtleColor, textAlign: 'center',
          maxWidth: 280,
          animation: 'cerimonia-celebration-text-in 700ms 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
        }}>
          {isPM
            ? 'Quatro gestos para selar o dia. Agora é a noite que cuida — descanse.'
            : 'Quatro gestos simples, feitos com intenção. Leve essa calma pro resto do dia.'}
        </div>
      </div>

      {/* rodapé: data + CTA */}
      <div style={{
        padding: '0 28px 40px',
        position: 'relative', zIndex: 2,
        animation: 'cerimonia-celebration-text-in 700ms 850ms cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>
        {/* data */}
        <div style={{
          fontFamily: displayFont, fontStyle: 'italic',
          fontSize: 13, letterSpacing: '0.01em',
          color: subtleColor, textAlign: 'center',
          marginBottom: 20, textTransform: 'lowercase',
        }}>
          {dayLabel}
        </div>

        {/* CTA */}
        <div
          onClick={onClose}
          style={{
            background: ctaBg,
            borderRadius: 100,
            padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10,
            boxShadow: isPM
              ? '0 12px 40px rgba(0,0,0,0.4)'
              : '0 12px 40px rgba(29,58,68,0.22)',
            cursor: 'pointer',
          }}>
          <div style={{
            color: ctaText,
            fontSize: 15, fontWeight: 500,
            fontFamily: displayFont, fontStyle: 'italic',
            letterSpacing: '-0.005em',
          }}>
            voltar ao protocolo
          </div>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke={ctaText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ProtocoloCerimonia });
