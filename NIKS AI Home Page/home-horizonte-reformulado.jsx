// NIKS AI — Home · V1 "Horizonte Reformulado"
// Mantém o hero da Horizonte EXATAMENTE. Abaixo, uma tela simples e clara:
// um único foco primário (próximo passo do ritual), e dois módulos quietos
// (pele hoje + refeições). Nada de editorial, nada de sparkline, nada de verse.
// Critério: entender em menos de 3 segundos.

// ───────────────────────────────────────────────────────────────
// HERO REFORMULADO — 6 variantes
// ───────────────────────────────────────────────────────────────
function HeroReformulado({ heroVariant, user, displayFont, accent, ctx, today, isDark, inkSoft, ink }) {
  // ─────────────────────────────────────────────
  // Masthead compartilhado (NIKS · Edição)
  // ─────────────────────────────────────────────
  const Masthead = () =>
  <div style={{
    paddingLeft: 28, paddingRight: 28,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    position: 'relative', zIndex: 3
  }}>
      <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 2.8,
      color: isDark ? 'rgba(255,255,255,0.7)' : inkSoft,
      textTransform: 'uppercase'
    }}>NIKS</div>
      <div style={{
      fontSize: 10, fontWeight: 500, letterSpacing: 0.5,
      color: isDark ? 'rgba(255,255,255,0.7)' : inkSoft,
      fontVariantNumeric: 'tabular-nums'
    }}>Edição · {formatDateShort(today)}</div>
    </div>;


  // Subtítulos:
  // - subtitleForced: quebra forçada após "skincare" (usado APENAS pela 'overlap' a pedido do usuário)
  // - subtitle: comprimento natural, sem quebra forçada (usado pelas demais)
  const subtitleForced = ctx.mode === 'am' ?
  <>Sua rotina da manhã já está<br />esperando por você.</> :

  <>Sua rotina da noite já está<br />esperando por você.</>;

  const subtitle = ctx.mode === 'am' ?
  'Bom dia! Sua rotina de skincare da manhã já está esperando por você.' :
  'Boa noite! Sua rotina de skincare noturna já está esperando por você.';

  const textShadowDark = isDark ? '0 2px 12px rgba(0,0,0,0.75), 0 0 24px rgba(0,0,0,0.5)' : 'none';

  // ═══════════════════════════════════════════════════════
  // VARIANT: 'overlap' — Reformulado original
  // Texto ocupa todo o espaço do hero, pode sobrepor a orb
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'overlap') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 56, overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', right: -110, top: 110, zIndex: 1,
          opacity: isDark ? 1 : 0.9
        }}>
          <HomeOrb variant={ctx.orbVariant} size={320} />
        </div>

        <Masthead />

        <div style={{ paddingLeft: 28, paddingRight: 28, marginTop: 44, position: 'relative', zIndex: 2 }}>
          <div style={{
            fontFamily: displayFont, fontSize: 54, fontWeight: 400,
            color: isDark ? '#FFFFFF' : accent, lineHeight: 0.95, letterSpacing: '-0.035em'
          }}>
            <span style={{ fontStyle: 'italic' }}>Olá,</span><br />
            {user.firstName.toLowerCase()}.
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.75)' : accent,
            fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 18, lineHeight: 1.5,
            textShadow: textShadowDark
          }}>
            {subtitleForced}
          </div>
        </div>
      </div>);

  }

  // ═══════════════════════════════════════════════════════
  // VARIANT: 'constrained' — base "refeições vazio"
  // Texto à esquerda, orb à direita, sem sobreposição
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'constrained') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 56, overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', right: -110, top: 110, zIndex: 1,
          opacity: isDark ? 1 : 0.9
        }}>
          <HomeOrb variant={ctx.orbVariant} size={320} />
        </div>

        <Masthead />

        <div style={{ paddingLeft: 28, marginTop: 44, position: 'relative', zIndex: 2 }}>
          <div style={{
            fontFamily: displayFont, fontSize: 54, fontWeight: 400,
            color: isDark ? '#FFFFFF' : accent, lineHeight: 0.95, letterSpacing: '-0.035em',
            maxWidth: 180
          }}>
            <span style={{ fontStyle: 'italic' }}>Olá,</span><br />
            {user.firstName.toLowerCase()}.
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.75)' : accent,
            fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 18, lineHeight: 1.5, maxWidth: 190,
            textShadow: textShadowDark
          }}>
            {ctx.mode === 'am' ? (
              <>Sua rotina da manhã já está<br />esperando por você.</>
            ) : (
              <>Sua rotina da noite já está<br />esperando por você.</>
            )}
          </div>
        </div>
      </div>);

  }

  // ═══════════════════════════════════════════════════════
  // VAR 1: 'constrained-black' — igual constrained, texto preto
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'constrained-black') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 56, overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', right: -110, top: 110, zIndex: 1,
          opacity: isDark ? 1 : 0.9
        }}>
          <HomeOrb variant={ctx.orbVariant} size={320} />
        </div>

        <Masthead />

        <div style={{ paddingLeft: 28, marginTop: 44, position: 'relative', zIndex: 2 }}>
          <div style={{
            fontFamily: displayFont, fontSize: 54, fontWeight: 400,
            color: isDark ? '#FFFFFF' : '#000000', lineHeight: 0.95, letterSpacing: '-0.035em',
            maxWidth: 180
          }}>
            <span style={{ fontStyle: 'italic' }}>Olá,</span><br />
            {user.firstName.toLowerCase()}.
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.75)' : '#000000',
            fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 18, lineHeight: 1.5, maxWidth: 190,
            textShadow: textShadowDark
          }}>
            {subtitle}
          </div>
        </div>
      </div>);

  }

  // ═══════════════════════════════════════════════════════
  // VAR 2: 'small-orb-free' — orb pequena (148), texto livre
  // Orb ocupa pouco espaço, texto pode usar toda a largura
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'small-orb-free') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 12, overflow: 'hidden'
      }}>
        <Masthead />

        {/* Linha 1: "Olá, beatriz." com a orb COLADA à direita,
                    centralizada verticalmente entre as duas linhas do nome. */}
        <div style={{
          position: 'relative', zIndex: 2,
          paddingLeft: 28, paddingRight: 22,
          marginTop: 44
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            fontFamily: displayFont, fontSize: 54, fontWeight: 400,
            color: isDark ? '#FFFFFF' : accent, lineHeight: 0.95, letterSpacing: '-0.035em'
          }}>
            <div>
              <span style={{ fontStyle: 'italic' }}>Olá,</span><br />
              {user.firstName.toLowerCase()}.
            </div>
            <div style={{ flexShrink: 0, opacity: isDark ? 1 : 0.95 }}>
              <HomeOrb variant={ctx.orbVariant} size={88} />
            </div>
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.75)' : accent,
            fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 18, lineHeight: 1.5,
            textShadow: textShadowDark
          }}>
            Bom dia! A sua rotina de skin care<br />
            da manhã já está esperando por você
          </div>
        </div>
      </div>);

  }
  // Mesma orb grande da Reformulado (size 320) no canto inferior
  // direito, parcialmente saindo. SEM clip — overflow: visible —
  // a orb completa o arco invadindo a seção abaixo, ficando
  // atrás dos cards de conteúdo. Texto à esquerda coexiste.
  // ═══════════════════════════════════════════════════════
  // VAR 3: 'editorial' — Hero repensado.
  // Mesma orb grande da Reformulado (size 320) no canto inferior
  // direito, parcialmente saindo. SEM clip — overflow: visible —
  // a orb completa o arco invadindo a seção abaixo, ficando
  // atrás dos cards de conteúdo. Texto à esquerda coexiste.
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'editorial') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 24,
        overflow: 'visible'
      }}>
        {/* Orb grande, mesmo tamanho/posição da Reformulado principal,
                                        mas SEM clip do container — pode invadir a seção abaixo,
                                        ficando ATRÁS do card (zIndex 0). O card recebe zIndex maior
                                        via flag `editorialOrbBehindCard` no HomeHorizonteReformulado. */}
        <div style={{
          position: 'absolute', right: -110, top: 110, zIndex: 0,
          opacity: isDark ? 1 : 0.9, pointerEvents: 'none'
        }}>
          <HomeOrb variant={ctx.orbVariant} size={320} />
        </div>

        <Masthead />

        <div style={{ paddingLeft: 28, marginTop: 44, position: 'relative', zIndex: 2 }}>
          <div style={{
            fontFamily: displayFont, fontSize: 54, fontWeight: 400,
            color: isDark ? '#FFFFFF' : accent, lineHeight: 0.95, letterSpacing: '-0.035em',
            maxWidth: 180
          }}>
            <span style={{ fontStyle: 'italic' }}>Olá,</span><br />
            {user.firstName.toLowerCase()}.
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 15, fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.75)' : 'rgb(251, 123, 107)',
            fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 18, lineHeight: 1.5, maxWidth: 190,
            textShadow: textShadowDark
          }}>
            {ctx.mode === 'am' ? (
              <>Sua rotina da manhã já <br />está esperando por você.</>
            ) : (
              <>Sua rotina da noite já <br />está esperando por você.</>
            )}
          </div>
        </div>
      </div>);

  }

  // ═══════════════════════════════════════════════════════
  // VAR 4: 'orb-only' — Só a orb, sem texto.
  // A orb é o herói. Centralizada, com halo etéreo e
  // numeral editorial do dia minúsculo no canto superior.
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'orb-only') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 40, overflow: 'hidden',
        minHeight: 360, padding: "62px 0px 40px"
      }}>
        <Masthead />

        {/* Halo etéreo atrás da orb */}
        <div style={{
          position: 'absolute', left: '50%', top: 150,
          transform: 'translateX(-50%)', zIndex: 0,
          width: 240, height: 240, borderRadius: '50%',
          background: isDark ?
          'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 70%)' :
          `radial-gradient(circle at 50% 50%, ${accent}22 0%, ${accent}00 70%)`,
          pointerEvents: 'none', filter: 'blur(6px)'
        }} />

        {/* Orb centralizada — menor, elegante */}
        <div style={{
          marginTop: 40, position: 'relative', zIndex: 1,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <HomeOrb variant={ctx.orbVariant} size={168} />
        </div>

        {/* Saudação editorial — "Bom dia!" / "Boa noite!" */}
        <div style={{
          marginTop: 28, position: 'relative', zIndex: 1,
          textAlign: 'center',
          fontFamily: displayFont, fontStyle: 'italic',
          fontSize: 26, fontWeight: 400,
          color: isDark ? '#FFFFFF' : 'rgb(6, 6, 6)',
          letterSpacing: '-0.02em', lineHeight: 1
        }}>
          {ctx.mode === 'am' ? 'Bom dia!' : 'Boa noite!'}
        </div>
      </div>);

  }

  // ═══════════════════════════════════════════════════════
  // VAR 5: 'no-orb-editorial' — Hero repensado sem orb
  // Composição tipográfica pura: data extensa em serif italic,
  // saudação monumental, e uma "epígrafe" do dia em filete fino.
  // Premium, leve, totalmente livre de elementos visuais pesados.
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'no-orb-editorial') {
    const accentColor = isDark ? '#FFFFFF' : accent;
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 16, overflow: 'hidden'
      }}>
        <Masthead />

        {/* Bloco saudação + subtítulo, mais próximo do masthead */}
        <div style={{
          paddingLeft: 28, paddingRight: 28, marginTop: 28,
          position: 'relative', zIndex: 2
        }}>
          <div style={{
            fontFamily: displayFont, fontSize: 72, fontWeight: 400,
            color: accentColor, lineHeight: 0.9, letterSpacing: '-0.045em'
          }}>
            <span style={{ fontStyle: 'italic' }}>Olá,</span><br />
            {user.firstName.toLowerCase()}.
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 16, fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.75)' : accent,
            fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 18, lineHeight: 1.5,
            textShadow: textShadowDark
          }}>
            {subtitle}
          </div>
        </div>
      </div>);

  }

  // ═══════════════════════════════════════════════════════
  // VAR 6: 'direct' — Sem hero. Tela começa direto no
  // primeiro card. Apenas o masthead bem discreto no topo.
  // ═══════════════════════════════════════════════════════
  if (heroVariant === 'direct') {
    return (
      <div style={{
        position: 'relative', background: 'transparent',
        paddingTop: 62, paddingBottom: 4, overflow: 'hidden'
      }}>
        <Masthead />
      </div>);

  }

  return null;
}

function HomeHorizonteReformulado({ user = NIKS_USER, displayFont = PROTO.serif, accent = PROTO.coral, hourOverride, modeOverride, mealsState = 'filled', ritualComplete = false, fabVariant = 'floating', heroVariant = 'overlap' }) {
  const [hour] = React.useState(hourOverride ?? new Date().getHours());
  const [scanOpen, setScanOpen] = React.useState(false);
  let ctx = getTimeContext(hour);
  if (modeOverride === 'am') ctx = { ...ctx, mode: 'am', orbVariant: 'dawn', greeting: 'Bom dia', period: 'manhã' };
  if (modeOverride === 'dusk') ctx = { ...ctx, mode: 'pm', orbVariant: 'dusk', greeting: 'Boa tarde', period: 'entardecer' };
  if (modeOverride === 'pm') ctx = { ...ctx, mode: 'pm', orbVariant: 'night', greeting: 'Boa noite', period: 'noite' };
  const today = new Date(2026, 10, 14);
  const isDark = ctx.orbVariant === 'night';
  const isDusk = ctx.orbVariant === 'dusk';
  const bg = isDark ?
  'linear-gradient(180deg, #0F1420 0%, #1A1F2E 45%, #2A1F28 100%)' :
  '#FFFFFF';const ink = isDark ? '#FFFFFF' : '#2B2724';
  const inkSoft = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.58)';
  const inkHair = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(43,39,36,0.08)';
  const surface = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const surfaceHair = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,39,36,0.06)';

  const heroBg = 'transparent';

  return (
    <div style={{
      background: bg, height: '100%', fontFamily: PROTO.sans,
      position: 'relative', color: ink, overflow: 'hidden',
      transition: 'background 700ms ease'
    }}>
      {isDark && <ReformuladoNightSky />}
      <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 180, position: 'relative', zIndex: 1 }}>

        {/* ═══════════════════════════════════════
                                           HERO — variantes controladas por `heroVariant`
                                           · 'overlap'         — texto livre, pode sobrepor a orb (Reformulado original)
                                           · 'constrained'     — texto restrito à esquerda, sem sobreposição (base "vazio")
                                           · 'constrained-black' — VAR 1: igual constrained, texto preto
                                           · 'small-orb-free'  — VAR 2: texto livre + orb pequena (size 148)
                                           · 'editorial'       — VAR 3: layout repensado, leve e premium
                                           · 'orb-only'        — VAR 4: só a orb, sem texto
                                           ═══════════════════════════════════════ */}
        <HeroReformulado
          heroVariant={heroVariant}
          user={user}
          displayFont={displayFont}
          accent={accent}
          ctx={ctx}
          today={today}
          isDark={isDark}
          inkSoft={inkSoft}
          ink={ink} />
        

        {/* ═══════════════════════════════════════
                                           RITUAL — card branco, step name em coral,
                                           CTA coral pill. Dois estados: em andamento
                                           e concluído.
                                           ═══════════════════════════════════════ */}
        <div style={(() => {
          // paddingTop e zIndex do bloco do ritual variam por heroVariant:
          // · 'editorial' — orb invade por trás; precisamos zIndex maior e paddingTop menor
          // · 'orb-only', 'no-orb-editorial', 'small-orb-free' — paddingTop menor para subir o card
          // · 'direct' — sem hero, card colado no topo
          if (heroVariant === 'direct') return { padding: '12px 20px 0', position: 'relative', zIndex: 2 };
          if (heroVariant === 'editorial') return { padding: '8px 20px 0', position: 'relative', zIndex: 5 };
          if (heroVariant === 'orb-only') return { padding: '8px 20px 0', position: 'relative', zIndex: 2 };
          if (heroVariant === 'no-orb-editorial') return { padding: '12px 20px 0', position: 'relative', zIndex: 2 };
          if (heroVariant === 'small-orb-free') return { padding: '14px 20px 0', position: 'relative', zIndex: 2 };
          return { padding: '28px 20px 0' };
        })()}>
          <div style={{
            background: surface,
            border: `0.5px solid ${surfaceHair}`,
            borderRadius: 24,

            boxShadow: isDark ? 'none' : '0 2px 14px rgba(43,39,36,0.05)',
            cursor: 'pointer',
            position: 'relative', padding: "20px 22px"
          }}>
            {/* header: eyebrow + contador X/Y */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: 2.4,
                color: inkSoft, textTransform: 'uppercase'
              }}>
                Skincare {ctx.mode === 'am' ? 'matinal' : 'noturno'}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 500,
                color: inkSoft,
                fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3
              }}>
                {ritualComplete ? user.ritualTotal : user.ritualDoneToday + 1}<span style={{ opacity: 0.5, margin: '0 3px' }}>/</span>{user.ritualTotal}
              </div>
            </div>

            {ritualComplete ?
            <>
                {/* TÍTULO — estado concluído */}
                <div style={{
                fontFamily: displayFont, fontSize: 32, fontWeight: 400,
                color: ink, lineHeight: 1.05, letterSpacing: '-0.02em',
                marginTop: 16
              }}>
                  <span style={{ fontStyle: 'italic', color: ink }}>skincare {ctx.mode === 'am' ? 'matinal' : 'noturno'}</span><br /><span style={{ color: accent }}>concluído.</span>
                </div>
                <div style={{
                marginTop: 8,
                fontSize: 13, fontWeight: 400,
                color: inkSoft, letterSpacing: '-0.005em'
              }}>
                  {user.ritualTotal} de {user.ritualTotal} passos · até {ctx.mode === 'am' ? 'a noite' : 'amanhã'}
                </div>

                {/* progress bar — toda preenchida em coral */}
                <div style={{
                marginTop: 20,
                display: 'flex', gap: 6
              }}>
                  {Array.from({ length: user.ritualTotal }).map((_, i) =>
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: accent
                }} />
                )}
                </div>

                {/* CTA — coral, texto branco */}
                <div style={{
                marginTop: 20,
                background: accent, borderRadius: 100,
                padding: '15px 22px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: `0 8px 22px ${accent}30`
              }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <div style={{
                  fontSize: 15, fontWeight: 600,
                  letterSpacing: '-0.005em', color: "rgb(255, 255, 255)"
                }}>Ver resumo</div>
                </div>
              </> :

            <>
                {/* TÍTULO — passo atual em italic */}
                <div style={{
                fontFamily: displayFont, fontSize: 32, fontWeight: 400,
                color: ink, lineHeight: 1.05, letterSpacing: '-0.02em',
                fontStyle: 'italic',
                marginTop: 16
              }}>
                  {user.nextRitualStep.toLowerCase()}
                </div>

                {/* contador + duração */}
                <div style={{
                marginTop: 8,
                fontSize: 13, fontWeight: 400,
                color: inkSoft, letterSpacing: '-0.005em'
              }}>
                  passo {user.ritualDoneToday + 1} de {user.ritualTotal} · ~2 min
                </div>

                {/* progress bar — coral no ativo, hairline no resto */}
                <div style={{
                marginTop: 20,
                display: 'flex', gap: 6
              }}>
                  {Array.from({ length: user.ritualTotal }).map((_, i) =>
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < user.ritualDoneToday + 1 ? accent : inkHair,
                  transition: 'background 400ms ease'
                }} />
                )}
                </div>

                {/* CTA — coral, texto branco */}
                <div style={{
                marginTop: 20,
                background: accent, borderRadius: 100,
                padding: '15px 22px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: `0 8px 22px ${accent}30`
              }}>
                  <div style={{
                  color: '#fff', fontSize: 15, fontWeight: 600,
                  letterSpacing: '-0.005em'
                }}>Começar agora</div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>
              </>
            }
          </div>
        </div>

        {/* ═══════════════════════════════════════
                                           SCANS RECENTES — carrossel horizontal
                                           Cards no estilo da nova tela: branco puro,
                                           hairline, cantos arredondados, serif nos números.
                                           ═══════════════════════════════════════ */}
        <div style={{ paddingTop: 28 }}>
          {/* cabeçalho alinhado ao padding dos outros blocos */}
          <div style={{
            padding: '0 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 14
          }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: 1.8,
              color: inkSoft, textTransform: 'uppercase'
            }}>Scans recentes</div>
            <div style={{
              fontSize: 12, fontWeight: 500, color: accent
            }}>ver tudo</div>
          </div>

          {/* carrossel */}
          <style>{`.niks-reformulado-scroll::-webkit-scrollbar{display:none}`}</style>
          <div className="niks-reformulado-scroll" style={{
            display: 'flex', gap: 12,
            overflowX: 'auto', overflowY: 'hidden',
            padding: '0 20px 4px',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none'
          }}>
            {user.recentScans.map((s) => {
              const positive = (s.delta ?? 0) >= 0;
              return (
                <div key={s.id} style={{
                  flex: '0 0 auto',
                  width: 196,
                  background: surface,
                  border: `0.5px solid ${surfaceHair}`,
                  borderRadius: 22,
                  boxShadow: isDark ? 'none' : '0 2px 10px rgba(43,39,36,0.04)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  scrollSnapAlign: 'start',
                  display: 'flex', flexDirection: 'column'
                }}>
                  {/* imagem + score flutuante */}
                  <div style={{
                    position: 'relative',
                    height: 232,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#F4EFE9',
                    overflow: 'hidden'
                  }}>
                    <img
                      src="assets/scan-face.png"
                      alt={`Scan de ${s.date}`}
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        display: 'block'
                      }} />
                    
                    {/* score — linguagem da Reformulado: serif, itálico no /100 */}
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      background: isDark ? 'rgba(15,20,32,0.72)' : 'rgba(255,255,255,0.92)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(43,39,36,0.06)'}`,
                      borderRadius: 14,
                      padding: '6px 10px 6px 11px',
                      display: 'flex', alignItems: 'baseline', gap: 2
                    }}>
                      <div style={{
                        fontFamily: displayFont, fontSize: 20, fontWeight: 400,
                        color: ink, lineHeight: 1, letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums'
                      }}>{s.score}</div>
                      <div style={{
                        fontFamily: displayFont, fontSize: 11, fontWeight: 400,
                        color: inkSoft, fontStyle: 'italic', letterSpacing: 0
                      }}>/100</div>
                    </div>

                    {/* delta — canto inferior esquerdo, quieto */}
                    {s.delta !== 0 &&
                    <div style={{
                      position: 'absolute', left: 12, bottom: 12,
                      fontFamily: displayFont, fontSize: 13, fontWeight: 400,
                      fontStyle: 'italic',
                      color: '#FFFFFF',
                      letterSpacing: 0.2,
                      textShadow: '0 1px 4px rgba(0,0,0,0.35)'
                    }}>
                        {positive ? '+' : ''}{s.delta}
                      </div>
                    }
                  </div>

                  {/* corpo — data + ação */}
                  <div style={{
                    padding: '14px 14px 14px',
                    display: 'flex', flexDirection: 'column', gap: 12
                  }}>
                    <div>
                      <div style={{
                        fontSize: 9, fontWeight: 600, letterSpacing: 1.8,
                        color: inkSoft, textTransform: 'uppercase'
                      }}>{s.label}</div>
                      <div style={{
                        fontFamily: displayFont, fontSize: 18, fontWeight: 400,
                        color: ink, letterSpacing: '-0.02em', lineHeight: 1.1,
                        marginTop: 4
                      }}>
                        <span style={{ fontStyle: 'italic' }}>{s.date}</span>
                      </div>
                    </div>

                    <div style={{
                      background: 'transparent',
                      border: `0.5px solid ${accent}`,
                      borderRadius: 100,
                      padding: '9px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}>
                      <div style={{
                        color: accent, fontSize: 12, fontWeight: 600,
                        letterSpacing: '-0.005em'
                      }}>Ver resultado</div>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </div>
                  </div>
                </div>);

            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════
                                           REFEIÇÕES HOJE — diário do dia, reinicia 00h
                                           Estado controlado por `mealsState` prop:
                                           · 'filled' — mostra fotos + nome + score XX/100
                                           · 'empty'  — convida ao primeiro scan do dia
                                           ═══════════════════════════════════════ */}
        <div style={{ padding: '28px 20px 0' }}>
          <div style={{
            background: surface,
            border: `0.5px solid ${surfaceHair}`,
            borderRadius: 22,
            padding: mealsState === 'filled' ? '20px 22px 8px' : '22px 22px 22px',
            boxShadow: isDark ? 'none' : '0 2px 10px rgba(43,39,36,0.04)'
          }}>
            {/* header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: mealsState === 'filled' ? 6 : 0
            }}>
              <div>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 1.8,
                  color: inkSoft, textTransform: 'uppercase'
                }}>Hoje você comeu</div>
              </div>
              {mealsState === 'filled' &&
              <div style={{
                fontSize: 12, fontWeight: 500, color: accent
              }}>ver tudo</div>
              }
            </div>

            {mealsState === 'filled' && user.todayMeals.map((m, i) => {
              // Score da refeição 0-100 (impacto na pele). Valores mockados
              // coerentes com a tela nova; o mock original usava deltas.
              const mealScore = m.mealScore ?? (m.score > 0 ? 82 : 61);
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 0',
                  borderTop: `0.5px solid ${inkHair}`,
                  cursor: 'pointer'
                }}>
                  {/* Foto da refeição — substitui o horário */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    overflow: 'hidden', flexShrink: 0,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#F4EFE9',
                    border: `0.5px solid ${surfaceHair}`
                  }}>
                    <img
                      src={m.photo || 'assets/meal-prato-feito.png'}
                      alt={m.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 500,
                      color: ink, lineHeight: 1.25, letterSpacing: '-0.005em'
                    }}>{m.name}</div>
                    <div style={{
                      marginTop: 4,
                      fontFamily: displayFont, fontSize: 12, fontWeight: 400,
                      color: inkSoft, fontStyle: 'italic',
                      fontVariantNumeric: 'tabular-nums'
                    }}>{m.time}</div>
                  </div>

                  {/* Score XX/100 — linguagem unificada com scans */}
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 1,
                    flexShrink: 0
                  }}>
                    <div style={{
                      fontFamily: displayFont, fontSize: 22, fontWeight: 400,
                      color: '#FB7B6B', letterSpacing: '-0.02em', lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums'
                    }}>{mealScore}</div>
                    <div style={{
                      fontFamily: displayFont, fontSize: 12, fontWeight: 400,
                      color: inkSoft, fontStyle: 'italic', letterSpacing: 0
                    }}>/100</div>
                  </div>
                </div>);

            })}

            {/* ESTADO VAZIO — elegante, convidativo */}
            {mealsState === 'empty' &&
            <div style={{
              marginTop: 16,
              paddingTop: 22,
              borderTop: `0.5px solid ${inkHair}`,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start'
            }}>
                <div style={{
                fontFamily: displayFont, fontSize: 22, fontWeight: 400,
                color: ink, letterSpacing: '-0.02em', lineHeight: 1.15,
                maxWidth: 260
              }}>
                  <span style={{ fontStyle: 'italic' }}>nenhuma refeição</span><br />
                  escaneada <span style={{ color: accent }}>hoje</span> <span style={{ color: accent }}>ainda</span>.
                </div>
                <div style={{
                marginTop: 10,
                fontSize: 13, fontWeight: 400,
                color: inkSoft, lineHeight: 1.45, letterSpacing: '-0.005em',
                maxWidth: 270
              }}>
                  Fotografe sua próxima refeição pra ver o impacto dela na sua pele.
                </div>

                {/* CTA primária — scan */}
                <div style={{
                marginTop: 18, alignSelf: 'stretch',
                background: accent, borderRadius: 100,
                padding: '13px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: `0 6px 18px ${accent}2A`,
                cursor: 'pointer'
              }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <div style={{
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  letterSpacing: '-0.005em'
                }}>Escanear refeição</div>
                </div>
              </div>
            }

            {/* ADD ROW — só no estado preenchido (no vazio a CTA já é o foco) */}
            {mealsState === 'filled' &&
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 0',
              borderTop: `0.5px solid ${inkHair}`,
              cursor: 'pointer'
            }}>
                <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: `${accent}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2v10M2 7h10" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{
                fontSize: 14, fontWeight: 500,
                color: accent, letterSpacing: '-0.005em'
              }}>Escanear refeição</div>
              </div>
            }
          </div>
        </div>

      </div>

      <ProtoTabBar
        active="inicio"
        theme={isDark ? 'dark' : 'light'}
        rightInset={fabVariant === 'integrated' ? 92 : undefined}
        tabs={[
        { key: 'inicio', label: 'início', icon: Icon.home, activeIcon: Icon.homeFilled },
        { key: 'rotina', label: 'rotina', icon: Icon.protocol, activeIcon: Icon.protocolFilled },
        { key: 'perfil', label: 'perfil', icon: Icon.user, activeIcon: Icon.userFilled }]
        } />

      {/* FAB — presente em ambas as variantes, muda só a posição vertical */}
      <div
        onClick={() => setScanOpen(true)}
        style={{
          position: 'absolute', right: 20, zIndex: 30,
          bottom: fabVariant === 'integrated' ? 24 : 102,
          width: 68, height: 68, borderRadius: '50%',
          background: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 12px 28px ${accent}55, 0 4px 12px rgba(0,0,0,0.18)`,
          cursor: 'pointer'
        }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {scanOpen &&
      <ScanTypeSheet
        accent={accent}
        displayFont={displayFont}
        isDark={isDark}
        onClose={() => setScanOpen(false)} />

      }
    </div>);

}

// Bottom-sheet — Escolha o tipo de scan
// Adota o vocabulário visual das telas "Horizonte · Reformulado":
// tipografia serif italic para display, cards brancos/escuros, coral
// como accent. No modo noite, reaproveita o céu estrelado como pano de fundo.
function ScanTypeSheet({ accent = '#FB7B6B', displayFont = PROTO.serif, isDark = false, onClose }) {
  const ink = isDark ? '#FFFFFF' : '#2B2724';
  const inkSoft = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.58)';
  const inkHair = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(43,39,36,0.08)';
  const sheetBg = isDark ?
  'linear-gradient(180deg, #1A1F2E 0%, #2A1F28 100%)' :
  '#FFFFFF';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,39,36,0.06)';
  const cardShadow = isDark ? 'none' : '0 2px 14px rgba(43,39,36,0.05)';
  const iconBg = isDark ? 'rgba(251,123,107,0.14)' : `${accent}1A`;

  return (
    <>
      <style>{`
        @keyframes scansheet-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scansheet-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(43,39,36,0.3)',
          backdropFilter: 'blur(2px)',
          animation: 'scansheet-fade 220ms ease'
        }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 61,
        background: sheetBg,
        borderRadius: '28px 28px 0 0',
        padding: '14px 24px 32px',
        animation: 'scansheet-slide 340ms cubic-bezier(0.25, 1, 0.5, 1)',
        maxHeight: '88%', overflowY: 'auto',
        fontFamily: PROTO.sans,
        color: ink,
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
        overflow: 'hidden'
      }}>
        {/* Céu estrelado de fundo (modo noite) — sem estrelas cadentes dentro do modal */}
        {isDark &&
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: '28px 28px 0 0', overflow: 'hidden' }}>
            <ReformuladoNightSkyStatic />
          </div>
        }

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: inkHair, margin: '0 auto 24px' }} />

          {/* Eyebrow + título editorial */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: 2.8,
              color: accent, textTransform: 'uppercase'
            }}>Novo scan</div>
            <div style={{
              fontFamily: displayFont, fontSize: 28, fontWeight: 400,
              color: ink, letterSpacing: '-0.025em', lineHeight: 1.1,
              marginTop: 8
            }}>
              <span style={{ fontStyle: 'italic' }}>Escolha</span> o tipo de scan
            </div>

            {/* Divisor filigrana */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
              <div style={{ width: 28, height: 0.5, background: inkHair }} />
              <div style={{ width: 4, height: 4, borderRadius: 2, background: accent }} />
              <div style={{ width: 28, height: 0.5, background: inkHair }} />
            </div>

            <div style={{
              fontSize: 12, fontWeight: 500, letterSpacing: 0.3,
              color: inkSoft, marginTop: 14
            }}>Selecione o que você deseja analisar</div>
          </div>

          {/* Cards */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Scanear Refeição — MAIS USADO */}
            <div style={{
              background: cardBg,
              border: `0.5px solid ${cardBorder}`,
              borderRadius: 20,
              padding: '18px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: cardShadow, cursor: 'pointer',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 18, bottom: 18,
                width: 2, borderRadius: 1, background: accent
              }} />
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                marginLeft: 6
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2v8a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2M9 2v20" />
                  <path d="M17 2c-1.5 0-3 1.5-3 4v6c0 1 0.5 2 2 2v8" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{
                    fontFamily: displayFont, fontSize: 19, fontWeight: 400,
                    color: ink, letterSpacing: '-0.015em', lineHeight: 1.15
                  }}>Scanear refeição</div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 9px 3px 7px', borderRadius: 100,
                    border: `0.5px solid ${accent}`,
                    background: isDark ? 'rgba(251,123,107,0.08)' : 'rgba(251,123,107,0.06)'
                  }}>
                    <svg width="7" height="7" viewBox="0 0 8 8">
                      <circle cx="4" cy="4" r="1.5" fill={accent} />
                    </svg>
                    <span style={{
                      fontFamily: displayFont, fontStyle: 'italic', fontSize: 11,
                      color: accent, letterSpacing: '-0.005em'
                    }}>mais usado</span>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 500, letterSpacing: 0.3,
                  color: inkSoft, marginTop: 5, lineHeight: 1.45
                }}>
                  Analise o impacto da comida na sua pele
                </div>
              </div>
              <svg width="7" height="12" viewBox="0 0 7 12" style={{ flexShrink: 0, opacity: 0.9 }}>
                <path d="M1 1L6 6L1 11" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>
            </div>

            {/* Scanear Rosto */}
            <div style={{
              background: cardBg,
              border: `0.5px solid ${cardBorder}`,
              borderRadius: 20,
              padding: '18px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: cardShadow, cursor: 'pointer',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 18, bottom: 18,
                width: 2, borderRadius: 1, background: accent
              }} />
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                marginLeft: 6
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: displayFont, fontSize: 19, fontWeight: 400,
                  color: ink, letterSpacing: '-0.015em', lineHeight: 1.15
                }}>Scanear rosto</div>
                <div style={{
                  fontSize: 12, fontWeight: 500, letterSpacing: 0.3,
                  color: inkSoft, marginTop: 5, lineHeight: 1.45
                }}>
                  Faça uma análise facial completa
                </div>
              </div>
              <svg width="7" height="12" viewBox="0 0 7 12" style={{ flexShrink: 0, opacity: 0.9 }}>
                <path d="M1 1L6 6L1 11" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>
            </div>

            {/* Cancelar — link discreto, não card */}
            <div
              onClick={onClose}
              style={{
                textAlign: 'center', cursor: 'pointer',
                padding: '18px 0 4px'
              }}>
              <div style={{
                fontFamily: displayFont, fontStyle: 'italic',
                fontSize: 15, fontWeight: 400,
                color: inkSoft, letterSpacing: '-0.005em'
              }}>cancelar</div>
            </div>
          </div>
        </div>
      </div>
    </>);

}

Object.assign(window, { HomeHorizonteReformulado });

// Variante estática do céu — usada dentro do modal, sem estrelas cadentes
function ReformuladoNightSkyStatic() {
  const stars = React.useMemo(() => Array.from({ length: 56 }).map((_, i) => ({
    x: (i * 37 + 13) % 100,
    y: (i * 53 + 7) % 100,
    r: i % 3 === 0 ? 1.3 : 0.7,
    o: 0.3 + i * 17 % 60 / 100
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
      background: 'linear-gradient(180deg, #1A1F2E 0%, #2A1F28 100%)' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
        {stars.map((s, i) =>
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#fff" opacity={s.o} />
        )}
      </svg>
    </div>);

}

// Céu noturno estrelado — extraído da Quietude v4 IA
// Inclui estrelas fixas + estrelas cadentes sutis
function ReformuladoNightSky() {
  const stars = React.useMemo(() => Array.from({ length: 56 }).map((_, i) => ({
    x: (i * 37 + 13) % 100,
    y: (i * 53 + 7) % 100,
    r: i % 3 === 0 ? 1.3 : 0.7,
    o: 0.3 + i * 17 % 60 / 100
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes reformulado-shooting {
          0%   { transform: translate(0, 0) rotate(18deg); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translate(520px, 170px) rotate(18deg); opacity: 0; }
        }
        .reformulado-shoot {
          position: absolute;
          width: 140px; height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 70%, #fff 100%);
          border-radius: 1px;
          filter: drop-shadow(0 0 2px rgba(255,255,255,0.6));
          animation-name: reformulado-shooting;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          opacity: 0;
        }
      `}</style>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
        {stars.map((s, i) =>
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#fff" opacity={s.o} />
        )}
      </svg>
      {/* Estrelas cadentes — trilhas bem espaçadas no tempo, sem sobreposição
                  e sem "travar" no fim (animação linear, ciclo completo de fade-in→trajeto→fade-out) */}
      <div className="reformulado-shoot" style={{ top: '12%', left: '-20%', animationDuration: '9s', animationDelay: '1.2s' }} />
      <div className="reformulado-shoot" style={{ top: '40%', left: '-22%', animationDuration: '11s', animationDelay: '5.5s' }} />
      <div className="reformulado-shoot" style={{ top: '68%', left: '-18%', animationDuration: '10s', animationDelay: '9.8s' }} />
    </div>);

}