/* global React */
const { useState, useRef, useEffect } = React;

// ─────────────────────────────────────────────
// SAMPLE — exact schema, mirroring the photo.
// (The photo is "prato feito"; we tell the truth.)
// ─────────────────────────────────────────────
const SAMPLE_V3 = {
  meal_name: "Prato feito com bife, ovo, arroz, feijão, batata frita e salada",
  meal_score: 54,
  meal_label: "Moderado",
  meal_summary:
    "Refeição equilibrada em proteína e fibras pelo feijão e a salada, mas o arroz branco em porção alta, a batata frita e a gordura saturada do bife pressionam vias inflamatórias na pele.",
  highlights: [
    "O feijão entrega fibra solúvel, ferro e magnésio — minerais que sustentam oxigenação cutânea e reparo de fibroblastos.",
    "A salada de tomate, cebola e alface aporta licopeno, quercetina e vitamina C, antioxidantes que protegem o colágeno do estresse oxidativo solar.",
    "O ovo com gema mole concentra colina, biotina e proteína completa — micronutrientes ligados à elasticidade da pele.",
  ],
  watch_out: [
    "Arroz branco em porção generosa eleva insulina e IGF-1, gatilho clássico de acne em peles oleosas.",
    "A fritura combina alta carga glicêmica com óleos reaquecidos, gerando aldeídos pró-inflamatórios.",
    "A gordura saturada do bife, em frequência alta, eleva citocinas inflamatórias que se manifestam como vermelhidão difusa.",
  ],
  science_note:
    "Dietas com alta carga glicêmica aumentam em até 87% o risco de acne moderada a severa em adultos jovens — efeito detectável já em 12 semanas de mudança alimentar.",
  disclaimer: "Esta é uma análise nutricional por IA, não um diagnóstico médico ou nutricional.",
  foods: [
    {
      name: "Bife (contrafilé grelhado)",
      impact: "neutro",
      evidence:
        "Fonte de zinco, ferro heme, vitamina B12 e proteína completa — todos relevantes para reparo cutâneo.",
      mechanism:
        "O zinco é cofator de metaloproteinases envolvidas na remodelação dérmica; o ferro sustenta oxigenação capilar.",
      relevance_to_skin:
        "O benefício existe, mas é parcialmente ofuscado pela gordura saturada quando consumido em frequência alta.",
      substitution:
        "Patinho moído magro, peito de frango grelhado ou peixe entregam o mesmo perfil proteico com menos gordura saturada.",
    },
    {
      name: "Ovo frito com gema mole",
      impact: "positivo",
      evidence:
        "Proteína completa, colina, biotina, luteína e vitamina D — micronutrientes essenciais à síntese de colágeno.",
      mechanism:
        "Aminoácidos essenciais alimentam fibroblastos que produzem colágeno tipo I, sustentando a firmeza dérmica.",
      relevance_to_skin:
        "Apoia o reparo da sua pele durante a fase de renovação celular noturna.",
      substitution: null,
    },
    {
      name: "Arroz branco (porção grande)",
      impact: "negativo",
      evidence:
        "Carboidrato refinado com índice glicêmico alto (~73), próximo ao da glicose pura quando em porção grande.",
      mechanism:
        "Eleva insulina e IGF-1, que estimulam queratinização anômala dos folículos pilosos.",
      relevance_to_skin:
        "Para sua tendência à acne na zona T, contribui diretamente para obstrução folicular.",
      substitution:
        "Arroz integral, arroz 7 grãos ou quinoa preservam saciedade com fibra que estabiliza a glicemia.",
    },
    {
      name: "Feijão carioca",
      impact: "positivo",
      evidence:
        "Rico em fibras solúveis, ferro não-heme, magnésio, folato e proteína vegetal.",
      mechanism:
        "A fibra retarda a absorção de glicose, atenuando o pico glicêmico do arroz quando consumidos juntos.",
      relevance_to_skin:
        "Em peles de tendência inflamatória, o magnésio modula a resposta de cortisol e a sensibilidade.",
      substitution: null,
    },
    {
      name: "Batata frita",
      impact: "negativo",
      evidence:
        "Combina alta carga glicêmica, óleos oxidados e acrilamida — formada na fritura em alta temperatura.",
      mechanism: "Aldeídos lipídicos ativam NF-κB, via inflamatória central na pele.",
      relevance_to_skin: "Acentua sensibilidade, vermelhidão difusa e pode agravar quadros de rosácea.",
      substitution:
        "Batata-doce assada com azeite no fim do preparo, ou mandioca cozida, preservam o sabor sem oxidar gorduras.",
    },
    {
      name: "Salada de tomate, cebola e alface",
      impact: "positivo",
      evidence:
        "Combinação rica em licopeno (tomate), quercetina (cebola), vitaminas A, C, K e folato.",
      mechanism:
        "O licopeno acumula-se na pele e atua como fotoprotetor interno; a quercetina inibe degranulação de mastócitos.",
      relevance_to_skin:
        "Em peles fotótipo III como a sua, reduz o risco de manchas pós-inflamatórias e protege contra danos UV.",
      substitution: null,
    },
  ],
};

// ─────────────────────────────────────────────
// Tokens for impact (small, restrained palette)
// ─────────────────────────────────────────────
const IMPACT = {
  positivo: { dot: '#4CAF50', soft: 'rgba(76,175,80,0.10)', word: 'ajuda',  letterspacing: '0.4px' },
  neutro:   { dot: '#C8B068', soft: 'rgba(200,176,104,0.10)', word: 'neutro', letterspacing: '0.4px' },
  negativo: { dot: '#FB7B6B', soft: 'rgba(251,123,107,0.10)', word: 'piora',  letterspacing: '0.4px' },
};

// ─────────────────────────────────────────────
// Score arc — thin, premium, lots of negative space
// ─────────────────────────────────────────────
function ScoreArc({ score, size = 240, stroke = 2.5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(43,39,36,0.08)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#FB7B6B" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)' }} />
    </svg>
  );
}

// ─────────────────────────────────────────────
// Hero — the meal as an *orb*, not a banner
// ─────────────────────────────────────────────
function MealOrbHero({ photo, score, label, name }) {
  // Mounted-state count-up for the score
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf, start;
    const dur = 900;
    const tick = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / dur);
      // ease out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * score));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div style={{
      padding: '12px 28px 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'relative',
    }}>
      {/* Soft warm halo behind orb */}
      <div style={{
        position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(251,123,107,0.10) 0%, rgba(251,123,107,0.04) 35%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Score arc + photo orb */}
      <div style={{ position: 'relative', width: 240, height: 240, marginTop: 4 }}>
        <ScoreArc score={score} size={240} />
        {/* Photo medallion */}
        <div style={{
          position: 'absolute', inset: 18, borderRadius: '50%',
          backgroundImage: `url(${photo})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          boxShadow: '0 24px 48px rgba(43,39,36,0.18), inset 0 0 0 0.5px rgba(43,39,36,0.06)',
        }}>
          {/* Inner top-light highlight, like the orb component */}
          <div style={{
            position: 'absolute', top: '8%', left: '18%', width: '38%', height: '22%',
            borderRadius: '50%', filter: 'blur(2px)',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.32) 0%, transparent 70%)',
          }} />
        </div>
        {/* Score start tick */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', width: 6, height: 6, borderRadius: '50%',
          transform: 'translate(-50%, -50%)', background: '#FB7B6B',
          boxShadow: '0 0 0 4px rgba(251,123,107,0.18)',
        }} />
      </div>

      {/* Label pill */}
      <div style={{ marginTop: 26 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px',
          background: 'rgba(251,123,107,0.10)',
          border: '0.5px solid rgba(251,123,107,0.5)',
          borderRadius: 100,
          font: '600 10px/1 var(--niks-ui)', letterSpacing: '2.4px',
          textTransform: 'uppercase', color: '#FB7B6B',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FB7B6B' }} />
          {label}
        </span>
      </div>

      {/* GIANT score number — italic serif, the title of the page */}
      <div style={{
        marginTop: 16, position: 'relative',
        display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0,
      }}>
        <span style={{
          font: '400 96px/1 var(--niks-display)',
          color: 'var(--niks-ink)',
          letterSpacing: '-3.2px',
          fontVariantNumeric: 'lining-nums tabular-nums',
        }}>{n}</span>
        <span style={{
          font: 'italic 400 28px/1 var(--niks-display)',
          color: 'var(--niks-ink-whisper)',
          letterSpacing: '-0.5px',
          marginLeft: 4, marginBottom: 12,
        }}>/100</span>
      </div>

      {/* Meal name — lowercase italic, editorial caption */}
      <div style={{
        marginTop: 14, maxWidth: 290, textAlign: 'center',
        font: 'italic 400 16px/1.45 var(--niks-display)',
        color: 'var(--niks-ink-soft)',
        letterSpacing: '-0.15px',
        textWrap: 'balance',
      }}>
        {(name || '').toLowerCase()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Section eyebrow — paired with a hairline rule
// ─────────────────────────────────────────────
function Eyebrow({ children, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <span style={{
        font: '600 9px/1 var(--niks-ui)', letterSpacing: '2.4px',
        textTransform: 'uppercase', color: 'var(--niks-ink-soft)',
      }}>{children}</span>
      <span style={{ flex: 1, height: 0.5, background: 'rgba(43,39,36,0.12)' }} />
      {count != null && (
        <span style={{
          font: 'italic 400 13px/1 var(--niks-display)',
          color: 'var(--niks-ink-whisper)',
          letterSpacing: '-0.1px',
        }}>{String(count).padStart(2, '0')}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Highlight / watch-out — numbered editorial list
// ─────────────────────────────────────────────
function NumberedList({ items, accent }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 14, alignItems: 'flex-start' }}>
          <span style={{
            font: 'italic 400 22px/1 var(--niks-display)',
            color: accent, letterSpacing: '-0.4px',
            paddingTop: 2,
            fontVariantNumeric: 'lining-nums',
          }}>{String(i + 1).padStart(2, '0')}</span>
          <div style={{
            font: '400 14.5px/1.55 var(--niks-ui)',
            color: 'var(--niks-ink)', letterSpacing: '-0.07px',
            textWrap: 'pretty',
          }}>{it}</div>
        </li>
      ))}
    </ol>
  );
}

// ─────────────────────────────────────────────
// Food card — slim editorial entry, expandable in place
// ─────────────────────────────────────────────
function FoodEntry({ food, idx, openId, setOpenId }) {
  const open = openId === idx;
  const tok = IMPACT[food.impact];
  return (
    <div style={{
      borderTop: '0.5px solid rgba(43,39,36,0.10)',
      padding: '20px 0',
    }}>
      <button
        onClick={() => setOpenId(open ? -1 : idx)}
        style={{
          width: '100%', display: 'grid',
          gridTemplateColumns: '34px 1fr auto',
          gap: 14, alignItems: 'baseline',
          background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* index */}
        <span style={{
          font: 'italic 400 18px/1 var(--niks-display)',
          color: 'var(--niks-ink-whisper)', letterSpacing: '-0.2px',
          alignSelf: 'flex-start', paddingTop: 4,
        }}>{String(idx + 1).padStart(2, '0')}</span>

        {/* body */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            font: '400 21px/1.2 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.4px',
          }}>
            {(food.name || '').toLowerCase()}
          </div>
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: tok.dot }} />
            <span style={{
              font: '600 10px/1 var(--niks-ui)',
              letterSpacing: tok.letterspacing,
              textTransform: 'uppercase',
              color: tok.dot,
            }}>{tok.word}</span>
            {food.substitution && (
              <>
                <span style={{ color: 'var(--niks-ink-whisper)', font: '400 10px/1 var(--niks-ui)' }}>·</span>
                <span style={{
                  font: 'italic 400 12px/1 var(--niks-display)',
                  color: 'var(--niks-ink-soft)',
                }}>com substituição</span>
              </>
            )}
          </div>
        </div>

        {/* chevron */}
        <span style={{
          width: 28, height: 28, alignSelf: 'flex-start', marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .35s', transform: open ? 'rotate(180deg)' : 'none',
          color: 'var(--niks-ink-whisper)',
        }}>
          <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
            <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>

      {/* Expanded — editorial layout */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows .45s cubic-bezier(.2,.7,.2,1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            marginTop: 18, marginLeft: 48,
            paddingLeft: 16,
            borderLeft: `0.5px solid ${tok.dot}`,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <FoodFact label="evidência">{food.evidence}</FoodFact>
            <FoodFact label="mecanismo">{food.mechanism}</FoodFact>
            <FoodFact label="para sua pele">{food.relevance_to_skin}</FoodFact>
            {food.substitution && (
              <div style={{
                marginTop: 4,
                background: 'rgba(251,123,107,0.06)',
                border: '0.5px solid rgba(251,123,107,0.55)',
                borderRadius: 14, padding: '14px 16px',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
                  textTransform: 'uppercase', color: '#FB7B6B',
                }}>
                  <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                    <path d="M1 3h8M7 1l2 2-2 2" stroke="#FB7B6B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M11 6H3M5 8L3 6l2-2" stroke="#FB7B6B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity=".55"/>
                  </svg>
                  experimente trocar por
                </div>
                <div style={{
                  marginTop: 10,
                  font: 'italic 400 15px/1.45 var(--niks-display)',
                  color: 'var(--niks-ink)', letterSpacing: '-0.15px',
                  textWrap: 'pretty',
                }}>{food.substitution}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FoodFact({ label, children }) {
  return (
    <div>
      <div style={{
        font: '600 9px/1 var(--niks-ui)', letterSpacing: '1.8px',
        textTransform: 'uppercase', color: 'var(--niks-ink-whisper)',
      }}>{label}</div>
      <div style={{
        marginTop: 8,
        font: '400 13.5px/1.55 var(--niks-ui)',
        color: 'var(--niks-ink)', letterSpacing: '-0.05px',
        textWrap: 'pretty',
      }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Editorial pull quote ("você sabia")
// ─────────────────────────────────────────────
function ScienceNote({ children }) {
  return (
    <div style={{ padding: '0 6px' }}>
      <div style={{
        position: 'relative',
        padding: '6px 0 4px',
      }}>
        {/* Top hairline with italic mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <span style={{
            font: 'italic 400 32px/1 var(--niks-display)',
            color: '#FB7B6B', letterSpacing: '-1px',
          }}>—</span>
          <span style={{
            font: '600 9px/1 var(--niks-ui)', letterSpacing: '2.4px',
            textTransform: 'uppercase', color: '#FB7B6B',
          }}>você sabia</span>
          <span style={{ flex: 1, height: 0.5, background: 'rgba(251,123,107,0.4)' }} />
        </div>
        <p style={{
          margin: 0,
          font: 'italic 400 26px/1.3 var(--niks-display)',
          color: 'var(--niks-ink)', letterSpacing: '-0.5px',
          textWrap: 'pretty',
        }}>{children}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Status bar — minimal, ink color
// ─────────────────────────────────────────────
function StatusBar() {
  return (
    <div style={{
      height: 44, padding: '0 28px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      color: 'var(--niks-ink)', font: '600 15px/1 var(--niks-ui)',
      flexShrink: 0,
    }}>
      <span>9:41</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="1"/><rect x="4.5" y="4" width="3" height="7" rx="1"/><rect x="9" y="2" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5"/><rect x="2" y="2" width="15" height="7" rx="1" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor"/></svg>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Top chrome — back + page eyebrow + actions
// ─────────────────────────────────────────────
function TopBar({ onBack }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 22px 6px',
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        color: 'var(--niks-ink)',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span style={{
        font: '600 10px/1 var(--niks-ui)', letterSpacing: '2.8px',
        textTransform: 'uppercase', color: 'var(--niks-ink-soft)',
      }}>NIKS</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={{
          background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--niks-ink)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button style={{
          background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--niks-ink)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Date strip — small editorial caption above hero
// ─────────────────────────────────────────────
function DateStrip() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '14px 0 4px',
      font: '500 11px/1 var(--niks-ui)',
      letterSpacing: '0.5px',
      color: 'var(--niks-ink-whisper)',
    }}>
      <span>3 mai · sáb</span>
      <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.6 }} />
      <span>12:48</span>
      <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.6 }} />
      <span style={{ textTransform: 'uppercase', letterSpacing: '1.6px' }}>almoço</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────
function MealResultScreen_V3({ data, photo, onBack }) {
  const [openId, setOpenId] = useState(0);

  return (
    <div style={{
      position: 'relative', flex: 1, minHeight: 0,
      display: 'flex', flexDirection: 'column',
      background: '#FAF8F4',
    }}>
      <div className="phone-scroll" style={{
        position: 'relative', flex: 1, minHeight: 0, overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <StatusBar />
        <TopBar onBack={onBack} />

        <DateStrip />

        <MealOrbHero
          photo={photo}
          score={data.meal_score}
          label={data.meal_label}
          name={data.meal_name}
        />

        {/* SUMMARY — editorial pull paragraph */}
        <section style={{ padding: '40px 28px 0' }}>
          <Eyebrow>resumo</Eyebrow>
          <p style={{
            margin: 0,
            font: '400 17px/1.55 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.2px',
            textWrap: 'pretty',
          }}>
            {data.meal_summary}
          </p>
        </section>

        {/* HIGHLIGHTS */}
        {data.highlights?.length > 0 && (
          <section style={{ padding: '44px 28px 0' }}>
            <Eyebrow count={data.highlights.length}>pontos positivos</Eyebrow>
            <NumberedList items={data.highlights} accent="#4CAF50" />
          </section>
        )}

        {/* WATCH OUT */}
        {data.watch_out?.length > 0 && (
          <section style={{ padding: '44px 28px 0' }}>
            <Eyebrow count={data.watch_out.length}>pontos de atenção</Eyebrow>
            <NumberedList items={data.watch_out} accent="#FB7B6B" />
          </section>
        )}

        {/* SCIENCE NOTE — pull quote between content and food list */}
        {data.science_note && (
          <section style={{ padding: '52px 28px 12px' }}>
            <ScienceNote>{data.science_note}</ScienceNote>
          </section>
        )}

        {/* FOODS */}
        <section style={{ padding: '40px 28px 0' }}>
          <Eyebrow count={data.foods.length}>alimentos identificados</Eyebrow>
          <h3 style={{
            margin: '0 0 6px',
            font: 'italic 400 28px/1.1 var(--niks-display)',
            color: 'var(--niks-ink)', letterSpacing: '-0.6px',
          }}>cada ingrediente,<br/>decifrado.</h3>
          <p style={{
            margin: '12px 0 22px',
            font: '400 13px/1.45 var(--niks-ui)',
            color: 'var(--niks-ink-soft)',
            letterSpacing: '-0.05px',
          }}>
            Toque para ler evidência, mecanismo e relevância para sua pele.
          </p>
          <div>
            {data.foods.map((f, i) => (
              <FoodEntry key={i} food={f} idx={i} openId={openId} setOpenId={setOpenId} />
            ))}
            {/* Closing hairline */}
            <div style={{ borderTop: '0.5px solid rgba(43,39,36,0.10)' }} />
          </div>
        </section>

        {/* DISCLAIMER */}
        {data.disclaimer && (
          <section style={{ padding: '36px 28px 0' }}>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '14px 0',
              borderTop: '0.5px solid rgba(43,39,36,0.08)',
              borderBottom: '0.5px solid rgba(43,39,36,0.08)',
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="7" cy="7" r="6" fill="none" stroke="rgba(43,39,36,0.30)" strokeWidth="0.8"/>
                <path d="M7 4v3.4M7 9.4v.4" stroke="rgba(43,39,36,0.55)" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              <div style={{
                font: '400 11.5px/1.5 var(--niks-ui)',
                color: 'var(--niks-ink-soft)', letterSpacing: '0.05px',
              }}>{data.disclaimer}</div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section style={{ padding: '32px 28px 48px' }}>
          <button onClick={onBack} style={{
            width: '100%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'var(--niks-coral)', color: '#fff', border: 0,
            borderRadius: 100, padding: '17px 22px',
            font: '600 15px/1 var(--niks-ui)', letterSpacing: '-0.075px',
            boxShadow: 'var(--sh-cta-coral)', cursor: 'pointer',
          }}>
            <span>Voltar para tela inicial</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>

          {/* End mark */}
          <div style={{
            marginTop: 36, textAlign: 'center',
            font: 'italic 400 14px/1 var(--niks-display)',
            color: 'var(--niks-ink-whisper)',
            letterSpacing: '0.4px',
          }}>
            ◦ ◦ ◦
          </div>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { MealResultScreen_V3, SAMPLE_V3 });
