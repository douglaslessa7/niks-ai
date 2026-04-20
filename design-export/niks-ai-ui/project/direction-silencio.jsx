// DIRECTION — "SILÊNCIO"
// Luxo minimalista absoluto. Inspiração: Aesop, Byredo, Le Labo.
// Tudo respira. Zero ornamento. Um único acento de cor (o CTA).
// Hierarquia por tipografia e espaço em branco, nada mais.

function ProtocoloSilencio({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);
  const totalMin = steps.reduce((a, x) => a + parseInt(x.dur), 0);

  // Tom de fundo levemente diferente entre AM e PM — mas ambos neutros
  const bg = mode === 'am' ? '#F7F4EE' : '#EDE8E0';
  const ink = '#1D3A44';
  const inkSoft = 'rgba(29,58,68,0.55)';
  const inkHair = 'rgba(29,58,68,0.12)';

  return (
    <div style={{
      background: bg, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative', color: ink,
    }}>
      {/* ══════ MASTHEAD — minimal ══════ */}
      <div style={{
        paddingTop: 62, paddingLeft: 28, paddingRight: 28, paddingBottom: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 3,
          color: inkSoft, textTransform: 'uppercase',
        }}>
          NIKS
        </div>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 2.5,
          color: inkSoft, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {mode === 'am' ? Icon.sun(inkSoft, 11) : Icon.moon(inkSoft, 11)}
          {mode === 'am' ? 'Manhã' : 'Noite'}
        </div>
      </div>

      {/* ══════ HERO — só tipografia ══════ */}
      <div style={{ padding: '90px 28px 0' }}>
        {/* Tiny eyebrow — date */}
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 2,
          color: inkSoft, textTransform: 'uppercase',
          marginBottom: 28,
        }}>
          Quinta, 14 de novembro
        </div>

        {/* The only title on the screen */}
        <div style={{
          fontFamily: displayFont, fontSize: 52, fontWeight: 400,
          color: ink, lineHeight: 1, letterSpacing: '-0.03em',
        }}>
          <span style={{ fontStyle: 'italic' }}>Seu ritual</span>
        </div>
        <div style={{
          fontFamily: displayFont, fontSize: 52, fontWeight: 400,
          color: ink, lineHeight: 1, letterSpacing: '-0.03em',
          marginTop: 4,
        }}>
          de hoje.
        </div>

        {/* Single-line meta, one layer under — quiet */}
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
          color: inkSoft, marginTop: 36,
        }}>
          {steps.length} gestos &nbsp;·&nbsp; {totalMin} minutos
        </div>
      </div>

      {/* ══════ THE SEQUENCE — plain lines ══════ */}
      <div style={{ padding: '88px 28px 0' }}>
        {/* tiny section mark */}
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 2.5,
          color: inkSoft, textTransform: 'uppercase',
          paddingBottom: 18,
          borderBottom: `0.5px solid ${inkHair}`,
        }}>
          Sequência
        </div>

        {steps.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start',
            gap: 20, padding: '22px 0',
            borderBottom: i < steps.length - 1 ? `0.5px solid ${inkHair}` : 'none',
          }}>
            {/* Numeral — serif, quiet */}
            <div style={{
              fontFamily: displayFont, fontSize: 15, fontWeight: 400,
              color: inkSoft, fontStyle: 'italic',
              width: 24, flexShrink: 0, paddingTop: 3,
              letterSpacing: '-0.01em',
            }}>
              {toRoman(i + 1)}
            </div>

            {/* Middle: name only — let it breathe */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: displayFont, fontSize: 19, fontWeight: 400,
                color: ink, lineHeight: 1.2, letterSpacing: '-0.01em',
              }}>
                {s.t}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: 0.2,
                color: inkSoft, marginTop: 6,
              }}>
                {s.ingredient}
              </div>
            </div>

            {/* Right: duration — small, tabular */}
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
              color: inkSoft, flexShrink: 0, paddingTop: 5,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {s.dur}
            </div>
          </div>
        ))}
      </div>

      {/* ══════ STICKY CTA — the only color on the screen ══════ */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 86, zIndex: 25,
        padding: '32px 28px 0',
        background: `linear-gradient(180deg, ${bg}00 0%, ${bg}dd 30%, ${bg} 100%)`,
      }}>
        <div style={{
          background: accent, borderRadius: 100,
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10,
          boxShadow: `0 10px 28px ${accent}40`,
        }}>
          <div style={{
            color: '#fff', fontSize: 14, fontWeight: 500,
            fontFamily: displayFont, fontStyle: 'italic',
            letterSpacing: '-0.005em',
          }}>
            Começar minha rotina
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1 }}>
            <path d="M3 7h8m0 0L7.5 3.5M11 7L7.5 10.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloSilencio });
