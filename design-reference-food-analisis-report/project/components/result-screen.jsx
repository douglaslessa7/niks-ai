/* global React */
const { useState, useMemo } = React;

// === Score band helpers ===
function scoreBand(score) {
  if (score >= 80) return { label: 'Ótimo', tone: 'good', flourish: 'uma refeição que acolhe.' };
  if (score >= 60) return { label: 'Bom', tone: 'good-mid', flourish: 'um equilíbrio gentil.' };
  if (score >= 40) return { label: 'Moderado', tone: 'mid', flourish: 'há espaço para ajustar.' };
  return { label: 'Atenção', tone: 'bad', flourish: 'sua pele pediria menos.' };
}

// === Sample data sets (for tweak switching) ===
const SAMPLES = {
  otimo: {
    meal_name: 'Salada completa com salmão defumado, ovos cozidos e abacate',
    meal_score: 96,
    meal_summary: 'Esta refeição é excepcionalmente benéfica para a pele, oferecendo uma poderosa combinação de gorduras anti-inflamatórias, antioxidantes e proteínas essenciais para a produção de colágeno e reparo celular.',
    highlights: [
      'Rico em ácidos graxos Ômega-3 (salmão) e gorduras monoinsaturadas (abacate), que combatem a inflamação e fortalecem a barreira da pele.',
      'Excelente fonte de múltiplos antioxidantes (licopeno do tomate, vitaminas A e C do espinafre) que protegem a pele do envelhecimento precoce.',
      'Alta densidade de nutrientes com baixo índice glicêmico, ideal para evitar picos de insulina que podem agravar a acne.'
    ],
    watch_out: [
      'O salmão defumado e o queijo cottage podem ter um teor de sódio elevado, que em excesso pode contribuir para a retenção de líquidos e inchaço facial temporário.',
      'Para pessoas com sensibilidade, os laticínios (queijo cottage) podem ser um gatilho para acne inflamatória.'
    ],
    science_note: 'O licopeno do tomate, quando consumido regularmente, acumula-se na pele e atua como um protetor solar interno, ajudando a neutralizar os danos dos radicais livres causados pela exposição UV.',
    disclaimer: 'Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional.',
    foods: [
      { name: 'Salmão defumado', impact: 'positivo',
        evidence: 'Rico em ácidos graxos ômega-3 (EPA e DHA), que possuem fortes propriedades anti-inflamatórias e são vitais para a saúde da membrana celular.',
        mechanism: 'O ômega-3 modula a produção de mediadores inflamatórios, reduzindo a inflamação sistêmica que pode se manifestar na pele como acne ou vermelhidão.',
        relevance_to_skin: 'Ajuda a fortalecer a barreira de hidratação da sua pele mista, diminuir a inflamação e proteger contra danos UV.',
        substitution: null },
      { name: 'Abacate (½ unidade)', impact: 'positivo',
        evidence: 'Fonte densa de vitamina E, gorduras monoinsaturadas e biotina, todas associadas à integridade da pele.',
        mechanism: 'A vitamina E age como antioxidante lipossolúvel, protegendo as membranas celulares contra peroxidação lipídica.',
        relevance_to_skin: 'Para sua pele com tendência à desidratação periocular, sustenta a barreira lipídica e a maciez.',
        substitution: null },
      { name: 'Ovos cozidos (gema mole)', impact: 'positivo',
        evidence: 'Proteína completa, colina, biotina e luteína — micronutrientes diretamente ligados à síntese de colágeno e proteção retiniana e cutânea.',
        mechanism: 'Os aminoácidos essenciais alimentam fibroblastos que produzem colágeno tipo I, sustentando a firmeza dérmica.',
        relevance_to_skin: 'Apoia o reparo noturno da sua pele, especialmente durante a fase de descamação celular.',
        substitution: null },
      { name: 'Tomate-cereja', impact: 'positivo',
        evidence: 'Concentra licopeno, um carotenoide com forte ação antioxidante, melhor absorvido com gorduras (presentes no abacate).',
        mechanism: 'O licopeno neutraliza radicais livres induzidos por UV, atuando como fotoproteção interna complementar.',
        relevance_to_skin: 'Em peles fotótipo III como a sua, reduz o risco de manchas pós-inflamatórias.',
        substitution: null },
      { name: 'Queijo cottage', impact: 'neutro',
        evidence: 'Boa fonte de proteína (caseína) e selênio, um mineral com propriedades antioxidantes.',
        mechanism: 'A proteína suporta o reparo da pele, mas laticínios podem aumentar os níveis de IGF-1 em algumas pessoas, potencialmente agravando a acne.',
        relevance_to_skin: 'Para indivíduos predispostos à acne hormonal, o aumento do IGF-1 pode estimular a produção de sebo.',
        substitution: 'Para indivíduos sensíveis a laticínios, homus ou tofu amassado seriam ótimas alternativas ricas em proteína.' },
    ],
  },
  bom: {
    meal_name: 'Iogurte natural com granola caseira e mirtilo',
    meal_score: 72,
    meal_summary: 'Refeição equilibrada com bons antioxidantes e proteína, mas o açúcar adicionado da granola e o laticínio reduzem um pouco o impacto cutâneo.',
    highlights: [
      'Mirtilo é uma das maiores fontes de antocianinas, antioxidantes que protegem o colágeno do estresse oxidativo.',
      'Aveia integral da granola fornece beta-glucana, fibra que estabiliza a glicemia.',
    ],
    watch_out: [
      'Granolas industrializadas frequentemente contêm açúcares adicionados, que aceleram a glicação do colágeno.',
      'Iogurte é um laticínio — em peles com acne hormonal, pode ser um gatilho moderado.',
    ],
    science_note: 'A glicação — quando moléculas de açúcar se ligam ao colágeno — é uma das principais causas de envelhecimento dérmico, e começa a acontecer em picos glicêmicos rotineiros.',
    disclaimer: 'Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional.',
    foods: [
      { name: 'Mirtilos frescos', impact: 'positivo',
        evidence: 'Densidade altíssima de antocianinas, polifenóis com ação antioxidante e anti-inflamatória.',
        mechanism: 'Antocianinas inibem a peroxidação lipídica e modulam vias inflamatórias na derme.',
        relevance_to_skin: 'Excelente para sua pele com leve hiperpigmentação — protege contra danos oxidativos solares.',
        substitution: null },
      { name: 'Iogurte natural integral', impact: 'neutro',
        evidence: 'Probióticos podem beneficiar o microbioma intestinal e, indiretamente, o cutâneo.',
        mechanism: 'Mas a caseína A1 e o IGF-1 do leite estão ligados a flares acneicos em pessoas predispostas.',
        relevance_to_skin: 'Para sua pele mista com tendência a comedões, observe se há piora 24-48h após consumo.',
        substitution: 'Iogurte de coco ou kefir de cabra mantêm os probióticos com menor impacto hormonal.' },
      { name: 'Granola com mel', impact: 'negativo',
        evidence: 'Açúcares simples e óleos refinados contribuem para picos glicêmicos e inflamação.',
        mechanism: 'A glicação não-enzimática endurece fibras de colágeno (AGEs), reduzindo elasticidade.',
        relevance_to_skin: 'Em uso frequente, acelera o envelhecimento cutâneo visível ao redor dos olhos e da boca.',
        substitution: 'Aveia in natura tostada com canela e cacau nibs preserva a textura sem o açúcar adicional.' },
    ],
  },
  moderado: {
    meal_name: 'Hambúrguer artesanal com batata frita e refrigerante',
    meal_score: 48,
    meal_summary: 'Refeição com alto teor calórico, gorduras saturadas e índice glicêmico elevado — combinação que pressiona vias inflamatórias na pele.',
    highlights: [
      'A carne bovina contém zinco e ferro heme, importantes para a cicatrização cutânea.',
    ],
    watch_out: [
      'A combinação batata frita + pão branco + refrigerante gera um pico glicêmico prolongado.',
      'Óleos vegetais reaquecidos da fritura produzem aldeídos pró-inflamatórios.',
      'Refrigerantes açucarados aumentam IGF-1 e estimulam glândulas sebáceas.',
    ],
    science_note: 'Estudos clínicos mostram que dietas com alta carga glicêmica aumentam em até 87% o risco de acne moderada a severa em adultos jovens.',
    disclaimer: 'Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional.',
    foods: [
      { name: 'Carne bovina (180g)', impact: 'neutro',
        evidence: 'Fonte de zinco, ferro heme e proteína completa — todos relevantes para reparo tecidual.',
        mechanism: 'Zinco é cofator de metaloproteinases envolvidas na regeneração da derme.',
        relevance_to_skin: 'O benefício existe, mas é ofuscado pela gordura saturada em quantidade alta.',
        substitution: 'Patinho moído magro ou peito de frango grelhado entregam o mesmo perfil proteico com menos gordura saturada.' },
      { name: 'Pão branco (brioche)', impact: 'negativo',
        evidence: 'Farinha refinada com IG ~85, próximo ao do açúcar puro.',
        mechanism: 'Eleva insulina e IGF-1, que estimulam queratinização anômala dos folículos.',
        relevance_to_skin: 'Para sua tendência à acne na zona T, contribui para obstrução folicular.',
        substitution: 'Pão integral 100% ou wrap de couve mantêm a estrutura sem o pico glicêmico.' },
      { name: 'Batata frita', impact: 'negativo',
        evidence: 'Combina alta carga glicêmica, óleos oxidados e acrilamida (formada na fritura).',
        mechanism: 'Aldeídos lipídicos ativam NF-κB, via inflamatória central na pele.',
        relevance_to_skin: 'Acentua sensibilidade e vermelhidão difusa.',
        substitution: 'Batata-doce assada com azeite no fim do preparo preserva o sabor sem oxidar gorduras.' },
      { name: 'Refrigerante (350ml)', impact: 'negativo',
        evidence: 'Cerca de 37g de açúcar simples — equivalente a 9 colheres de chá.',
        mechanism: 'Pico glicêmico massivo dispara cascata IGF-1 → andrógenos → sebo.',
        relevance_to_skin: 'Um dos gatilhos mais consistentes para flares acneicos em peles oleosas.',
        substitution: 'Água com gás e limão, ou kombucha sem açúcar adicionado, hidratam sem o impacto hormonal.' },
    ],
  },
  atencao: {
    meal_name: 'Pão doce recheado, café com leite condensado e bacon',
    meal_score: 28,
    meal_summary: 'Combinação intensa de açúcar refinado, laticínios processados e gorduras saturadas — perfil claramente pró-inflamatório para a pele.',
    highlights: [],
    watch_out: [
      'Açúcar refinado em alta quantidade promove glicação acelerada do colágeno.',
      'Leite condensado concentra IGF-1 e açúcar — pode disparar acne hormonal em até 48h.',
      'Bacon adicional traz nitritos e gordura saturada, ambos associados à inflamação cutânea.',
    ],
    science_note: 'Refeições com esse perfil podem aumentar marcadores inflamatórios sistêmicos em até 120% por até 6 horas após o consumo, segundo estudos de cronobiologia metabólica.',
    disclaimer: 'Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional.',
    foods: [
      { name: 'Pão doce recheado', impact: 'negativo',
        evidence: 'Farinha branca + açúcar + gordura hidrogenada — combinação tripla pró-inflamatória.',
        mechanism: 'Picos sequenciais de insulina mantêm IGF-1 elevado por horas.',
        relevance_to_skin: 'Em peles acneicas, é dos principais gatilhos identificáveis.',
        substitution: 'Pão integral com pasta de amendoim natural e banana entrega doçura com fibra e gordura boa.' },
      { name: 'Leite condensado', impact: 'negativo',
        evidence: 'Concentração de açúcar (~55%) e proteínas lácteas em forma altamente bioativa.',
        mechanism: 'IGF-1 elevado estimula receptores androgênicos das glândulas sebáceas.',
        relevance_to_skin: 'Conexão clara com flares de acne hormonal na linha mandibular.',
        substitution: 'Leite de coco reduzido com tâmara batida oferece doçura cremosa sem o pico hormonal.' },
      { name: 'Bacon', impact: 'negativo',
        evidence: 'Processado com nitritos e nitratos, e altamente rico em gordura saturada.',
        mechanism: 'Nitritos formam compostos nitrosos pró-oxidantes; gordura saturada eleva citocinas inflamatórias.',
        relevance_to_skin: 'Acentua vermelhidão e pode agravar rosácea em peles sensíveis.',
        substitution: 'Peito de peru defumado artesanal ou cogumelos shimeji salteados oferecem o umami sem nitritos.' },
    ],
  },
};

// === Impact pill ===
function ImpactPill({ impact }) {
  const cfg = {
    positivo: { bg: '#ECFDF5', fg: '#065F46', label: 'AJUDA' },
    neutro:   { bg: '#FFFBEB', fg: '#92400E', label: 'NEUTRO' },
    negativo: { bg: '#FFF5F4', fg: '#991B1B', label: 'PIORA' },
  }[impact];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: cfg.bg, color: cfg.fg,
      borderRadius: 100, padding: '4px 10px',
      font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.2px',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {cfg.label}
    </span>
  );
}

// === Score ring (SVG) ===
function ScoreRing({ score, size = 86 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#FB7B6B" strokeWidth="3"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .7s ease' }} />
    </svg>
  );
}

// === Meal hero illustration (placeholder gradient art per band) ===
function MealHero({ tone }) {
  // Warm artistic plating illustration — keeps premium feel without real photo
  const palettes = {
    good: ['#E8C094', '#C8855E', '#7E4730', '#3A2418'],
    'good-mid': ['#E8B89E', '#B97455', '#6E3F2A', '#2E1B12'],
    mid: ['#D4A075', '#A66442', '#5C341E', '#251812'],
    bad: ['#B07A5C', '#724432', '#3D2018', '#1A0E0A'],
  };
  const p = palettes[tone] || palettes.good;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* base wash */}
      <div style={{ position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 30% 20%, ${p[0]} 0%, ${p[1]} 35%, ${p[2]} 70%, ${p[3]} 100%)` }} />
      {/* plate ring */}
      <div style={{ position: 'absolute', left: '-15%', top: '32%', width: '130%', height: '85%',
        borderRadius: '50%',
        background: `radial-gradient(ellipse at 50% 30%, rgba(255,235,210,0.18) 0%, rgba(255,235,210,0.06) 40%, transparent 70%)`,
        filter: 'blur(2px)' }} />
      {/* food blobs */}
      <div style={{ position: 'absolute', left: '14%', top: '52%', width: 120, height: 90, borderRadius: '50%',
        background: `radial-gradient(ellipse at 35% 35%, ${p[0]}, ${p[2]} 80%)`,
        filter: 'blur(3px)', opacity: 0.85 }} />
      <div style={{ position: 'absolute', right: '12%', top: '46%', width: 140, height: 110, borderRadius: '52% 48% 60% 40%',
        background: `radial-gradient(ellipse at 40% 35%, #F7D7B3, ${p[1]} 70%, ${p[2]})`,
        filter: 'blur(2.5px)', opacity: 0.9 }} />
      <div style={{ position: 'absolute', left: '38%', top: '64%', width: 100, height: 80, borderRadius: '48% 52% 38% 62%',
        background: `radial-gradient(ellipse at 50% 30%, #D9E8C0, #6B8550 70%)`,
        filter: 'blur(2px)', opacity: 0.78 }} />
      {/* bottom dark overlay */}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 0%, transparent 35%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.78) 100%)' }} />
      {/* top subtle darken for status bar legibility */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 100%)' }} />
    </div>
  );
}

// === Highlight / WatchOut item ===
function HighlightRow({ children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
      <div style={{ width: 24, flexShrink: 0, paddingTop: 3 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9.5" fill="#ECFDF5" stroke="#86EFAC" strokeWidth="0.5"/>
          <path d="M6 10.2L8.8 13L14 7.5" stroke="#065F46" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ flex: 1, font: '400 14px/1.5 var(--niks-ui)', color: 'var(--niks-ink)', letterSpacing: '-0.07px' }}>{children}</div>
    </div>
  );
}
function WatchOutRow({ children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
      <div style={{ width: 24, flexShrink: 0, paddingTop: 3 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9.5" fill="rgba(251,123,107,0.10)" stroke="#FB7B6B" strokeWidth="0.5"/>
          <path d="M10 5.5V10.5" stroke="#991B1B" strokeWidth="1.6" strokeLinecap="round"/>
          <circle cx="10" cy="13.5" r="0.9" fill="#991B1B"/>
        </svg>
      </div>
      <div style={{ flex: 1, font: '400 14px/1.5 var(--niks-ui)', color: 'var(--niks-ink)', letterSpacing: '-0.07px' }}>{children}</div>
    </div>
  );
}

// === Food accordion card ===
function FoodCard({ food, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const swatch = {
    positivo: '#86EFAC',
    neutro:   '#FCD34D',
    negativo: '#FCA5A5',
  }[food.impact];

  return (
    <div style={{
      background: '#fff',
      border: '0.5px solid var(--niks-surface-hair)',
      borderRadius: 22,
      boxShadow: 'var(--sh-card-soft)',
      overflow: 'hidden',
    }}>
      {/* header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', background: 'transparent', border: 0, cursor: 'pointer',
          textAlign: 'left',
        }}>
        {/* impact dot */}
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: swatch, flexShrink: 0,
          boxShadow: `0 0 0 4px ${swatch}33`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            font: 'italic 400 18px/1.2 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.3px',
          }}>{food.name}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
            <ImpactPill impact={food.impact} />
            {food.substitution && (
              <span style={{ font: '500 10px/1 var(--niks-ui)', letterSpacing: '0.4px',
                color: 'var(--niks-coral)', textTransform: 'uppercase' }}>· substituição</span>
            )}
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

      {/* expanded body */}
      {open && (
        <div style={{ padding: '4px 18px 20px', borderTop: '0.5px solid var(--niks-ink-hair)' }}>
          <FoodSection eyebrow="EVIDÊNCIA">{food.evidence}</FoodSection>
          <FoodSection eyebrow="MECANISMO">{food.mechanism}</FoodSection>
          <FoodSection eyebrow="RELEVÂNCIA PARA SUA PELE">{food.relevance_to_skin}</FoodSection>
          {food.substitution && (
            <div style={{
              marginTop: 14,
              background: 'var(--niks-coral-tint)',
              border: '0.5px solid var(--niks-coral)',
              borderRadius: 14, padding: '14px 16px',
            }}>
              <div style={{ font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
                textTransform: 'uppercase', color: 'var(--niks-coral)',
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1 5.5h7M5 2.5l3 3-3 3" stroke="#FB7B6B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 5.5h-7M6 8.5l-3-3 3-3" stroke="#FB7B6B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
                </svg>
                substitua por
              </div>
              <div style={{ marginTop: 10, font: 'italic 400 15px/1.45 var(--niks-display)',
                color: 'var(--niks-ink)', letterSpacing: '-0.15px' }}>{food.substitution}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FoodSection({ eyebrow, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
        textTransform: 'uppercase', color: 'var(--niks-ink-soft)' }}>{eyebrow}</div>
      <div style={{ marginTop: 8, font: '400 13.5px/1.55 var(--niks-ui)',
        color: 'var(--niks-ink)', letterSpacing: '-0.05px' }}>{children}</div>
    </div>
  );
}

// === The screen ===
function MealResultScreen({ data, onBack, onSave }) {
  const band = scoreBand(data.meal_score);
  const positiveCount = data.foods.filter(f => f.impact === 'positivo').length;
  const neutralCount = data.foods.filter(f => f.impact === 'neutro').length;
  const negativeCount = data.foods.filter(f => f.impact === 'negativo').length;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--niks-bg)' }}>
      <div className="phone-scroll" style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {/* === HERO === */}
        <div style={{ position: 'relative', height: 460 }}>
          <MealHero tone={band.tone} />

          {/* status bar area */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0 22px', color: '#fff', font: '600 15px/1 var(--niks-ui)' }}>
            <span>9:41</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="1"/><rect x="4.5" y="4" width="3" height="7" rx="1"/><rect x="9" y="2" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
              <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5"/><rect x="2" y="2" width="15" height="7" rx="1" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor"/></svg>
            </span>
          </div>

          {/* back & menu chrome */}
          <div style={{ position: 'absolute', top: 50, left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px', zIndex: 5 }}>
            <button onClick={onBack} style={{
              background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(255,255,255,0.18)',
              width: 38, height: 38, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onSave} style={{
                background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)',
                border: '0.5px solid rgba(255,255,255,0.18)',
                width: 38, height: 38, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button style={{
                background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)',
                border: '0.5px solid rgba(255,255,255,0.18)',
                width: 38, height: 38, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
              </button>
            </div>
          </div>

          {/* hero content (bottom) */}
          <div style={{ position: 'absolute', bottom: 24, left: 22, right: 22, color: '#fff', zIndex: 5 }}>
            <div style={{ font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
              textTransform: 'uppercase', opacity: 0.85 }}>RELATÓRIO DE IMPACTO · 3 MAI · 12:48</div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 18 }}>
              {/* score ring */}
              <div style={{ position: 'relative', width: 86, height: 86, flexShrink: 0 }}>
                <ScoreRing score={data.meal_score} size={86} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex',
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ font: '400 32px/1 var(--niks-display)', color: '#FB7B6B', letterSpacing: '-1px' }}>
                    {data.meal_score}
                  </span>
                  <span style={{ font: 'italic 400 10px/1 var(--niks-display)',
                    color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>/100</span>
                </div>
              </div>
              <div style={{ flex: 1, paddingBottom: 4 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(10px)',
                  border: '0.5px solid rgba(255,255,255,0.25)',
                  padding: '4px 10px', borderRadius: 100,
                  font: '600 10px/1 var(--niks-ui)', letterSpacing: '1.2px',
                  color: '#fff',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FB7B6B' }} />
                  {band.label.toUpperCase()}
                </div>
                <div style={{ marginTop: 10, font: 'italic 400 26px/1.1 var(--niks-display)',
                  letterSpacing: '-0.6px' }}>{band.flourish}</div>
              </div>
            </div>

            <div style={{ marginTop: 20, font: '400 14px/1.45 var(--niks-ui)',
              color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.07px',
              textWrap: 'pretty', maxWidth: '95%' }}>
              {data.meal_name}
            </div>
          </div>
        </div>

        {/* === SUMMARY === */}
        <div style={{ padding: '32px 22px 0' }}>
          <div className="niks-eyebrow-sm">RESUMO</div>
          <p style={{ margin: '14px 0 0', font: '400 17px/1.5 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.2px', textWrap: 'pretty' }}>
            {data.meal_summary}
          </p>

          {/* impact tally */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8, padding: '14px 0', borderTop: '0.5px solid var(--niks-ink-hair)',
            borderBottom: '0.5px solid var(--niks-ink-hair)' }}>
            <TallyItem n={positiveCount} label="ajudam" color="#065F46" dot="#86EFAC" />
            <TallyItem n={neutralCount} label="neutros" color="#92400E" dot="#FCD34D" />
            <TallyItem n={negativeCount} label="pioram" color="#991B1B" dot="#FCA5A5" />
          </div>
        </div>

        {/* === HIGHLIGHTS === */}
        {data.highlights.length > 0 && (
          <div style={{ padding: '32px 22px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="niks-eyebrow-sm">PONTOS POSITIVOS</span>
              <span style={{ flex: 1, height: 0.5, background: 'var(--niks-ink-hair)' }} />
              <span style={{ font: '400 11px/1 var(--niks-ui)', color: 'var(--niks-ink-whisper)' }}>
                {data.highlights.length}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              {data.highlights.map((h, i) => <HighlightRow key={i}>{h}</HighlightRow>)}
            </div>
          </div>
        )}

        {/* === WATCH OUT === */}
        {data.watch_out.length > 0 && (
          <div style={{ padding: '32px 22px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="niks-eyebrow-sm">PONTOS DE ATENÇÃO</span>
              <span style={{ flex: 1, height: 0.5, background: 'var(--niks-ink-hair)' }} />
              <span style={{ font: '400 11px/1 var(--niks-ui)', color: 'var(--niks-ink-whisper)' }}>
                {data.watch_out.length}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              {data.watch_out.map((h, i) => <WatchOutRow key={i}>{h}</WatchOutRow>)}
            </div>
          </div>
        )}

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
            {data.foods.map((f, i) => (
              <FoodCard key={i} food={f} defaultOpen={i === 0} />
            ))}
          </div>
        </div>

        {/* === SCIENCE NOTE === */}
        <div style={{ padding: '36px 22px 0' }}>
          <div style={{
            position: 'relative',
            background: 'var(--niks-coral-tint)',
            border: '0.5px solid var(--niks-coral)',
            borderRadius: 24, padding: '24px 22px 26px',
            overflow: 'hidden',
          }}>
            {/* decorative orb */}
            <div style={{ position: 'absolute', right: -40, top: -40, width: 120, height: 120,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #FFEFE4 0%, #F9C9B6 30%, #E89178 70%, #C86651 100%)',
              opacity: 0.55, filter: 'blur(2px)' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
                textTransform: 'uppercase', color: 'var(--niks-coral)' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="2.5" fill="#FB7B6B"/>
                  <circle cx="6" cy="6" r="5.2" stroke="#FB7B6B" strokeWidth="0.6" strokeDasharray="1 1.6"/>
                </svg>
                você sabia?
              </div>
              <div style={{ marginTop: 14, font: 'italic 400 22px/1.3 var(--niks-display)',
                color: 'var(--niks-ink)', letterSpacing: '-0.4px', textWrap: 'pretty' }}>
                {data.science_note}
              </div>
            </div>
          </div>
        </div>

        {/* === DISCLAIMER === */}
        <div style={{ padding: '28px 22px 8px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '14px 16px', background: 'rgba(43,39,36,0.03)',
            borderRadius: 14 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="7" cy="7" r="6" fill="none" stroke="rgba(43,39,36,0.35)" strokeWidth="1"/>
              <path d="M7 4v3.2M7 9.4v.4" stroke="rgba(43,39,36,0.55)" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <div style={{ font: '400 11.5px/1.5 var(--niks-ui)', color: 'var(--niks-ink-soft)',
              letterSpacing: '0.05px' }}>{data.disclaimer}</div>
          </div>
        </div>

        {/* === CTA === */}
        <div style={{ padding: '20px 22px 44px' }}>
          <button onClick={onBack} style={{
            width: '100%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'var(--niks-coral)', color: '#fff', border: 0,
            borderRadius: 100, padding: '17px 22px',
            font: '600 15px/1 var(--niks-ui)', letterSpacing: '-0.075px',
            boxShadow: 'var(--sh-cta-coral)', cursor: 'pointer',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <span>Voltar para tela inicial</span>
          </button>

          <button style={{
            width: '100%', marginTop: 12,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'transparent', color: 'var(--niks-coral)',
            border: '0.5px solid var(--niks-coral)',
            borderRadius: 100, padding: '14px 22px',
            font: '600 13px/1 var(--niks-ui)', letterSpacing: '-0.075px', cursor: 'pointer',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M9 9h6v6H9z"/></svg>
            <span>Escanear próxima refeição</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TallyItem({ n, label, color, dot }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, alignSelf: 'center' }} />
        <span style={{ font: '400 26px/1 var(--niks-display)', color, letterSpacing: '-0.5px' }}>{n}</span>
      </div>
      <span style={{ font: '500 11px/1 var(--niks-ui)', letterSpacing: '0.5px',
        textTransform: 'uppercase', color: 'var(--niks-ink-soft)' }}>{label}</span>
    </div>
  );
}

Object.assign(window, { MealResultScreen, SAMPLES });
