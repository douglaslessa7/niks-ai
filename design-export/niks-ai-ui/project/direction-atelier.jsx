// DIRECTION 3 v2 — "ATELIER" (evoluído)
// A antessala da Cerimônia. Hero cinemático + timeline de frascos como objetos preciosos.
// A usuária deve olhar esta tela e QUERER entrar na rotina.

function ProtocoloAtelier({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const doneCount = mode === 'am' ? 0 : 0; // fresh start — "Começar minha rotina"
  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);

  const totalMin = steps.reduce((a, x) => a + parseInt(x.dur), 0);

  // Gradient bottle tints per step — shifts warmly across the ritual
  // These match the Cerimônia (direction 4) palette so the transition feels coherent
  const stepTints = [
    { light: '#FDEEE9', deep: '#F5B8A8', accent: '#E85D4D', label: 'Alvorada' },
    { light: '#FEF0E6', deep: '#EBB497', accent: '#D68C5E', label: 'Âmbar' },
    { light: '#FCEAE5', deep: '#E89F8B', accent: '#D16F58', label: 'Coral' },
    { light: '#FFEDE8', deep: '#FB9F89', accent: '#FB7B6B', label: 'Rubi' },
    { light: '#FFE5DD', deep: '#E88770', accent: '#C85A45', label: 'Terracota' },
  ];

  // Hero gradient — sunrise vs dusk
  const heroGradient = mode === 'am'
    ? 'linear-gradient(160deg, #FEF0E6 0%, #FBD5CA 35%, #F5A388 75%, #EB8060 100%)'
    : 'linear-gradient(160deg, #3A2B3F 0%, #6A4050 35%, #B06B5C 75%, #E89875 100%)';

  const heroTextColor = mode === 'am' ? PROTO.ink : '#FFF';
  const heroTextSoft = mode === 'am' ? 'rgba(29,58,68,0.65)' : 'rgba(255,255,255,0.75)';

  return (
    <div style={{
      background: PROTO.pearl, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 130, position: 'relative',
    }}>
      {/* ══════ MASTHEAD ══════ */}
      <div style={{
        paddingTop: 62, paddingLeft: 24, paddingRight: 24, paddingBottom: 14,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 10,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
          color: PROTO.ink, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 9, background: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 800,
            fontFamily: displayFont, fontStyle: 'italic',
          }}>N</div>
          NIKS · ATELIER
        </div>

        {/* AM/PM mini-toggle */}
        <div style={{
          padding: 3, borderRadius: 100, background: PROTO.white,
          border: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', gap: 2,
        }}>
          {['am', 'pm'].map(m => {
            const a = m === mode;
            return (
              <div key={m} style={{
                padding: '5px 9px', borderRadius: 100,
                background: a ? PROTO.ink : 'transparent',
                color: a ? '#fff' : PROTO.gray6,
                fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {m === 'am' ? Icon.sun(a ? '#fff' : PROTO.gray6, 11) : Icon.moon(a ? '#fff' : PROTO.gray6, 11)}
                {m.toUpperCase()}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════ HERO — cinematográfico, poster do ritual ══════ */}
      <div style={{ padding: '0 18px' }}>
        <div style={{
          position: 'relative', borderRadius: 28, overflow: 'hidden',
          background: heroGradient, padding: '28px 24px 24px',
          minHeight: 260,
          boxShadow: '0 12px 32px rgba(203,108,84,0.18)',
        }}>
          {/* Decorative numeral — massive in background */}
          <div style={{
            position: 'absolute', right: -30, top: -20,
            fontFamily: displayFont, fontSize: 280, fontWeight: 400,
            color: mode === 'am' ? 'rgba(29,58,68,0.07)' : 'rgba(255,255,255,0.1)',
            lineHeight: 1, fontStyle: 'italic', pointerEvents: 'none',
            letterSpacing: '-0.05em',
          }}>
            {toRoman(steps.length)}
          </div>

          {/* Sparkle motif top-left */}
          <div style={{
            position: 'absolute', top: 20, left: 24,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={mode === 'am' ? PROTO.ink : '#fff'} opacity="0.35">
              <path d="M12 2 l2 7 L21 11 l-7 2 L12 22 l-2-9 L3 11 l7-2 z"/>
            </svg>
          </div>

          {/* Top eyebrow */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            color: heroTextColor, textTransform: 'uppercase', opacity: 0.7,
            position: 'relative', zIndex: 2,
          }}>
            {mode === 'am' ? 'Rito da Manhã' : 'Rito da Noite'} · Quinta
          </div>

          {/* Headline — script-like italic */}
          <div style={{
            fontFamily: displayFont, fontSize: 44, fontWeight: 400,
            color: heroTextColor, lineHeight: 0.98,
            letterSpacing: '-0.025em', marginTop: 14,
            position: 'relative', zIndex: 2,
          }}>
            <span style={{ fontStyle: 'italic' }}>Seu ritual</span><br/>
            de hoje.
          </div>

          {/* Underline rule + meta */}
          <div style={{
            marginTop: 22, display: 'flex', alignItems: 'center',
            gap: 12, position: 'relative', zIndex: 2,
          }}>
            <div style={{
              flex: 1, height: 0.5,
              background: mode === 'am' ? 'rgba(29,58,68,0.3)' : 'rgba(255,255,255,0.4)',
            }}/>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 1.5,
              color: heroTextSoft, textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>{steps.length} gestos</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{totalMin} min</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>score 72</span>
            </div>
          </div>

          {/* Body narrative */}
          <div style={{
            fontSize: 12, color: heroTextColor, opacity: 0.85,
            lineHeight: 1.6, marginTop: 12,
            maxWidth: 300, fontStyle: 'italic', fontFamily: displayFont,
            fontWeight: 400, position: 'relative', zIndex: 2,
          }}>
            "Cuidar da pele é uma forma de<br/>
            conversar com o tempo."
          </div>
        </div>
      </div>

      {/* ══════ INGREDIENT LIBRARY — chips preciosos ══════ */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 10,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: PROTO.gray6, textTransform: 'uppercase',
          }}>
            Fórmula de hoje
          </div>
          <div style={{
            fontSize: 10, fontWeight: 500, color: accent,
            fontFamily: PROTO.mono, letterSpacing: 0.5,
          }}>
            Ver todos ›
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Ác. salicílico', 'Niacinamida 10%', 'Hialurônico', 'Ceramidas', 'FPS 50'].map((ing, i) => (
            <div key={i} style={{
              padding: '7px 12px', borderRadius: 100,
              background: PROTO.white, border: '0.5px solid rgba(0,0,0,0.08)',
              fontSize: 11, fontWeight: 500, color: PROTO.ink,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, background: stepTints[i % stepTints.length].accent }}/>
              {ing}
            </div>
          ))}
        </div>
      </div>

      {/* ══════ TIMELINE — os "frascos" em sequência vertical ══════ */}
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2,
          color: PROTO.gray6, textTransform: 'uppercase',
          marginBottom: 14,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>A sequência</span>
          <span style={{ fontFamily: displayFont, fontStyle: 'italic', fontSize: 13, textTransform: 'none', letterSpacing: 0, color: PROTO.inkSoft }}>
            toque para abrir
          </span>
        </div>

        {/* Vertical rail with bottles */}
        <div style={{ position: 'relative' }}>
          {/* Connecting line */}
          <div style={{
            position: 'absolute', left: 42, top: 10, bottom: 10,
            width: 0.5, background: 'rgba(0,0,0,0.12)',
          }}/>

          {steps.map((s, i) => {
            const tint = stepTints[i % stepTints.length];
            return (
              <div key={i} style={{
                display: 'flex', gap: 16, alignItems: 'stretch',
                marginBottom: 10, position: 'relative',
              }}>
                {/* Left: bottle object */}
                <div style={{ flexShrink: 0, width: 70, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 68, height: 92, borderRadius: 12,
                    background: `linear-gradient(180deg, ${tint.light} 0%, ${tint.deep} 100%)`,
                    border: '0.5px solid rgba(0,0,0,0.08)',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
                  }}>
                    {/* bottle illustration */}
                    <svg width="68" height="92" viewBox="0 0 68 92" style={{ position: 'absolute', inset: 0 }}>
                      {/* cap */}
                      <rect x="24" y="8" width="20" height="12" rx="1.5" fill={tint.accent} opacity="0.95"/>
                      <rect x="27" y="19" width="14" height="5" fill={tint.accent} opacity="0.6"/>
                      {/* neck */}
                      <rect x="26" y="23" width="16" height="6" fill="rgba(255,255,255,0.6)"/>
                      {/* body */}
                      <path d="M20 30 Q14 34 14 42 L14 80 Q14 88 22 88 L46 88 Q54 88 54 80 L54 42 Q54 34 48 30 Z"
                        fill="rgba(255,255,255,0.75)" stroke={tint.accent} strokeWidth="0.4" strokeOpacity="0.4"/>
                      {/* liquid */}
                      <path d="M20 62 Q14 62 14 66 L14 80 Q14 88 22 88 L46 88 Q54 88 54 80 L54 66 Q54 62 48 62 Z"
                        fill={tint.accent} opacity="0.4"/>
                      {/* label */}
                      <rect x="20" y="48" width="28" height="18" fill="rgba(255,255,255,0.9)" stroke={tint.accent} strokeWidth="0.2" strokeOpacity="0.5"/>
                      <text x="34" y="56" textAnchor="middle" fontFamily="serif" fontSize="5.5" fontStyle="italic" fill={tint.accent}>N°{i+1}</text>
                      <line x1="23" y1="59" x2="45" y2="59" stroke={tint.accent} strokeWidth="0.3" opacity="0.5"/>
                      <text x="34" y="64" textAnchor="middle" fontFamily="'Inter'" fontSize="3.5" fontWeight="600" letterSpacing="0.3" fill={tint.accent} opacity="0.7">{tint.label.toUpperCase()}</text>
                    </svg>
                  </div>
                  {/* duration below bottle */}
                  <div style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: 0.8,
                    color: PROTO.gray6, marginTop: 8, fontFamily: PROTO.mono,
                  }}>
                    {s.dur}
                  </div>
                </div>

                {/* Right: content card */}
                <div style={{
                  flex: 1, background: PROTO.white, borderRadius: 18,
                  padding: '16px 18px', position: 'relative',
                  border: '0.5px solid rgba(0,0,0,0.05)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                }}>
                  {/* Roman numeral — subtle top-right */}
                  <div style={{
                    position: 'absolute', top: 12, right: 16,
                    fontFamily: displayFont, fontSize: 22, fontWeight: 400,
                    color: tint.accent, lineHeight: 1, fontStyle: 'italic',
                    opacity: 0.85, letterSpacing: '-0.01em',
                  }}>
                    {toRoman(i + 1)}
                  </div>

                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 1.8,
                    color: tint.accent, textTransform: 'uppercase',
                  }}>
                    {s.note}
                  </div>
                  <div style={{
                    fontFamily: displayFont, fontSize: 18, fontWeight: 500,
                    color: PROTO.ink, marginTop: 3, lineHeight: 1.15,
                    letterSpacing: '-0.01em', paddingRight: 32,
                  }}>
                    {s.t}
                  </div>
                  <div style={{
                    fontSize: 11, color: PROTO.inkSoft, lineHeight: 1.45,
                    marginTop: 6, fontStyle: 'italic', fontFamily: displayFont,
                  }}>
                    "{s.benefit}"
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 500, letterSpacing: 0.4,
                    color: PROTO.gray6, marginTop: 8,
                    fontFamily: PROTO.mono,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {Icon.droplet(PROTO.gray6, 10)} {s.ingredient}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════ CONSISTENCY WHISPER ══════ */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{
          background: PROTO.coralTint, borderRadius: 18,
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          border: `0.5px solid ${PROTO.coralTintDeep}`,
        }}>
          {/* tiny streak viz */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            {[3, 5, 4, 6, 5, 7, 6].map((h, i) => (
              <div key={i} style={{
                width: 4, height: h * 2, borderRadius: 2,
                background: accent, opacity: 0.4 + i * 0.085,
              }}/>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: PROTO.ink, lineHeight: 1.35,
            }}>
              <span style={{ fontFamily: displayFont, fontStyle: 'italic', fontSize: 14, color: accent, fontWeight: 500 }}>7 dias</span> em ritmo. Sua pele está aprendendo.
            </div>
          </div>
          {Icon.chevronR(accent, 14)}
        </div>
      </div>

      {/* ══════ STICKY CTA — "Começar minha rotina" ══════ */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 86, zIndex: 25,
        padding: '16px 18px 0',
        background: 'linear-gradient(180deg, rgba(250,248,243,0) 0%, rgba(250,248,243,0.85) 40%, rgba(250,248,243,1) 100%)',
      }}>
        <div style={{
          background: PROTO.ink, borderRadius: 100,
          padding: '16px 20px 16px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 12px 28px rgba(29,58,68,0.28)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* coral shimmer accent */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
            background: accent,
          }}/>

          <div>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase',
            }}>
              Abrir a cerimônia
            </div>
            <div style={{
              color: '#fff', fontSize: 16, fontWeight: 500,
              marginTop: 2, fontFamily: displayFont, fontStyle: 'italic',
              letterSpacing: '-0.01em',
            }}>
              Começar minha rotina
            </div>
          </div>

          <div style={{
            width: 44, height: 44, borderRadius: 22, background: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 12px ${accent}88`,
          }}>
            {Icon.play('#fff', 16)}
          </div>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloAtelier });
