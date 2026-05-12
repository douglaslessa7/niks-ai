/* global React */
const { useState } = React;

// === Orb ===
function Orb({ variant = 'dawn', size = 220 }) {
  const stops = {
    dawn:  ['#FFEFE4 0%', '#F9C9B6 30%', '#E89178 70%', '#C86651 100%'],
    dusk:  ['#FFDCCB 0%', '#E59A82 35%', '#A85A6B 75%', '#4A2E4A 100%'],
    night: ['#FFFFFF 0%', '#F4EEE4 30%', '#D8CDB8 60%', '#A89676 100%'],
  }[variant];
  const shadow = {
    dawn:  '0 20px 48px rgba(232,145,120,0.32)',
    dusk:  '0 20px 48px rgba(168,90,107,0.35)',
    night: '0 0 70px rgba(255,248,220,0.4), 0 20px 48px rgba(0,0,0,0.45)',
  }[variant];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', position: 'relative',
        background: `radial-gradient(circle at 35% 30%, ${stops.join(', ')})`,
        boxShadow: shadow }}>
      <div style={{ position: 'absolute', top: '10%', left: '20%', width: '32%', height: '20%',
          borderRadius: '50%', filter: 'blur(2px)',
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%)' }} />
      {variant === 'night' && (<>
        <div style={{ position: 'absolute', top: '32%', left: '54%', width: '11%', height: '11%', borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.18) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '55%', left: '28%', width: '8%', height: '8%', borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.16) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '68%', left: '50%', width: '5%', height: '5%', borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.14) 0%, transparent 70%)' }} />
      </>)}
    </div>
  );
}

// === Eyebrow / Section header ===
function Eyebrow({ children }) {
  return <span className="niks-eyebrow-sm">{children}</span>;
}
function SectionHeader({ label, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
      <Eyebrow>{label}</Eyebrow>
      {action && <span className="niks-link">{action}</span>}
    </div>
  );
}

// === Buttons ===
function CTA({ children, icon = 'arrow', onClick, theme = 'day' }) {
  const arrows = {
    arrow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
    check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
    plus:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  };
  return (
    <button onClick={onClick} className="niks-cta" style={{ width: '100%', padding: '14px' }}>
      {icon === 'check' && arrows.check}
      <span>{children}</span>
      {icon === 'arrow' && arrows.arrow}
      {icon === 'plus' && arrows.plus}
    </button>
  );
}
function Outline({ children, onClick }) {
  return (
    <button onClick={onClick} className="niks-cta-outline">
      <span>{children}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </button>
  );
}

// === Ritual card (home) ===
function RitualCard({ period = 'manhã', total = 5, done = 3, onStart }) {
  const complete = done >= total;
  const label = period === 'manhã' ? 'SKINCARE MATINAL' : 'SKINCARE NOTURNO';
  return (
    <div className="niks-card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow>{label}</Eyebrow>
        <span style={{ font: '500 11px/1 var(--niks-ui)', color: 'var(--niks-ink-soft)' }}>{done} / {total}</span>
      </div>
      <h3 className="niks-h3" style={{ margin: '14px 0 4px' }}>
        {complete ? <><span style={{ fontStyle: 'italic' }}>skincare {period === 'manhã' ? 'matinal' : 'noturno'}</span><br/><span style={{ fontStyle: 'normal', color: 'var(--niks-coral)' }}>concluído.</span></>
          : <span style={{ fontStyle: 'italic' }}>{period === 'manhã' ? 'limpeza suave' : 'óleo de limpeza'}</span>}
      </h3>
      <div className="niks-meta">{complete ? `${total} de ${total} passos · até amanhã` : `passo ${done + 1} de ${total} · ~2 min`}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
        {Array.from({ length: total }).map((_, i) =>
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < done ? 'var(--niks-coral)' : 'var(--niks-ink-hair)' }} />)}
      </div>
      <div style={{ marginTop: 16 }}>
        <CTA icon={complete ? 'check' : 'arrow'} onClick={onStart}>{complete ? 'Ver resumo' : 'Começar agora'}</CTA>
      </div>
    </div>
  );
}

// === Scan card ===
function ScanCard({ score, delta, date, tone = 'a' }) {
  const grads = {
    a: 'linear-gradient(135deg, #F0D2C0, #D9A38A 70%, #A87060)',
    b: 'linear-gradient(135deg, #E8B59A, #C58060 70%, #8A4F3D)',
    c: 'linear-gradient(135deg, #EFD7BB, #C49980 60%, #8A6049)',
  };
  return (
    <div style={{ width: 200, flexShrink: 0, background: '#fff', border: '0.5px solid var(--niks-surface-hair)', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--sh-card-soft)' }}>
      <div style={{ height: 200, background: grads[tone], position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.92)', border: '0.5px solid var(--niks-surface-hair)', borderRadius: 14, padding: '6px 11px', display: 'inline-flex', alignItems: 'baseline', gap: 2, font: '400 20px/1 var(--niks-display)', color: 'var(--niks-ink)', letterSpacing: '-0.4px' }}>
          {score}<span style={{ font: 'italic 400 11px/1 var(--niks-display)', color: 'var(--niks-ink-soft)' }}>/100</span>
        </div>
        {delta != null && <div style={{ position: 'absolute', left: 10, bottom: 10, font: 'italic 400 13px/1 var(--niks-display)', color: '#fff', letterSpacing: '0.2px', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{delta > 0 ? '+' : ''}{delta}</div>}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><Eyebrow>SCAN FACIAL</Eyebrow><div style={{ font: 'italic 400 18px/1.1 var(--niks-display)', color: 'var(--niks-ink)', letterSpacing: '-0.36px', marginTop: 4 }}>{date}</div></div>
        <Outline>Ver resultado</Outline>
      </div>
    </div>
  );
}

// === Meal row ===
function MealRow({ name, time, score, tone = 'a' }) {
  const grads = {
    a: 'linear-gradient(135deg, #F4D8B8, #D9A878)',
    b: 'linear-gradient(135deg, #E8C0A0, #C58060)',
    c: 'linear-gradient(135deg, #D8E0B8, #98A878)',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: grads[tone], border: '0.5px solid var(--niks-surface-hair)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '500 14px/1.25 var(--niks-ui)', color: 'var(--niks-ink)', letterSpacing: '-0.07px' }}>{name}</div>
        <div style={{ font: 'italic 400 12px/1 var(--niks-display)', color: 'var(--niks-ink-soft)', marginTop: 4 }}>{time}</div>
      </div>
      <div className="niks-num">{score}<span style={{ font: 'italic 400 12px/1 var(--niks-display)', color: 'var(--niks-ink-soft)' }}>/100</span></div>
    </div>
  );
}

function AddMealRow({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)', cursor: 'pointer' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(251,123,107,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="11" height="11" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="#FB7B6B" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </div>
      <span style={{ font: '500 14px/1 var(--niks-ui)', color: 'var(--niks-coral)', letterSpacing: '-0.07px' }}>Escanear refeição</span>
    </div>
  );
}

Object.assign(window, { Orb, Eyebrow, SectionHeader, CTA, Outline, RitualCard, ScanCard, MealRow, AddMealRow });
