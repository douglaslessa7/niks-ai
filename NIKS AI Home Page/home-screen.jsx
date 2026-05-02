// NIKS AI — Home screen (new UI reform)
// Editorial, quiet-luxury language matching Quietude v4.
// Portuguese BR copy throughout.

// ───────────────────────────────────────────────────────────────
// Mock data — what a real logged-in user would see
// ───────────────────────────────────────────────────────────────
const NIKS_USER = {
  firstName: 'Beatriz',
  skinScore: 72,
  previousScore: 67,
  streakDays: 12,
  lastScanDate: '11 nov',
  daysSinceScan: 3,
  nextRitualStep: 'Sérum Antioxidante',
  nextRitualIndex: 2,
  ritualTotal: 3,
  ritualMode: 'am', // 'am' | 'pm'
  ritualDoneToday: 1,
  // Recent scans
  recentScans: [
  { id: 1, date: '11 nov', score: 72, delta: +5, label: 'Quarta-feira' },
  { id: 2, date: '04 nov', score: 67, delta: +2, label: 'Quarta-feira' },
  { id: 3, date: '28 out', score: 65, delta: -1, label: 'Terça-feira' }],

  // Today's food entries (food analysis feature)
  todayMeals: [
  { id: 1, time: '08:12', name: 'Tapioca com queijo', impact: 'neutro', score: 0 },
  { id: 2, time: '13:30', name: 'Salmão grelhado · quinoa · rúcula', impact: 'positivo', score: +8 }]

};

// ───────────────────────────────────────────────────────────────
// Time-of-day helpers — the home changes mood through the day
// ───────────────────────────────────────────────────────────────
function getTimeContext(hour) {
  if (hour >= 5 && hour < 12) return { period: 'manhã', greeting: 'Bom dia', mode: 'am', orbVariant: 'dawn' };
  if (hour >= 12 && hour < 18) return { period: 'tarde', greeting: 'Boa tarde', mode: 'am', orbVariant: 'day' };
  if (hour >= 18 && hour < 22) return { period: 'entardecer', greeting: 'Boa noite', mode: 'pm', orbVariant: 'dusk' };
  return { period: 'noite', greeting: 'Boa noite', mode: 'pm', orbVariant: 'night' };
}

// Formatted short date (matches Quietude masthead style)
function formatDateShort(d) {
  const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d.getDate()} ${months[d.getMonth()]} · ${weekdays[d.getDay()]}`;
}

// ───────────────────────────────────────────────────────────────
// Orb — ritual centerpiece, same DNA as Quietude v4
// but with 4 time-of-day variants
// ───────────────────────────────────────────────────────────────
function HomeOrb({ variant = 'dawn', size = 160 }) {
  const orbs = {
    dawn: 'radial-gradient(circle at 35% 30%, #FFEFE4 0%, #F9C9B6 30%, #E89178 70%, #C86651 100%)',
    day: 'radial-gradient(circle at 35% 30%, #FFF3E8 0%, #F5D0BC 35%, #E19A82 75%, #BE5D49 100%)',
    dusk: 'radial-gradient(circle at 35% 30%, #FFDCCB 0%, #E59A82 35%, #A85A6B 75%, #4A2E4A 100%)',
    night: 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #F4EEE4 30%, #D8CDB8 60%, #A89676 100%)'
  };
  const shadows = {
    dawn: '0 20px 48px rgba(232,145,120,0.32), inset 0 2px 0 rgba(255,255,255,0.55)',
    day: '0 20px 48px rgba(225,154,130,0.30), inset 0 2px 0 rgba(255,255,255,0.5)',
    dusk: '0 20px 48px rgba(168,90,107,0.35), inset 0 2px 0 rgba(255,255,255,0.45)',
    night: '0 0 70px rgba(255,248,220,0.4), 0 20px 48px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.6)'
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: orbs[variant],
      boxShadow: shadows[variant],
      position: 'relative',
      transition: 'background 700ms ease, box-shadow 700ms ease', textAlign: "left", lineHeight: "1.4", margin: "2px"
    }}>
      {/* Highlight */}
      <div style={{
        position: 'absolute', top: size * 0.1, left: size * 0.2, width: size * 0.32, height: size * 0.2,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%)',
        filter: 'blur(5px)'
      }} />
      {variant === 'night' &&
      <>
          <div style={{ position: 'absolute', top: size * 0.32, left: size * 0.54, width: size * 0.11, height: size * 0.11, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 60%, transparent 100%)' }} />
          <div style={{ position: 'absolute', top: size * 0.55, left: size * 0.28, width: size * 0.08, height: size * 0.08, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.16) 60%, transparent 100%)' }} />
          <div style={{ position: 'absolute', top: size * 0.68, left: size * 0.5, width: size * 0.05, height: size * 0.05, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.14) 60%, transparent 100%)' }} />
        </>
      }
    </div>);

}

// Small decorative ornament — hairline + dot + hairline (from Quietude)
function HomeOrnament({ accent, inkHair }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div style={{ width: 40, height: 0.5, background: inkHair }} />
      <div style={{ width: 5, height: 5, borderRadius: 3, background: accent }} />
      <div style={{ width: 40, height: 0.5, background: inkHair }} />
    </div>);

}

// ───────────────────────────────────────────────────────────────
// HOME — Variant A · "Serena" — light, editorial, vertical flow
// ───────────────────────────────────────────────────────────────
function HomeSerena({ user = NIKS_USER, displayFont = PROTO.serif, accent = PROTO.coral, hourOverride, modeOverride }) {
  const [hour] = React.useState(hourOverride ?? new Date().getHours());
  let ctx = getTimeContext(hour);
  if (modeOverride === 'am') ctx = { ...ctx, mode: 'am', orbVariant: 'dawn', greeting: 'Bom dia', period: 'manhã' };
  if (modeOverride === 'dusk') ctx = { ...ctx, mode: 'pm', orbVariant: 'dusk', greeting: 'Boa tarde', period: 'entardecer' };
  if (modeOverride === 'pm') ctx = { ...ctx, mode: 'pm', orbVariant: 'night', greeting: 'Boa noite', period: 'noite' };
  const today = new Date(2026, 10, 14); // Nov 14, 2026 — fixed for demo

  const isDark = ctx.orbVariant === 'night';
  const isDusk = ctx.orbVariant === 'dusk';
  const bg = isDark ?
  'linear-gradient(180deg, #0F1420 0%, #1A1F2E 45%, #2A1F28 100%)' :
  isDusk ?
  'linear-gradient(180deg, #FFF2E8 0%, #FCE3D4 45%, #F5CFBD 100%)' :
  '#FFFFFF';
  const ink = isDark ? '#FFFFFF' : '#2B2724';
  const inkSoft = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.55)';
  const inkHair = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(43,39,36,0.10)';
  const inkWhisper = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(43,39,36,0.35)';
  const surfaceSoft = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(43,39,36,0.025)';

  const delta = user.skinScore - user.previousScore;

  return (
    <div style={{
      background: bg, height: '100%', fontFamily: PROTO.sans,
      position: 'relative', color: ink, overflow: 'hidden',
      transition: 'background 700ms ease'
    }}>
      {isDark && <HomeNightSky />}

      <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 180, position: 'relative', zIndex: 1 }}>

        {/* ─── Masthead ─── */}
        <div style={{
          paddingTop: 62, paddingLeft: 28, paddingRight: 28,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.8, color: inkSoft, textTransform: 'uppercase' }}>NIKS</div>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.5, color: inkSoft, fontVariantNumeric: 'tabular-nums' }}>{formatDateShort(today)}</div>
        </div>

        {/* ─── Orb ─── */}
        <div style={{ padding: '46px 28px 0', display: 'flex', justifyContent: 'center' }}>
          <HomeOrb variant={ctx.orbVariant} size={148} />
        </div>

        {/* ─── Greeting ─── */}
        <div style={{ padding: '28px 28px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.8, color: accent, textTransform: 'uppercase' }}>
            {ctx.greeting}
          </div>
          <div style={{
            fontFamily: displayFont, fontSize: 40, fontWeight: 400,
            color: ink, lineHeight: 1.02, letterSpacing: '-0.025em',
            marginTop: 10
          }}>
            <span style={{ fontStyle: 'italic' }}>{user.firstName.toLowerCase()}</span>.
          </div>

          <div style={{ marginTop: 22 }}>
            <HomeOrnament accent={accent} inkHair={inkHair} />
          </div>

          <div style={{
            fontFamily: displayFont, fontSize: 16, fontWeight: 400,
            color: inkSoft, fontStyle: 'italic', letterSpacing: '-0.005em',
            marginTop: 20, lineHeight: 1.5, padding: '0 20px'
          }}>
            Sua pele lembra de cada gesto. <br />Hoje é {ctx.period}.
          </div>
        </div>

        {/* ─── Ritual pointer — "Continue seu ritual" ─── */}
        <div style={{ padding: '44px 28px 0' }}>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 2.8,
            color: inkSoft, textTransform: 'uppercase', textAlign: 'center'
          }}>Onde você está</div>

          <div style={{
            marginTop: 18,
            padding: '22px 22px',
            borderTop: `0.5px solid ${inkHair}`,
            borderBottom: `0.5px solid ${inkHair}`,
            display: 'flex', alignItems: 'center', gap: 18,
            cursor: 'pointer'
          }}>
            {/* Little mini-orb as visual anchor */}
            <div style={{ flexShrink: 0 }}>
              <HomeOrb variant={ctx.orbVariant} size={52} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: 1.5,
                color: accent, textTransform: 'uppercase'
              }}>
                Ritual de {ctx.mode === 'am' ? 'manhã' : 'noite'} · {user.ritualDoneToday}/{user.ritualTotal}
              </div>
              <div style={{
                fontFamily: displayFont, fontSize: 22, fontWeight: 400,
                color: ink, letterSpacing: '-0.015em', lineHeight: 1.15, marginTop: 4
              }}>
                Próximo passo, <span style={{ fontStyle: 'italic' }}>{user.nextRitualStep.toLowerCase()}</span>.
              </div>
            </div>
            <svg width="8" height="14" viewBox="0 0 7 12" style={{ flexShrink: 0 }}>
              <path d="M1 1L6 6L1 11" stroke={accent} strokeWidth="1.3" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          {/* Progress — 3 minimal bars */}
          <div style={{ display: 'flex', gap: 6, marginTop: 16, padding: '0 2px' }}>
            {Array.from({ length: user.ritualTotal }).map((_, i) =>
            <div key={i} style={{
              flex: 1, height: 2, borderRadius: 1,
              background: i < user.ritualDoneToday ? accent : inkHair,
              transition: 'background 400ms ease'
            }} />
            )}
          </div>
        </div>

        {/* ─── Skin Score — editorial card ─── */}
        <div style={{ padding: '52px 28px 0' }}>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 2.8,
            color: inkSoft, textTransform: 'uppercase', textAlign: 'center'
          }}>Sua pele hoje</div>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            {/* Giant Score */}
            <div style={{
              fontFamily: displayFont, fontWeight: 400,
              color: ink, lineHeight: 0.9, letterSpacing: '-0.045em',
              fontVariantNumeric: 'tabular-nums',
              position: 'relative', display: 'inline-block'
            }}>
              <span style={{ fontSize: 110 }}>{user.skinScore}</span>
              <span style={{
                position: 'absolute',
                right: -24, top: 14,
                fontSize: 18, fontStyle: 'italic',
                color: inkSoft, letterSpacing: 0
              }}>/100</span>
            </div>

            {/* delta label */}
            <div style={{
              marginTop: 8,
              fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
              color: inkSoft, fontVariantNumeric: 'tabular-nums',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
            }}>
              <span>Skin Score</span>
              <span style={{ width: 3, height: 3, borderRadius: 2, background: inkWhisper }} />
              <span style={{ color: delta >= 0 ? accent : inkSoft, fontStyle: 'italic', fontFamily: displayFont, fontSize: 13 }}>
                {delta >= 0 ? '+' : ''}{delta} desde {user.lastScanDate}
              </span>
            </div>
          </div>

          {/* Three vitals row */}
          <div style={{
            marginTop: 32, padding: '22px 0',
            borderTop: `0.5px solid ${inkHair}`,
            borderBottom: `0.5px solid ${inkHair}`,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)'
          }}>
            {[
            { label: 'Hidratação', value: 78, unit: '%' },
            { label: 'Textura', value: 'II', unit: 'grau' },
            { label: 'Oleosidade', value: 'média', unit: '' }].
            map((v, i) =>
            <div key={i} style={{
              textAlign: 'center',
              borderRight: i < 2 ? `0.5px solid ${inkHair}` : 'none',
              padding: '0 8px'
            }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.6, color: inkSoft, textTransform: 'uppercase' }}>
                  {v.label}
                </div>
                <div style={{
                fontFamily: displayFont, fontSize: 26, fontWeight: 400,
                color: ink, letterSpacing: '-0.02em', marginTop: 6,
                fontVariantNumeric: 'tabular-nums',
                fontStyle: typeof v.value === 'string' && v.unit === '' ? 'italic' : 'normal'
              }}>{v.value}{typeof v.value === 'number' ?
                <span style={{ fontSize: 14, color: inkSoft, fontStyle: 'italic', marginLeft: 2 }}>{v.unit}</span> :
                null}</div>
              </div>
            )}
          </div>

          {/* New scan link */}
          <div style={{
            marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer'
          }}>
            <div style={{
              fontFamily: displayFont, fontSize: 14, fontWeight: 400,
              color: accent, fontStyle: 'italic', letterSpacing: '-0.005em'
            }}>
              {user.daysSinceScan} dias desde o último scan — escanear novamente
            </div>
          </div>
        </div>

        {/* ─── Hoje — Food diary ─── */}
        <div style={{ padding: '52px 28px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: 2.8,
              color: accent, textTransform: 'uppercase'
            }}>Hoje</div>
            <div style={{
              fontFamily: displayFont, fontSize: 26, fontWeight: 400,
              color: ink, fontStyle: 'italic', letterSpacing: '-0.02em',
              marginTop: 6
            }}>O que você comeu</div>
          </div>

          {/* Meals list — editorial rows */}
          <div>
            {user.todayMeals.map((m, i) => {
              const positive = m.score > 0;
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 20,
                  padding: '20px 0 20px 16px',
                  borderBottom: `0.5px solid ${inkHair}`,
                  position: 'relative', cursor: 'pointer'
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 20, bottom: 20,
                    width: 2, borderRadius: 1, background: positive ? accent : inkHair
                  }} />
                  <div style={{
                    fontFamily: displayFont, fontSize: 14, fontWeight: 400,
                    color: inkSoft, fontStyle: 'italic',
                    width: 40, flexShrink: 0, paddingTop: 4,
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {m.time}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: displayFont, fontSize: 18, fontWeight: 400,
                      color: ink, lineHeight: 1.25, letterSpacing: '-0.012em'
                    }}>{m.name}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
                      color: inkSoft, marginTop: 5
                    }}>
                      {m.impact === 'positivo' ? 'impacto positivo na pele' :
                      m.impact === 'neutro' ? 'impacto neutro' :
                      'pode afetar a pele'}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: displayFont, fontSize: 18, fontWeight: 400,
                    color: positive ? accent : inkWhisper, fontStyle: 'italic',
                    flexShrink: 0, paddingTop: 4,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em'
                  }}>
                    {m.score > 0 ? '+' : ''}{m.score !== 0 ? m.score : '—'}
                  </div>
                </div>);

            })}

            {/* Add meal row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '22px 0 6px 18px',
              cursor: 'pointer'
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <div style={{
                fontFamily: displayFont, fontSize: 15, fontWeight: 400,
                color: accent, fontStyle: 'italic', letterSpacing: '-0.005em'
              }}>Registrar uma refeição</div>
            </div>
          </div>
        </div>

        {/* ─── Evolução — mini sparkline of recent scores ─── */}
        <div style={{ padding: '56px 28px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: 2.8,
              color: inkSoft, textTransform: 'uppercase'
            }}>Últimos scans</div>
            <div style={{
              fontFamily: displayFont, fontSize: 22, fontWeight: 400,
              color: ink, fontStyle: 'italic', letterSpacing: '-0.015em',
              marginTop: 6
            }}>Sua evolução</div>
          </div>

          <div style={{
            borderTop: `0.5px solid ${inkHair}`,
            borderBottom: `0.5px solid ${inkHair}`,
            padding: '28px 0'
          }}>
            {/* Sparkline */}
            <HomeSparkline data={[64, 66, 65, 67, 72]} accent={accent} inkHair={inkHair} inkSoft={inkSoft} />
          </div>

          {/* Recent scans — editorial list */}
          <div style={{ marginTop: 8 }}>
            {user.recentScans.map((s, i) =>
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 18,
              padding: '18px 0',
              borderBottom: i < user.recentScans.length - 1 ? `0.5px solid ${inkHair}` : 'none',
              cursor: 'pointer'
            }}>
                <div style={{
                fontFamily: displayFont, fontSize: 13, fontWeight: 400,
                color: accent, fontStyle: 'italic',
                width: 16, flexShrink: 0
              }}>
                  {['I', 'II', 'III'][i]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                  fontFamily: displayFont, fontSize: 17, fontWeight: 400,
                  color: ink, letterSpacing: '-0.01em'
                }}>{s.date}</div>
                  <div style={{ fontSize: 11, color: inkSoft, marginTop: 3 }}>{s.label}</div>
                </div>
                <div style={{
                fontFamily: displayFont, fontSize: 22, fontWeight: 400,
                color: ink, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums'
              }}>{s.score}</div>
                <div style={{
                width: 54, textAlign: 'right',
                fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
                color: s.delta >= 0 ? accent : inkSoft,
                fontVariantNumeric: 'tabular-nums', fontStyle: 'italic',
                fontFamily: displayFont, fontSize: 13
              }}>
                  {s.delta > 0 ? '+' : ''}{s.delta}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Verse — poetic closer ─── */}
        <div style={{ padding: '56px 44px 0', textAlign: 'center' }}>
          <HomeOrnament accent={accent} inkHair={inkHair} />
          <div style={{
            fontFamily: displayFont, fontSize: 18, fontWeight: 400,
            color: inkSoft, fontStyle: 'italic', lineHeight: 1.5,
            letterSpacing: '-0.005em', marginTop: 22
          }}>
            “A pele lembra o cuidado. Cada gesto é uma conversa entre você e o tempo.”
          </div>
        </div>

      </div>
      {/* ─── end scroll ─── */}

      {/* ─── CTA flutuante (scan) ─── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 112,
        padding: '0 24px', zIndex: 25, pointerEvents: 'none'
      }}>
        <div style={{
          background: accent, borderRadius: 100, padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: `0 14px 32px ${accent}38`,
          pointerEvents: 'auto', cursor: 'pointer'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          </svg>
          <div style={{
            color: '#fff', fontSize: 14, fontWeight: 500,
            fontFamily: displayFont, fontStyle: 'italic', letterSpacing: '-0.005em'
          }}>Escanear</div>
        </div>
      </div>

      <ProtoTabBar active="scanear" theme={isDark ? 'dark' : 'light'} />
    </div>);

}

// ───────────────────────────────────────────────────────────────
// Sparkline — editorial line chart (hairlines, no axes)
// ───────────────────────────────────────────────────────────────
function HomeSparkline({ data, accent, inkHair, inkSoft }) {
  const w = 320;
  const h = 80;
  const pad = 8;
  const min = Math.min(...data) - 3;
  const max = Math.max(...data) + 3;
  const pts = data.map((v, i) => {
    const x = pad + i / (data.length - 1) * (w - pad * 2);
    const y = pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    return [x, y];
  });
  const path = pts.map((p, i) => i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`).join(' ');
  const areaPath = path + ` L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
  const lastPt = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.12" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* baseline grid — 1 line */}
      <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} stroke={inkHair} strokeWidth="0.5" strokeDasharray="2 3" />
      <path d={areaPath} fill="url(#sparkfill)" />
      <path d={path} fill="none" stroke={accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) =>
      <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.5 : 1.5}
      fill={i === pts.length - 1 ? accent : '#fff'}
      stroke={accent} strokeWidth={i === pts.length - 1 ? 0 : 1} />
      )}
      <text x={lastPt[0]} y={lastPt[1] - 10} fontSize="10" fill={inkSoft} textAnchor="middle"
      fontFamily="'Cormorant Garamond', serif" fontStyle="italic">
        hoje
      </text>
    </svg>);

}

// Reuse Quietude's night-sky for dark mode
function HomeNightSky() {
  const stars = React.useMemo(() => Array.from({ length: 32 }).map((_, i) => ({
    x: (i * 37 + 13) % 100,
    y: (i * 53 + 7) % 100,
    r: i % 3 === 0 ? 1.3 : 0.7,
    o: 0.3 + i * 17 % 60 / 100
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
        {stars.map((s, i) =>
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#fff" opacity={s.o} />
        )}
      </svg>
    </div>);

}

Object.assign(window, { HomeSerena, HomeOrb, NIKS_USER });