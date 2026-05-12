/* global React */
const { useState, useMemo } = React;

// === Sample data sets — strict schema ===
// Allowed keys only: meal_name, meal_score, meal_label, meal_summary,
// highlights, watch_out, science_note, disclaimer, foods.
const SAMPLES_V2 = {
  pratofeito: {
    meal_name: 'Prato feito com bife, ovo, arroz, feijão, batata frita e salada',
    meal_score: 54,
    meal_label: 'Moderado',
    meal_summary: 'Refeição clássica brasileira — equilibrada em proteína e fibras pela salada e feijão, mas comprometida pelo arroz branco em quantidade alta, batata frita em óleo reaquecido e gordura saturada do bife. Para sua pele com tendência a oleosidade, a carga glicêmica e os óleos oxidados são os pontos críticos.',
    highlights: [
    'O feijão é fonte excelente de fibras solúveis, ferro e magnésio — minerais que sustentam a oxigenação cutânea e o reparo de fibroblastos.',
    'A salada de tomate, cebola e alface entrega licopeno, quercetina e vitamina C, antioxidantes que protegem o colágeno do estresse oxidativo solar.',
    'O ovo aporta colina, biotina e proteína completa — micronutrientes ligados à elasticidade e à barreira lipídica.'],

    watch_out: [
    'O arroz branco em porção generosa tem índice glicêmico elevado, podendo gerar pico de insulina e IGF-1 — gatilho conhecido de acne.',
    'A batata frita combina carga glicêmica alta com óleos vegetais reaquecidos, gerando aldeídos pró-inflamatórios.',
    'A gordura saturada do bife, em frequência alta, eleva citocinas inflamatórias sistêmicas que se manifestam na pele como vermelhidão difusa.'],

    science_note: 'Estudos clínicos mostram que dietas com alta carga glicêmica aumentam em até 87% o risco de acne moderada a severa em adultos jovens — e o efeito é detectável em apenas 12 semanas de mudança alimentar.',
    disclaimer: 'Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional.',
    foods: [
    { name: 'Bife (contrafilé)', impact: 'neutro',
      evidence: 'Fonte de zinco, ferro heme, vitamina B12 e proteína completa — todos relevantes para reparo cutâneo.',
      mechanism: 'O zinco é cofator de metaloproteinases envolvidas na remodelação dérmica; o ferro sustenta oxigenação capilar.',
      relevance_to_skin: 'O benefício existe, mas é parcialmente ofuscado pela gordura saturada quando consumido em frequência alta.',
      substitution: 'Patinho moído magro, peito de frango ou peixe grelhado entregam o mesmo perfil proteico com menos gordura saturada.' },
    { name: 'Ovo frito (gema mole)', impact: 'positivo',
      evidence: 'Proteína completa, colina, biotina, luteína e vitamina D — micronutrientes essenciais para síntese de colágeno.',
      mechanism: 'Aminoácidos essenciais alimentam fibroblastos que produzem colágeno tipo I, sustentando a firmeza dérmica.',
      relevance_to_skin: 'Apoia o reparo da sua pele, especialmente durante a fase de descamação celular noturna.',
      substitution: null },
    { name: 'Arroz branco (porção grande)', impact: 'negativo',
      evidence: 'Carboidrato refinado com índice glicêmico alto (~73), próximo ao da glicose pura quando em porção grande.',
      mechanism: 'Eleva insulina e IGF-1, que estimulam queratinização anômala dos folículos pilosos.',
      relevance_to_skin: 'Para sua tendência à acne na zona T, contribui diretamente para obstrução folicular.',
      substitution: 'Arroz integral, arroz 7 grãos ou quinoa preservam a saciedade com fibra que estabiliza a glicemia.' },
    { name: 'Feijão carioca', impact: 'positivo',
      evidence: 'Rico em fibras solúveis, ferro não-heme, magnésio, folato e proteína vegetal.',
      mechanism: 'A fibra retarda a absorção de glicose, atenuando o pico glicêmico do arroz branco quando consumidos juntos.',
      relevance_to_skin: 'Em peles com tendência inflamatória, o magnésio modula a resposta de cortisol e a sensibilidade.',
      substitution: null },
    { name: 'Batata frita', impact: 'negativo',
      evidence: 'Combina alta carga glicêmica, óleos oxidados e acrilamida (formada na fritura em alta temperatura).',
      mechanism: 'Aldeídos lipídicos ativam NF-κB, via inflamatória central na pele.',
      relevance_to_skin: 'Acentua sensibilidade, vermelhidão difusa e pode agravar quadros de rosácea.',
      substitution: 'Batata-doce assada com azeite no fim do preparo, ou mandioca cozida, preservam o sabor sem oxidar gorduras.' },
    { name: 'Salada de tomate, cebola e alface', impact: 'positivo',
      evidence: 'Combinação rica em licopeno (tomate), quercetina (cebola), vitaminas A, C, K e folato.',
      mechanism: 'O licopeno se acumula na pele e atua como fotoprotetor interno; a quercetina inibe a degranulação de mastócitos.',
      relevance_to_skin: 'Em peles fotótipo III como a sua, reduz o risco de manchas pós-inflamatórias e protege contra danos UV.',
      substitution: null }]

  }
};

// === Impact pill ===
function ImpactPill({ impact }) {
  const cfg = {
    positivo: { bg: '#ECFDF5', fg: '#065F46', label: 'AJUDA' },
    neutro: { bg: '#FFFBEB', fg: '#92400E', label: 'NEUTRO' },
    negativo: { bg: '#FFF5F4', fg: '#991B1B', label: 'PIORA' }
  }[impact];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: cfg.bg, color: cfg.fg,
      borderRadius: 100, padding: '4px 10px',
      font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.2px'
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {cfg.label}
    </span>);

}

// === Score color helper ===
function scoreColor(score) {
  if (score >= 75) return '#34D399';
  if (score >= 50) return '#FACC15';
  return '#EF4444';
}

// === Score ring (SVG) ===
function ScoreRing({ score, size = 86 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - score / 100 * c;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3"
      strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
      style={{ transition: 'stroke-dashoffset .7s ease' }} />
    </svg>);

}

// === Highlight / WatchOut row ===
function HighlightRow({ children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
      <div style={{ width: 24, flexShrink: 0, paddingTop: 3 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9.5" fill="#ECFDF5" stroke="#86EFAC" strokeWidth="0.5" />
          <path d="M6 10.2L8.8 13L14 7.5" stroke="#065F46" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ flex: 1, font: '400 14px/1.5 var(--niks-ui)', color: 'var(--niks-ink)', letterSpacing: '-0.07px' }}>{children}</div>
    </div>);

}
function WatchOutRow({ children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
      <div style={{ width: 24, flexShrink: 0, paddingTop: 3 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9.5" fill="rgba(251,123,107,0.10)" stroke="#FB7B6B" strokeWidth="0.5" />
          <path d="M10 5.5V10.5" stroke="#991B1B" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="13.5" r="0.9" fill="#991B1B" />
        </svg>
      </div>
      <div style={{ flex: 1, font: '400 14px/1.5 var(--niks-ui)', color: 'var(--niks-ink)', letterSpacing: '-0.07px' }}>{children}</div>
    </div>);

}

// === Collapsible section card (matches FoodCard pattern) ===
function CollapsibleSection({ title, count, kind, items, renderRow, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = kind === 'positive'
    ? { bg: '#ECFDF5', border: 'rgba(16,185,129,0.28)', stroke: '#065F46',
        icon: <path d="M5.5 10.2 L9 13.5 L14.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/> }
    : { bg: 'rgba(251,123,107,0.10)', border: 'rgba(251,123,107,0.35)', stroke: '#991B1B',
        icon: <g><path d="M10 5.5 V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="10" cy="13.8" r="1" fill="currentColor"/></g> };
  return (
    <div style={{
      background: '#fff',
      border: '0.5px solid var(--niks-surface-hair)',
      borderRadius: 22,
      boxShadow: 'var(--sh-card-soft)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', background: 'transparent', border: 0, cursor: 'pointer',
          textAlign: 'left',
        }}>
        <span style={{
          width: 34, height: 34, borderRadius: 10,
          background: cfg.bg,
          border: `0.5px solid ${cfg.border}`,
          color: cfg.stroke,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">{cfg.icon}</svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            font: '400 18px/1.2 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.3px',
          }}>{title}</div>
          <div style={{ marginTop: 6, font: '500 10px/1 var(--niks-ui)',
            letterSpacing: '0.4px', color: 'var(--niks-ink-soft)', textTransform: 'uppercase' }}>
            {count} {count === 1 ? 'item' : 'itens'}
          </div>
        </div>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(43,39,36,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .3s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          flexShrink: 0,
        }}>
          <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
            <path d="M1 1l4.5 4.5L10 1" stroke="#2B2724" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 14px' }}>
          {items.map((item, i) => renderRow(item, i))}
        </div>
      )}
    </div>
  );
}

// === Food accordion card ===
function FoodCard({ food, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const swatch = {
    positivo: '#86EFAC',
    neutro: '#FCD34D',
    negativo: '#FCA5A5'
  }[food.impact];

  return (
    <div style={{
      background: '#fff',
      border: '0.5px solid var(--niks-surface-hair)',
      borderRadius: 22,
      boxShadow: 'var(--sh-card-soft)',
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', background: 'transparent', border: 0, cursor: 'pointer',
          textAlign: 'left'
        }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: swatch, flexShrink: 0,
          boxShadow: `0 0 0 4px ${swatch}33`
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            font: 'italic 400 18px/1.2 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.3px'
          }}>{food.name}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
            <ImpactPill impact={food.impact} />
            {food.substitution &&
            <span style={{ font: '500 10px/1 var(--niks-ui)', letterSpacing: '0.4px',
              color: 'var(--niks-coral)', textTransform: 'uppercase' }}>· substituição</span>
            }
          </div>
        </div>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(43,39,36,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .3s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          flexShrink: 0
        }}>
          <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
            <path d="M1 1l4.5 4.5L10 1" stroke="#2B2724" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open &&
      <div style={{ padding: '4px 18px 20px', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
          <FoodSection eyebrow="EVIDÊNCIA">{food.evidence}</FoodSection>
          <FoodSection eyebrow="MECANISMO">{food.mechanism}</FoodSection>
          <FoodSection eyebrow="RELEVÂNCIA PARA SUA PELE">{food.relevance_to_skin}</FoodSection>
          {food.substitution &&
        <div style={{
          marginTop: 14,
          background: 'var(--niks-coral-tint)',
          border: '0.5px solid var(--niks-coral)',
          borderRadius: 14, padding: '14px 16px'
        }}>
              <div style={{ font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
            textTransform: 'uppercase', color: 'var(--niks-coral)',
            display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1 5.5h7M5 2.5l3 3-3 3" stroke="#FB7B6B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 5.5h-7M6 8.5l-3-3 3-3" stroke="#FB7B6B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
                </svg>
                substitua por
              </div>
              <div style={{ marginTop: 10, font: 'italic 400 15px/1.45 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.15px' }}>{food.substitution}</div>
            </div>
        }
        </div>
      }
    </div>);

}

function FoodSection({ eyebrow, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
        textTransform: 'uppercase', color: 'var(--niks-ink-soft)' }}>{eyebrow}</div>
      <div style={{ marginTop: 8, font: '400 13.5px/1.55 var(--niks-ui)',
        color: 'var(--niks-ink)', letterSpacing: '-0.05px' }}>{children}</div>
    </div>);

}

// === Hero with REAL photo ===
function PhotoHero({ photo, data, onBack, onSave }) {
  return (
    <div style={{ position: 'relative', height: 480 }}>
      {/* Photo — cover, slight zoom for editorial framing */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${photo})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 40%'
      }} />
      {/* Subtle warm tint to harmonize with palette */}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(43,28,20,0.0) 30%, rgba(30,18,12,0.45) 65%, rgba(20,12,8,0.88) 100%)' }} />
      {/* Top scrim for status bar legibility */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.42) 0%, transparent 100%)' }} />

      {/* status bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 22px', color: '#fff', font: '600 15px/1 var(--niks-ui)', zIndex: 4 }}>
        <span>9:41</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="1" /><rect x="4.5" y="4" width="3" height="7" rx="1" /><rect x="9" y="2" width="3" height="9" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
          <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5" /><rect x="2" y="2" width="15" height="7" rx="1" fill="currentColor" /><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" /></svg>
        </span>
      </div>

      {/* nav chrome */}
      <div style={{ position: 'absolute', top: 50, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px', zIndex: 5 }}>
        <button onClick={onBack} style={{
          background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '0.5px solid rgba(255,255,255,0.22)',
          width: 38, height: 38, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSave} style={{
            background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            width: 38, height: 38, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </button>
          <button style={{
            background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            width: 38, height: 38, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
          </button>
        </div>
      </div>

      {/* hero content (bottom) — only real fields */}
      <div style={{ position: 'absolute', bottom: 26, left: 22, right: 22, color: '#fff', zIndex: 5 }}>
        <div style={{ font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
          textTransform: 'uppercase', opacity: 0.85 }}>RELATÓRIO DE IMPACTO · 3 MAI · 12:48</div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position: 'relative', width: 86, height: 86, flexShrink: 0 }}>
            <ScoreRing score={data.meal_score} size={86} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ font: '400 32px/1 var(--niks-display)', letterSpacing: '-1px', color: scoreColor(data.meal_score) }}>
                {data.meal_score}
              </span>
              <span style={{ font: 'italic 400 10px/1 var(--niks-display)',
                color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>/100</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '0.5px solid rgba(255,255,255,0.28)',
              padding: '5px 11px', borderRadius: 100,
              font: '600 10px/1 var(--niks-ui)', letterSpacing: '1.2px',
              color: '#fff'
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FB7B6B' }} />
              {data.meal_label.toUpperCase()}
            </div>
            <div style={{ marginTop: 10, font: '400 22px/1.2 var(--niks-display)',
              letterSpacing: '-0.4px', color: '#fff', textWrap: 'pretty' }}>
              {data.meal_name}
            </div>
          </div>
        </div>
      </div>
    </div>);

}

// === The screen ===
function MealResultScreen({ data, photo, onBack, onSave }) {
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--niks-bg)' }}>
      <div className="phone-scroll" style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 110 }}>
        <PhotoHero photo={photo} data={data} onBack={onBack} onSave={onSave} />

        {/* === SUMMARY === */}
        <div style={{ padding: '32px 22px 0' }}>
          <div className="niks-eyebrow-sm">RESUMO</div>
          <p style={{ margin: '14px 0 0', font: '400 14px/1.55 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.1px', textWrap: 'pretty' }}>
            {data.meal_summary}
          </p>
        </div>

        {/* === HIGHLIGHTS === */}
        {data.highlights && data.highlights.length > 0 &&
        <div style={{ padding: '32px 22px 0' }}>
            <CollapsibleSection
              title="Pontos Positivos"
              count={data.highlights.length}
              kind="positive"
              items={data.highlights}
              renderRow={(h, i) => <HighlightRow key={i}>{h}</HighlightRow>}
            />
          </div>
        }

        {/* === WATCH OUT === */}
        {data.watch_out && data.watch_out.length > 0 &&
        <div style={{ padding: '14px 22px 0' }}>
            <CollapsibleSection
              title="Pontos de Atenção"
              count={data.watch_out.length}
              kind="attention"
              items={data.watch_out}
              renderRow={(h, i) => <WatchOutRow key={i}>{h}</WatchOutRow>}
            />
          </div>
        }

        {/* === FOODS === */}
        <div style={{ padding: '36px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div className="niks-eyebrow-sm">ALIMENTOS IDENTIFICADOS</div>
            <span style={{ font: '400 11px/1 var(--niks-ui)', color: 'var(--niks-ink-whisper)' }}>
              {data.foods.length} itens · toque para abrir
            </span>
          </div>
          <h3 style={{ margin: '12px 0 18px', font: 'italic 400 26px/1.1 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.5px' }}>
            cada ingrediente, decifrado.
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.foods.map((f, i) =>
            <FoodCard key={i} food={f} defaultOpen={i === 0} />
            )}
          </div>
        </div>

        {/* === SCIENCE NOTE — editorial pull quote (matches V3) === */}
        {data.science_note &&
        <div style={{ padding: '36px 22px 0' }}>
            <div style={{ padding: '0 6px' }}>
              <div style={{ position: 'relative', padding: '6px 0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                  <span style={{
                    font: 'italic 400 32px/1 var(--niks-display)',
                    color: '#FB7B6B', letterSpacing: '-1px'
                  }}>—</span>
                  <span style={{
                    font: '600 9px/1 var(--niks-ui)', letterSpacing: '2.4px',
                    textTransform: 'uppercase', color: '#FB7B6B'
                  }}>você sabia</span>
                  <span style={{ flex: 1, height: 0.5, background: 'rgba(251,123,107,0.4)' }} />
                </div>
                <p style={{
                  margin: 0,
                  font: 'italic 400 22px/1.35 var(--niks-display)',
                  color: 'var(--niks-ink)', letterSpacing: '-0.5px',
                  textWrap: 'pretty'
                }}>{data.science_note}</p>
              </div>
            </div>
          </div>
        }

        {/* === DISCLAIMER === */}
        {/* spacer to ensure last content clears the floating CTA */}
      </div>

      {/* === FLOATING CTA === */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '24px 22px 28px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 32%, #fff 70%)',
        pointerEvents: 'none', zIndex: 30,
      }}>
        <button onClick={onBack} style={{
          pointerEvents: 'auto',
          width: '100%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'var(--niks-coral)', color: '#fff', border: 0,
          borderRadius: 100, padding: '17px 22px',
          font: '600 15px/1 var(--niks-ui)', letterSpacing: '-0.075px',
          boxShadow: 'var(--sh-cta-coral)', cursor: 'pointer'
        }}>
          <span>Voltar para tela inicial</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
    </div>);

}

Object.assign(window, { MealResultScreen_V2: MealResultScreen, SAMPLES_V2 });