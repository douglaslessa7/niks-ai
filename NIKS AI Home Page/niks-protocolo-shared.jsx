// Shared helpers for protocolo directions

const PROTO = {
  // palette
  coral: '#FB7B6B',
  coralDeep: '#E85D4D',
  coralSoft: '#F9A898',
  coralTint: '#FDEEE9',
  coralTintDeep: '#F5D9D0',
  ink: '#1D3A44',
  inkSoft: '#486269',
  cream: '#F6F4EE',
  creamDeep: '#EDE9DE',
  pearl: '#FAF8F3',
  white: '#FFFFFF',
  black: '#0F0F0F',
  gray1: '#F5F5F7',
  gray3: '#EDEDEE',
  gray5: '#9CA3AF',
  gray6: '#8A8A8E',
  gold: '#CBA052',
  goldDeep: '#A47E3C',
  night: '#1A1F2E',
  nightDeep: '#0F1420',
  nightSoft: '#2A3042',

  // type stacks
  sans: "'Inter', -apple-system, system-ui, sans-serif",
  serif: "'Cormorant Garamond', 'Playfair Display', 'Times New Roman', serif",
  serif2: "'Fraunces', 'Playfair Display', serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

// Data: full routine, AM + PM
const AM_STEPS = [
  { t: 'Gel de limpeza', s: 'Massagear 30 segundos em movimentos circulares. Enxaguar com água fria.', dur: '1 min', benefit: 'remove oleosidade acumulada durante o sono', ingredient: 'Ácido salicílico 1%', note: 'fresco' },
  { t: 'Sérum com niacinamida', s: '2 a 3 gotas nos pontos-chave. Espalhar do centro para fora.', dur: '30 seg', benefit: 'uniformiza o tom e reduz poros', ingredient: 'Niacinamida 10% · Zinco 1%', note: 'vitamina do tom' },
  { t: 'Hidratante leve', s: 'Ênfase na zona T. Movimento de baixo para cima.', dur: '40 seg', benefit: 'barreira de hidratação para o dia', ingredient: 'Ácido hialurônico · Ceramidas', note: 'aconchego' },
  { t: 'Protetor solar FPS 50+', s: 'Generoso — duas falanges do indicador. Reaplicar a cada 2 horas.', dur: '1 min', benefit: 'a camada que protege todo o resto', ingredient: 'Filtros físicos + químicos · FPS 50', note: 'não esqueça' },
];

const PM_STEPS = [
  { t: 'Óleo desmaquilante', s: 'Pele seca. Emulsione com água morna e massageie 45 segundos.', dur: '1 min', benefit: 'dissolve protetor, poluição e maquiagem', ingredient: 'Óleo de jojoba · Girassol', note: 'primeiro ato' },
  { t: 'Gel de limpeza', s: 'Segunda limpeza, agora para impurezas hidrossolúveis.', dur: '45 seg', benefit: 'pele realmente limpa', ingredient: 'Aminoácidos suaves', note: 'pureza' },
  { t: 'Tônico equilibrante', s: 'Algodão molhado ou mãos. Pressione, não esfregue.', dur: '20 seg', benefit: 'restaura o pH e prepara a absorção', ingredient: 'Água termal · Pantenol', note: 'silêncio' },
  { t: 'Sérum de retinol', s: 'Uma ervilha. Comece em dias alternados.', dur: '30 seg', benefit: 'renovação celular noturna', ingredient: 'Retinol 0,3% · Esqualano', note: 'a estrela' },
  { t: 'Creme noturno rico', s: 'Selar tudo. Pescoço também — sempre.', dur: '1 min', benefit: 'barreira lipídica para a noite', ingredient: 'Manteiga de karité · Peptídeos', note: 'abraço' },
];

// ─── Dados do output real da IA (Quietude v4) ───
const IA_AM_STEPS = [
  {
    name: 'Gel de Limpeza',
    ingredient: 'Gel de Limpeza com Ácido Salicílico 2%',
    instruction: 'Aplique sobre o rosto úmido para desobstruir os poros dilatados detectados na zona T e reduzir a inflamação das pápulas na testa. O ácido salicílico limpa o excesso de sebo sem comprometer sua barreira que está íntegra.',
    steps: [
      'Molhe o rosto com água morna.',
      'Massageie o gel suavemente por 60 segundos, focando na testa e nariz.',
      'Enxágue abundantemente e seque sem esfregar.',
    ],
    waitTime: null,
    schedule: null,
    product_suggestions: ['La Roche-Posay Effaclar Concentrado', 'CeraVe SA Renewing Cleanser'],
  },
  {
    name: 'Sérum Antioxidante',
    ingredient: 'Sérum de Vitamina C 10%',
    instruction: 'Aplique 3 a 4 gotas para neutralizar radicais livres e potencializar o brilho natural desejado. A vitamina C ajuda a prevenir que as manchas de HPI no queixo escureçam com a exposição solar moderada.',
    steps: [
      'Aplique as gotas na palma da mão.',
      'Pressione suavemente sobre o rosto e pescoço.',
      'Aguarde a absorção completa antes do próximo passo.',
    ],
    waitTime: '5–10 min',
    schedule: null,
    product_suggestions: ['Adcos Sérum-C 10', 'La Roche-Posay Pure Vitamin C10'],
  },
  {
    name: 'Protetor Solar',
    ingredient: 'Protetor Solar FPS 60 com Toque Seco',
    instruction: 'Aplique generosamente como último passo. Como você raramente usa proteção e possui hiperpigmentação residual, este passo é inegociável para evitar que as manchas de acne se tornem permanentes.',
    steps: [
      'Aplique a quantidade de dois dedos para rosto e pescoço.',
      'Espalhe uniformemente até a absorção total.',
      'Reaplique se houver exposição solar direta prolongada.',
    ],
    waitTime: null,
    schedule: null,
    product_suggestions: ['Mantecorp Episol Sec FPS 60', 'La Roche-Posay Anthelios Airlicium'],
  },
];

const IA_PM_STEPS = [
  {
    name: 'Gel de Limpeza',
    ingredient: 'Gel de Limpeza Neutro',
    instruction: 'Utilize uma limpeza suave para remover impurezas do dia. Como o cleanser da manhã já possui ativos esfoliantes, à noite priorizamos o repouso da barreira para receber os tratamentos renovadores.',
    steps: [
      'Aplique uma pequena quantidade no rosto úmido.',
      'Massageie levemente para remover o protetor solar.',
      'Enxágue com água fria.',
    ],
    waitTime: null,
    schedule: null,
    product_suggestions: ['CeraVe Hidratante Cremoso de Limpeza', 'Cetaphil Loção de Limpeza'],
  },
  {
    name: 'Sérum de Tratamento',
    ingredient: 'Sérum de Niacinamida 10%',
    instruction: 'Aplique para controlar o brilho sebáceo na zona T e acalmar a inflamação da acne. A niacinamida é fundamental para uniformizar o tom das manchas no queixo e testa detectadas na análise.',
    steps: [
      'Espalhe 2-3 gotas por todo o rosto.',
      'Foque nas áreas com manchas residuais e poros dilatados.',
      'Deixe secar naturalmente.',
    ],
    waitTime: null,
    schedule: null,
    product_suggestions: ['The Ordinary Niacinamide 10% + Zinc 1%', 'Principia Niacinamida (NC-10)'],
  },
  {
    name: 'Sérum Renovador',
    ingredient: 'Sérum de Ácido Mandélico 10%',
    instruction: 'Este AHA de molécula grande é ideal para seu fotótipo III, promovendo renovação celular sem irritar. Ele tratará a textura irregular e as marcas de acne, entregando o glow solicitado.',
    steps: [
      'Aplique apenas nas noites indicadas (Segunda, Quarta e Sexta).',
      'Evite a área dos olhos e cantos do nariz.',
      'Não combine com outros ácidos na mesma aplicação.',
    ],
    waitTime: '10–20 min',
    schedule: { days: ['Seg', 'Qua', 'Sex'], label: 'Seg · Qua · Sex' },
    product_suggestions: ['Creamy Ácido Mandélico + Alfa-Arbutin', 'The Ordinary Mandelic Acid 10% + HA'],
  },
  {
    name: 'Sérum de Tratamento',
    ingredient: 'Sérum de Ácido Azelaico 10%',
    instruction: 'Ativo multitarefa que trata simultaneamente as pápulas inflamatórias e a hiperpigmentação pós-inflamatória. Ele inibe a tirosinase, clareando as manchas no queixo de forma segura.',
    steps: [
      'Aplique uma camada fina sobre as áreas com acne e manchas.',
      'Pode causar um leve formigamento transitório nos primeiros usos.',
      'Use nas noites em que não utilizar o Ácido Mandélico.',
    ],
    waitTime: null,
    schedule: { days: ['Ter', 'Qui', 'Sáb', 'Dom'], label: 'Ter · Qui · Sáb · Dom' },
    product_suggestions: ['Principia Ácido Azelaico (AL-10)', 'The Ordinary Azelaic Acid Suspension 10%'],
  },
  {
    name: 'Hidratante',
    ingredient: 'Hidratante com Ceramidas',
    instruction: 'Finalize selando a hidratação e reforçando a integridade da barreira cutânea. Este passo compensa o uso dos ácidos e mantém a pele resiliente e macia.',
    steps: [
      'Aplique uma pequena quantidade após os tratamentos estarem secos.',
      'Espalhe com movimentos ascendentes.',
      'Certifique-se de cobrir todo o rosto.',
    ],
    waitTime: null,
    schedule: null,
    product_suggestions: ['CeraVe Loção Facial Hidratante', 'Neutrogena Hydro Boost Water Gel'],
  },
];

// Dicas gerais da IA — prognóstico + advertências
const IA_DICAS = [
  {
    kind: 'alerta',
    title: 'O que esperar',
    body: "Sua pele possui acne inflamatória e manchas que podem passar por um processo de 'purging' (piora temporária) nas semanas 2-4 com o uso de Ácido Salicílico e Mandélico; isso é normal e indica a limpeza dos poros. Como você raramente usa protetor solar, o sucesso deste protocolo depende 100% da adesão diária ao SPF 60, caso contrário as manchas de HPI no queixo podem escurecer permanentemente. Suspenda o uso e busque dermatologista se houver ardor persistente, vermelhidão intensa ou descamação em placas.",
  },
  {
    kind: 'marco',
    title: 'Semanas 1–2',
    body: 'Redução visível na vermelhidão das pápulas inflamadas na testa e controle inicial do brilho sebáceo na zona T.',
  },
  {
    kind: 'marco',
    title: 'Semanas 3–4',
    body: 'Melhora na textura da pele e poros menos visíveis. Início do clareamento das manchas de acne mais recentes.',
  },
  {
    kind: 'marco',
    title: 'Semanas 5–8',
    body: 'Resultado significativo na uniformização do tom da pele (HPI) e redução drástica no surgimento de novas lesões de acne.',
  },
];

// Cronograma de introdução (separado das dicas normais)
const IA_CRONOGRAMA = [
  { week: 'Semana 1', body: 'Use o Ácido Mandélico e o Ácido Azelaico apenas 1x na semana cada para testar tolerância.' },
  { week: 'Semana 2', body: 'Introduza o Ácido Mandélico 2x na semana e o Azelaico 2x na semana em noites alternadas.' },
  { week: 'Semana 3+', body: 'Siga o cronograma indicado no protocolo (Mandélico 3x/semana e Azelaico nas demais noites).' },
];

const VERSE = 'A pele lembra o cuidado. Cada gesto é uma conversa entre você e o tempo.';

// Ambient soundscape names (for "ritual" mood)
const AMBIENTS = [
  { name: 'Jardim ao amanhecer', key: 'dawn' },
  { name: 'Chuva em pétalas', key: 'rain' },
  { name: 'Silêncio suave', key: 'silence' },
  { name: 'Piano ao nascer do sol', key: 'piano' },
];

// Minimal sparkle / icon set (stroke)
const Icon = {
  sparkle: (c = PROTO.coral, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 l2.5 7 L22 11 l-7 2.5 L12 22 l-2.5-8.5 L2 11 l7.5-2 z" fill={c}/>
    </svg>
  ),
  check: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  ),
  chevronR: (c = PROTO.ink, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
  ),
  chevronL: (c = PROTO.ink, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
  ),
  sun: (c = PROTO.ink, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  ),
  moon: (c = PROTO.ink, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  clock: (c = PROTO.ink, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  droplet: (c = PROTO.ink, s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
    </svg>
  ),
  flower: (c = PROTO.coral, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.2">
      <circle cx="12" cy="7" r="3"/><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><circle cx="12" cy="17" r="3"/>
      <circle cx="12" cy="12" r="1.5" fill={c}/>
    </svg>
  ),
  leaf: (c = PROTO.ink, s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.3c1 3.2.46 4.3-.5 5.7A7 7 0 0 1 11 20z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>
    </svg>
  ),
  play: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M8 5v14l11-7z"/></svg>
  ),
  pause: (c = '#fff', s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
  ),
  arrowR: (c = PROTO.ink, s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
  ),
  scan: (c = PROTO.ink, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    </svg>
  ),
  home: (c = PROTO.ink, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15V14H9v7.5H4.5A1.5 1.5 0 0 1 3 20z"/>
    </svg>
  ),
  homeFilled: (c = PROTO.coral, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15V14H9v7.5H4.5A1.5 1.5 0 0 1 3 20z"/>
    </svg>
  ),
  protocol: (c = PROTO.ink, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
    </svg>
  ),
  protocolFilled: (c = PROTO.coral, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
    </svg>
  ),
  user: (c = PROTO.ink, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  userFilled: (c = PROTO.coral, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  scanFilled: (c = PROTO.coral, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  volume: (c = PROTO.ink, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
};

// Custom decorative SVG: ornamental divider (art-deco-ish)
function Divider({ color = PROTO.coral, width = 120 }) {
  return (
    <svg width={width} height="12" viewBox="0 0 120 12" fill="none">
      <line x1="0" y1="6" x2="48" y2="6" stroke={color} strokeWidth="0.8"/>
      <circle cx="54" cy="6" r="1.5" fill={color}/>
      <path d="M60 3 l2 3 l-2 3 l-2 -3 z" fill={color}/>
      <circle cx="66" cy="6" r="1.5" fill={color}/>
      <line x1="72" y1="6" x2="120" y2="6" stroke={color} strokeWidth="0.8"/>
    </svg>
  );
}

// Bottom tab bar variants (match existing pattern but can be themed)
function ProtoTabBar({ active = 'protocolo', theme = 'light', tabs: tabsOverride, rightInset }) {
  const dark = theme === 'dark';
  const bg = dark ? 'rgba(26,31,46,0.85)' : PROTO.white;
  const border = dark ? 'rgba(255,255,255,0.08)' : '#F0F0F0';
  const activeColor = dark ? PROTO.coralSoft : PROTO.coral;
  const inactiveColor = dark ? 'rgba(255,255,255,0.45)' : PROTO.gray6;
  const tabs = tabsOverride || [
    { key: 'scanear', label: 'scanear', icon: Icon.scan },
    { key: 'protocolo', label: 'protocolo', icon: Icon.protocol },
    { key: 'perfil', label: 'perfil', icon: Icon.user },
  ];
  return (
    <div style={{
      position: 'absolute', left: 16, right: rightInset ?? 16, bottom: 20, zIndex: 20,
      display: 'flex', justifyContent: 'space-around',
      background: bg, borderRadius: 20,
      border: `1px solid ${border}`,
      boxShadow: dark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.06)',
      padding: '10px 8px',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    }}>
      {tabs.map(t => {
        const isActive = t.key === active;
        const color = isActive ? activeColor : inactiveColor;
        const renderIcon = isActive && t.activeIcon ? t.activeIcon : t.icon;
        return (
          <div
            key={t.key}
            onClick={t.onClick}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 52, color, cursor: t.onClick ? 'pointer' : 'default' }}>
            {renderIcon(color, 24)}
            <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: t.labelColor || color }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, {
  PROTO, AM_STEPS, PM_STEPS, VERSE, AMBIENTS, Icon, Divider, ProtoTabBar,
  IA_AM_STEPS, IA_PM_STEPS, IA_DICAS, IA_CRONOGRAMA,
});
