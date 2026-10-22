import { View, Text, ScrollView, Image, TouchableOpacity, type ImageSourcePropType } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../../lib/haptics';
import { useAppStore, type OnboardingData, type ScanResult } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { OB_STEPS, useObName, obStep, useOnMount } from '../../components/onboarding/kit';

// Onboarding — "Rotina pronta". RÉPLICA da tela 24 "Rotina pronta · nova" do Claude
// Design (projeto NIKS Onboarding, `NIKS Onboarding - fluxo completo.dc.html`,
// 20/out/2026): medidas, cores, tipografia, ícones (mesmos traçados SVG) e textos do
// design. Nota do design: "Os 3 achados, as semanas e as metas mudam conforme as
// queixas, o tipo de pele e o objetivo." O design mostra o caso da Jane (acne + manchas
// + pele mista) — para ele os textos são os do design, palavra por palavra; para as
// outras combinações, textos no mesmo molde.
// Círculos "zoom na pele": os PNGs @3x das telas de preocupações e de tipo de pele (o
// `feTurbulence` do design não existe no react-native-svg — README).
// ⚠️ Fora do design: o depoimento é o fornecido pelo produto (no design era marcador);
// o número da prova social é o informado pelo produto (237.887), sem
// "com a pele parecida com a sua" (o número não é por tipo de pele).
const STEP = OB_STEPS.rotinaPronta;
const STEP_NAME = 'Protocolo Pronto';

const INK = '#121212';
const SUB = '#818181';
const PINK = '#FF5EA8';
const LINE = '#EFEBEC';
const PROVA_SOCIAL = 237887;
// ⚠️ Depoimento fornecido pelo produto (20/out/2026). Precisa ser de cliente real, com
// autorização para usar a foto e o nome (imagem de rosto = dado pessoal, LGPD).
const DEPOIMENTO = {
  foto: require('../../assets/onboarding/depoimento-maria-clara.jpg'),
  texto: 'Minha pele melhorou muito com os produtos que a NIKS indicou para mim. Em poucas semanas, já vi uma transformação incrível.',
  autora: 'Maria Clara, 23 anos',
};

type Tipo = 'mista' | 'oleosa' | 'seca' | 'normal';

const ZOOM: Record<string, ImageSourcePropType> = {
  'Acne/espinhas': require('../../assets/onboarding/pele-zoom/acne.png'),
  Manchas: require('../../assets/onboarding/pele-zoom/manchas.png'),
  Cravos: require('../../assets/onboarding/pele-zoom/cravos.png'),
  Oleosidade: require('../../assets/onboarding/pele-zoom/oleosidade.png'),
  Rugas: require('../../assets/onboarding/pele-zoom/rugas.png'),
  'Poros dilatados': require('../../assets/onboarding/pele-zoom/poros.png'),
  Olheiras: require('../../assets/onboarding/pele-zoom/olheiras.png'),
  Ressecamento: require('../../assets/onboarding/pele-zoom/ressecamento.png'),
  'Textura irregular': require('../../assets/onboarding/pele-zoom/textura.png'),
  Outro: require('../../assets/onboarding/pele-zoom/outro.png'),
};
const ZOOM_TIPO: Record<Tipo, ImageSourcePropType> = {
  mista: require('../../assets/onboarding/tipo-pele/mista.png'),
  oleosa: require('../../assets/onboarding/tipo-pele/oleosa.png'),
  seca: require('../../assets/onboarding/tipo-pele/seca.png'),
  normal: require('../../assets/onboarding/tipo-pele/normal.png'),
};

// ── Textos por queixa ────────────────────────────────────────────────────────
// achado = cartão "O que a análise encontrou"; semana = título/texto da semana;
// destaque = título do cartão rosa final; meta = pílula; ganho = "Em 4 semanas: …".
const QUEIXA: Record<string, { achado: string; semana: [string, string]; destaque: string; meta: string; ganho: string }> = {
  'Acne/espinhas': {
    achado: 'Suas espinhas surgem onde sua pele produz óleo em excesso. Sua rotina age exatamente aí.',
    semana: ['Menos espinhas novas', 'Os ativos escolhidos para você desinflamam e as espinhas param de surgir'],
    destaque: 'Até 95% menos espinhas', meta: 'Pele sem espinhas', ganho: 'menos espinhas',
  },
  Manchas: {
    achado: 'Suas manchas pedem um ativo que clareia sem irritar. O NIKS já escolheu o certo para o seu tipo de mancha.',
    semana: ['Manchas clareando', 'O ativo certo para o seu tipo de mancha começa a clarear as marcas'],
    destaque: 'Manchas visivelmente mais claras', meta: 'Manchas clareadas', ganho: 'menos marcas',
  },
  Cravos: {
    achado: 'Seus cravos vêm de poros entupidos de óleo. A limpeza da sua rotina mantém esses poros livres.',
    semana: ['Poros desobstruídos', 'A limpeza e os ativos certos desentopem os poros e os cravos diminuem'],
    destaque: 'Cravos sob controle', meta: 'Poros livres de cravos', ganho: 'menos cravos',
  },
  Oleosidade: {
    achado: 'Sua pele produz óleo em excesso ao longo do dia. Sua rotina controla o brilho sem ressecar.',
    semana: ['Brilho sob controle', 'Os ativos certos regulam o óleo e a pele para de brilhar ao longo do dia'],
    destaque: 'Pele sem brilho excessivo', meta: 'Brilho sob controle', ganho: 'menos brilho',
  },
  Rugas: {
    achado: 'Suas linhas aparecem onde a pele perdeu firmeza. Sua rotina traz os ativos que estimulam firmeza.',
    semana: ['Pele mais firme', 'Os ativos que estimulam firmeza começam a suavizar as linhas'],
    destaque: 'Linhas suavizadas', meta: 'Linhas suavizadas', ganho: 'menos linhas',
  },
  'Poros dilatados': {
    achado: 'Seus poros ficam mais visíveis com o excesso de óleo. Sua rotina cuida da textura para deixá-los discretos.',
    semana: ['Poros mais discretos', 'Com menos óleo e a textura certa, os poros aparecem menos'],
    destaque: 'Poros discretos', meta: 'Poros discretos', ganho: 'poros discretos',
  },
  Olheiras: {
    achado: 'Suas olheiras pedem um cuidado só para a área dos olhos. Ele já está na sua rotina.',
    semana: ['Olhar descansado', 'O cuidado da área dos olhos começa a suavizar as olheiras'],
    destaque: 'Olheiras suavizadas', meta: 'Olhar descansado', ganho: 'olheiras mais suaves',
  },
  Ressecamento: {
    achado: 'Sua pele perde água rápido e a barreira fica frágil. Sua rotina reforça a hidratação todos os dias.',
    semana: ['Pele hidratada', 'A barreira se fortalece e a pele para de repuxar e descamar'],
    destaque: 'Pele hidratada de verdade', meta: 'Pele hidratada', ganho: 'mais hidratação',
  },
  'Textura irregular': {
    achado: 'A textura irregular vem do acúmulo de células na superfície. Sua rotina renova a pele de forma suave.',
    semana: ['Pele mais lisa', 'A renovação suave deixa a pele mais lisa ao toque'],
    destaque: 'Textura uniforme', meta: 'Pele lisinha', ganho: 'textura mais lisa',
  },
};

// ── Textos por tipo de pele ──────────────────────────────────────────────────
const TIPO: Record<Tipo, { achado: string; base: string; destaque: string; brilho: boolean }> = {
  mista: {
    achado: 'Sua pele é mista. Por isso nada funcionou até hoje: cada produto tratava só metade do seu rosto.',
    base: 'A limpeza certa tira o óleo da zona T sem ressecar as bochechas',
    destaque: 'Brilho da zona T sob controle', brilho: true,
  },
  oleosa: {
    achado: 'Sua pele é oleosa. Por isso os produtos comuns só pioravam o brilho: ela precisa de controle sem ressecar.',
    base: 'A limpeza certa tira o excesso de óleo sem agredir a pele',
    destaque: 'Brilho sob controle', brilho: true,
  },
  seca: {
    achado: 'Sua pele é seca. Por isso os produtos comuns repuxavam: ela precisa de hidratação e de uma barreira forte.',
    base: 'A limpeza suave e a hidratação certa param o repuxar da pele',
    destaque: 'Pele sem repuxar', brilho: false,
  },
  normal: {
    achado: 'Sua pele é normal. O foco agora é manter o equilíbrio e prevenir o que ainda não apareceu.',
    base: 'A limpeza e a hidratação certas mantêm a pele equilibrada',
    destaque: 'Pele equilibrada', brilho: false,
  },
};

const METAS_EXTRA = ['Bonita sem maquiagem', 'Fotos de perto sem medo', 'Pele uniforme', 'Autoestima em alta'];
const DESBLOQUEIE = [
  'Scan de pele com IA', 'Rotina manhã e noite', 'Produtos certos para você',
  'Scan de refeições', 'Lembretes da rotina', 'Evolução semanal',
];

function tipoDaPele(ob: OnboardingData, scan: ScanResult | null): Tipo | null {
  const t = (s?: string | null) => {
    const v = (s ?? '').toLowerCase();
    return (['mista', 'oleosa', 'seca', 'normal'] as Tipo[]).find((x) => v === x) ?? null;
  };
  return t(ob.skin_type) ?? t(scan?.skin_type_sebaceous) ?? t(scan?.skin_type_detected);
}

function juntar(lista: string[]) {
  if (lista.length <= 1) return lista[0] ?? '';
  return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

type Achado = { img: ImageSourcePropType; texto: string };

function montar(ob: OnboardingData, scan: ScanResult | null) {
  const queixas = ob.concerns.filter((c) => QUEIXA[c]);
  const tipo = tipoDaPele(ob, scan);
  const oleosa = tipo === 'mista' || tipo === 'oleosa';
  const temAcne = queixas.includes('Acne/espinhas');

  // O que a análise encontrou: 2 queixas + o tipo de pele.
  const achados: Achado[] = queixas.slice(0, 2).map((c) => {
    let texto = QUEIXA[c].achado;
    // Textos do design (caso Jane).
    if (c === 'Acne/espinhas' && tipo === 'mista') texto = 'Suas espinhas nascem na zona T, onde sua pele produz óleo em excesso. Sua rotina age exatamente aí.';
    if (c === 'Manchas' && temAcne) texto = 'Suas manchas são marcas de espinhas antigas. O NIKS já escolheu o ativo que clareia esse tipo de marca.';
    return { img: ZOOM[c], texto };
  });
  if (achados.length < 2) {
    const visto = scan?.region_insights?.[0]?.main_finding?.trim();
    if (visto) achados.push({ img: ZOOM.Outro, texto: `A análise encontrou ${visto.charAt(0).toLowerCase()}${visto.slice(1).replace(/\.$/, '')}. Sua rotina já foi pensada para isso.` });
  }
  if (tipo) achados.push({ img: ZOOM_TIPO[tipo], texto: TIPO[tipo].achado });

  // Semanas (posições e ícones do design: gota, brilho, sol, coração).
  const q1 = queixas[0] ? QUEIXA[queixas[0]] : null;
  const q2 = queixas[1] ? QUEIXA[queixas[1]] : null;
  const semanas = {
    s1: ['A base certa', tipo ? TIPO[tipo].base : 'A limpeza e a hidratação certas preparam a pele para os ativos'] as [string, string],
    s2: q1 ? q1.semana : ['Pele se adaptando', 'Os ativos entram aos poucos, no ritmo da sua pele, sem irritar'] as [string, string],
    d1: tipo ? TIPO[tipo].destaque : 'Primeiros sinais de mudança',
    s3: q2 ? q2.semana : ['Ajustes finos', 'A NIKS ajusta a sua rotina conforme a sua pele responde'] as [string, string],
    s4: ['Pele que dispensa maquiagem', 'Você se olha no espelho e não sente mais vontade de esconder nada'] as [string, string],
    d2: q1 ? q1.destaque : 'Pele visivelmente mais saudável',
  };
  // "Em 4 semanas: menos brilho, menos marcas e uma pele uniforme" (design).
  const ganhos = [
    ...(oleosa && !queixas.includes('Oleosidade') ? ['menos brilho'] : []),
    ...queixas.slice(1, 3).map((c) => QUEIXA[c].ganho),
    'uma pele uniforme',
  ].filter((g, i, a) => a.indexOf(g) === i);
  const d2Sub = `Em 4 semanas: ${juntar(ganhos)}`;

  const metas = [...queixas.slice(0, 2).map((c) => QUEIXA[c].meta)];
  for (const m of METAS_EXTRA) { if (metas.length >= 4) break; if (!metas.includes(m)) metas.push(m); }

  return { achados: achados.slice(0, 3), semanas, d2Sub, metas };
}

// ── Ícones (traçados do design) ──────────────────────────────────────────────
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
function Icone({ d, size = 22, color = PINK, width = 2, children }: { d?: string; size?: number; color?: string; width?: number; children?: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {d ? <Path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /> : children}
    </Svg>
  );
}
const GOTA = 'M12 3.5c3.2 3.9 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.3-6.1 5.5-10z';
const RAIOS = 'M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.6 2.6M15.2 15.2l2.6 2.6M6.2 17.8l2.6-2.6M15.2 8.8l2.6-2.6';
const CORACAO = 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z';
function Sol() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={4} fill="none" stroke={PINK} strokeWidth={2} />
      <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" fill="none" stroke={PINK} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function Calendario() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x={3.5} y={5} width={17} height={15.5} rx={3} fill="none" stroke={INK} strokeWidth={1.8} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function Cadeado() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x={4.5} y={11} width={15} height={10} rx={2.5} fill="none" stroke={INK} strokeWidth={2} />
      <Path d="M8 11V7.5a4 4 0 0 1 7.8-1.2" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function Estrela({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.4l1.3-6.5L2.5 9.3l6.6-.8z" fill={PINK} />
    </Svg>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────
const tituloSecao = { textAlign: 'center' as const, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3, color: INK };
const Divisor = () => <View style={{ height: 1, backgroundColor: LINE, marginHorizontal: 8 }} />;

function Semana({ icone, titulo, texto, margem }: { icone: React.ReactNode; titulo: string; texto: string; margem: [number, number] }) {
  return (
    <View style={{
      marginLeft: margem[0], marginRight: margem[1], borderRadius: 16, backgroundColor: '#FFFFFF',
      borderWidth: 1, borderColor: LINE, paddingVertical: 14, paddingHorizontal: 16,
      flexDirection: 'row', alignItems: 'center', gap: 14,
    }}>
      {icone}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: INK }}>{titulo}</Text>
        <Text style={{ fontSize: 15, lineHeight: 20, color: SUB }}>{texto}</Text>
      </View>
    </View>
  );
}

function Destaque({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <View style={{
      borderRadius: 20, backgroundColor: PINK, paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', gap: 4,
      shadowColor: PINK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 12,
    }}>
      <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF', textAlign: 'center' }}>{titulo}</Text>
      <Text style={{ fontSize: 15, lineHeight: 20, color: '#FFFFFF', textAlign: 'center' }}>{texto}</Text>
    </View>
  );
}

export default function RotinaPronta() {
  const router = useRouter();
  const { track } = useMixpanel();
  const insets = useSafeAreaInsets();
  const name = useObName();
  const onboarding = useAppStore((s) => s.onboarding);
  const scan = useAppStore((s) => s.scanResult);
  const { achados, semanas, d2Sub, metas } = montar(onboarding, scan);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    // Direto para o paywall (20/out/2026): o compromisso passou para DEPOIS da conta.
    router.push('/(onboarding)/paywall-soft' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {/* Design: a rolagem começa ABAIXO da barra de status (top 54 do frame). */}
      <ScrollView
        style={{ marginTop: insets.top }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 34, paddingHorizontal: 17, paddingBottom: 170, gap: 32 }}
      >
        {/* ── Parabéns ─────────────────────────────────────────────────── */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 84, height: 84, borderRadius: 42, backgroundColor: PINK, borderWidth: 4, borderColor: '#FFFFFF',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#FF6EAF', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 20,
          }}>
            <Icone d={CHECK} size={38} color="#FFFFFF" width={3} />
          </View>
          <Text style={{ marginTop: 14, fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: INK, textAlign: 'center' }}>
            {name ? `Parabéns, ${name}!` : 'Parabéns!'}
          </Text>
          <Text style={{ fontSize: 17, lineHeight: 23, color: SUB, textAlign: 'center' }}>
            {'Montamos a rotina '}
            <Text style={{ color: PINK, fontWeight: '600' }}>exata</Text>
            {'\nque a sua pele precisa.'}
          </Text>
        </View>

        {/* ── O que a análise encontrou ────────────────────────────────── */}
        <View style={{ gap: 12 }}>
          <Text style={tituloSecao}>O que a análise encontrou na sua pele:</Text>
          {achados.map((a, i) => (
            <View key={i} style={{
              borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE,
              paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 16,
              shadowColor: INK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 12,
            }}>
              <View style={{
                width: 62, height: 62, margin: -3, borderRadius: 31, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                shadowColor: '#784632', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 5,
              }}>
                <Image source={a.img} style={{ width: 56, height: 56, borderRadius: 28 }} />
              </View>
              <Text style={{ flex: 1, fontSize: 17, lineHeight: 23, color: INK }}>{a.texto}</Text>
            </View>
          ))}
        </View>

        {/* ── Plano de 4 semanas ───────────────────────────────────────── */}
        <View style={{ gap: 18 }}>
          <Text style={{ textAlign: 'center', fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4, color: INK }}>
            {'Chega de adivinhar. O\nNIKS sabe '}
            <Text style={{ color: PINK }}>exatamente</Text>
            {'\no que sua pele precisa'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Calendario />
            <Text style={{ fontSize: 17, lineHeight: 22, color: INK }}>Seu plano para as próximas 4 semanas</Text>
          </View>
          <View style={{ gap: 10 }}>
            <Semana margem={[0, 36]} icone={<Icone d={GOTA} />} titulo={`Semana 1: ${semanas.s1[0]}`} texto={semanas.s1[1]} />
            <Semana margem={[18, 18]} icone={<Icone d={RAIOS} />} titulo={`Semana 2: ${semanas.s2[0]}`} texto={semanas.s2[1]} />
            <Destaque titulo={semanas.d1} texto={"Você vê a diferença no espelho\njá nas primeiras semanas"} />
            <Semana margem={[36, 0]} icone={<Sol />} titulo={`Semana 3: ${semanas.s3[0]}`} texto={semanas.s3[1]} />
            <Semana margem={[18, 18]} icone={<Icone d={CORACAO} />} titulo={`Semana 4: ${semanas.s4[0]}`} texto={semanas.s4[1]} />
            <Destaque titulo={semanas.d2} texto={d2Sub} />
          </View>
        </View>

        <Divisor />

        {/* ── Metas definidas ──────────────────────────────────────────── */}
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icone d={CHECK} size={20} color={INK} width={2} />
            <Text style={tituloSecao}>Metas definidas</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
            {metas.map((m) => (
              <View key={m} style={{
                width: '48.8%', height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE,
                paddingLeft: 10, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' }}>
                  <Icone d={CHECK} size={13} color="#FFFFFF" width={3} />
                </View>
                <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 20, color: INK }}>{m}</Text>
              </View>
            ))}
          </View>
        </View>

        <Divisor />

        {/* ── Desbloqueie ──────────────────────────────────────────────── */}
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Cadeado />
            <Text style={tituloSecao}>Desbloqueie</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
            {DESBLOQUEIE.map((d) => (
              <View key={d} style={{
                width: '48.8%', height: 46, borderRadius: 12, backgroundColor: '#F0F0F0',
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
              }}>
                <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, color: INK, textAlign: 'center' }}>{d}</Text>
              </View>
            ))}
          </View>
        </View>

        <Divisor />

        {/* ── Prova social (número informado pelo produto) + depoimento ────── */}
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Text style={tituloSecao}>
            {'Mais de '}
            <Text style={{ color: PINK }}>{`${PROVA_SOCIAL.toLocaleString('pt-BR')} mulheres`}</Text>
            {' já confiam no NIKS'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => <Estrela key={i} size={18} />)}
          </View>
          {/* Depoimento (cartão do design). Foto, texto e nome fornecidos pelo produto
              (20/out/2026). Os 3 pontinhos de carrossel do design ficaram de fora: com um
              depoimento só, não há o que deslizar. */}
          <View style={{
            alignSelf: 'stretch', borderRadius: 20, backgroundColor: '#FBEDEF',
            paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 14,
          }}>
            <Image
              source={DEPOIMENTO.foto}
              style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#F4EFE9' }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {[0, 1, 2, 3, 4].map((i) => <Estrela key={i} size={13} />)}
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: INK }}>{`“${DEPOIMENTO.texto}”`}</Text>
              <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: SUB }}>{DEPOIMENTO.autora}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Véu + botão (design: degradê de 150 pt, botão 60 pt a 26 pt das bordas) */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.4]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 }}
      />
      <TouchableOpacity
        onPress={handleContinue}
        activeOpacity={0.85}
        style={{
          position: 'absolute', left: 26, right: 26, bottom: insets.bottom + 22, height: 60, borderRadius: 30,
          backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
          shadowColor: PINK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15,
        }}
      >
        <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.2, color: '#FFFFFF' }}>Vamos começar</Text>
      </TouchableOpacity>
    </View>
  );
}
