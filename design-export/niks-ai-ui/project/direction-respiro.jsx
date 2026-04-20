// DIRECTION — "RESPIRO"
// Variação ainda mais radical. Tudo centralizado. Zero chrome.
// A tela parece uma página de livro — fundo off-white, tipografia serif central.

function ProtocoloRespiro({ accent = PROTO.coral, displayFont = PROTO.serif, mode = 'am' }) {
  const steps = mode === 'am' ? AM_STEPS : PM_STEPS;
  const toRoman = (n) => (['I','II','III','IV','V','VI','VII','VIII','IX','X'][n - 1]);
  const totalMin = steps.reduce((a, x) => a + parseInt(x.dur), 0);

  const bg = mode === 'am' ? '#F5F1EA' : '#E8E2D8';
  const ink = '#2B2320';
  const inkSoft = 'rgba(43,35,32,0.5)';

  return (
    <div style={{
      background: bg, minHeight: '100%', fontFamily: PROTO.sans,
      paddingBottom: 120, position: 'relative', color: ink,
      textAlign: 'center',
    }}>
      {/* Masthead */}
      <div style={{
        paddingTop: 62, display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 3.5,
          color: inkSoft, textTransform: 'uppercase',
        }}>
          N I K S
        </div>
      </div>

      {/* Hero — centered, like a title page */}
      <div style={{ padding: '120px 36px 0' }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 3,
          color: inkSoft, textTransform: 'uppercase',
        }}>
          {mode === 'am' ? 'Rito da Manhã' : 'Rito da Noite'}
        </div>

        <div style={{
          fontFamily: displayFont, fontSize: 54, fontWeight: 400,
          color: ink, lineHeight: 1.02, letterSpacing: '-0.03em',
          marginTop: 32, fontStyle: 'italic',
        }}>
          Ritual
        </div>

        {/* Ornamental rule */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, marginTop: 32,
        }}>
          <div style={{ width: 30, height: 0.5, background: inkSoft }}/>
          <div style={{
            width: 4, height: 4, borderRadius: 2, background: accent,
          }}/>
          <div style={{ width: 30, height: 0.5, background: inkSoft }}/>
        </div>

        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: 0.5,
          color: inkSoft, marginTop: 28,
        }}>
          {steps.length} gestos &nbsp;·&nbsp; {totalMin} minutos
        </div>
      </div>

      {/* Sequence — centered text lines */}
      <div style={{ padding: '96px 36px 0' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ padding: '18px 0' }}>
            <div style={{
              fontFamily: displayFont, fontSize: 13, fontWeight: 400,
              color: inkSoft, fontStyle: 'italic', letterSpacing: 0.5,
              marginBottom: 4,
            }}>
              {toRoman(i + 1)}
            </div>
            <div style={{
              fontFamily: displayFont, fontSize: 22, fontWeight: 400,
              color: ink, lineHeight: 1.15, letterSpacing: '-0.015em',
            }}>
              {s.t}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 86, zIndex: 25,
        padding: '32px 28px 0',
        background: `linear-gradient(180deg, ${bg}00 0%, ${bg}dd 30%, ${bg} 100%)`,
      }}>
        <div style={{
          borderRadius: 100, padding: '17px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          border: `0.5px solid ${ink}`, background: 'transparent',
        }}>
          <div style={{
            color: ink, fontSize: 13, fontWeight: 500,
            fontFamily: displayFont, fontStyle: 'italic',
          }}>
            Começar minha rotina
          </div>
          <div style={{ width: 5, height: 5, borderRadius: 3, background: accent }}/>
        </div>
      </div>

      <ProtoTabBar active="protocolo" theme="light"/>
    </div>
  );
}

Object.assign(window, { ProtocoloRespiro });
