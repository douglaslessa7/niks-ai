import { useEffect, useRef, useState } from 'react';
import { Image, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion,
  useSharedValue, withDelay, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { ListChecks, ScanFace, ShoppingBag } from 'lucide-react-native';
import { haptics } from '../../lib/haptics';
import { CONCERN_LABELS } from '../../components/onboarding/answers';
import { useAppStore } from '../../store/onboarding';
import { PROBLEMA_DA_QUEIXA } from '../../lib/analiseRapida';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { caminhoDaCarta, cartaDoOnboarding, type CaminhoOnboarding } from '../../lib/cartaOnboarding';
import BalancedText from '../../components/BalancedText';
import { OB_STEPS, obStep, useObName, useOnMount } from '../../components/onboarding/kit';
import { objetivoPele } from '../../components/onboarding/answers';
import { focoNome, type Regiao } from '../../components/onboarding/RostoRegioes';

// Onboarding — "Rotina pronta" v2 (04/nov/2026, pedido do produto): VARIAÇÃO NOVA da rotina
// pronta, com a ESTRUTURA da tela final do onboarding do Tapfit (gravação
// `~/Downloads/ScreenRecording_11-04-2026 16-41-10_1.MP4`: uma página que rola com o botão
// fixo embaixo) e a IDENTIDADE VISUAL da rotina pronta do NIKS (`rotina-pronta.tsx`, a
// réplica do Claude Design): a rolagem da v1 (abaixo da barra de status, 34 pt de respiro,
// 17 pt das laterais, divisórias finas), título 28/33 em negrito com a pele em rosa, seções
// com ícone + título 22 centrado e a frase cinza, cards brancos com borda `#EFEBEC`, sombra
// suave e ícones rosa, e o botão rosa largo (60 pt) sobre o degradê branco.
// A `rotina-pronta.tsx` v1 ficou no repo, sem mudança. Vem depois do compromisso e leva
// direto ao paywall.
//
// Mudanças pedidas pelo produto no mesmo dia: (1) o check do topo é o do Tapfit (anel com
// degradê + check) nas cores do NIKS; (2) "Para onde você vai" é o GRÁFICO DA JORNADA do
// "Seu caminho" (`(scan)/seu-caminho.tsx`): trilha que desce com 3 pontos (ícone + texto,
// alternando de lado) até a flor do NIKS, com os MESMOS textos e números da carta que ela viu
// (`caminhoDaCarta` — a meta é a do caminho, nunca outra conta); (3) saiu o "De onde vêm os
// seus números" (o produto vai pôr outro elemento ali); (4) cada elemento aparece na sua vez
// conforme ela rola.
//
// Elementos, de cima para baixo (cada um entra quando chega à vista): abertura · o card da
// rotina (UM card: "SEU FOCO" + problema + região, divisória, manhã | noite — sem o título
// "Sua rotina" e sem o protetor, que saíram em 04/nov/2026) · "Você pode ajustar depois." ·
// "Para onde você vai" · a jornada · aviso · "Resultados reais" (os da "Transformação real")
// · "O que você leva" · 4 itens.
//
// Dados: passos = números FIXOS provisórios (`PASSOS_PROVISORIOS`: desde 06/nov/2026 a rotina
// só é gerada depois da compra, então ainda não existe aqui); foco = o MESMO problema da carta
// (`cartaDoOnboarding`, um dos que ela marcou); região = o que ela marcou no mapa do rosto
// (`regioesFoco`); jornada = `caminhoDaCarta`. Em __DEV__,
// sem dado, o exemplo do pedido (Ana, pele de vidro, 4 e 5 passos, acne, testa e bochechas,
// 34 → 28).
//
// Animação (skill animate-expo — tela vista uma vez: cabe; propósito: explicar a ordem de
// leitura). A TELA ABRE PARADA (pedido do produto, 04/nov/2026): o que cabe na tela ao abrir
// aparece pronto, sem entrada — o título, o card, "Para onde você vai" e o COMEÇO da jornada
// (1º ponto, a linha até a Semana 1 e a Semana 1), e o botão. A animação começa a partir
// daí, com a rolagem: a jornada continua da Semana 1 até a flor (a Semana 2 e a flor
// acendem quando a ponta da linha chega nelas; depois, a piscada do destaque) e o que estava
// abaixo da tela entra na sua vez (sobe 14 pt e acende, 380 ms, ease-out forte; os que chegam
// juntos em fila, 70 ms um do outro). Se a jornada estava toda abaixo da tela (iPhone
// pequeno), ela faz a coreografia inteira do "Seu caminho" quando chega. Tudo no thread de
// UI: a rolagem só escreve um shared value e UMA reação decide quem entra (nada de setState
// na rolagem); sem vibração (não vibrar por rolagem). "Reduzir movimento": só esmaecimentos;
// a jornada aparece pronta.
// Mixpanel: o mesmo passo da v1 (`OB_STEPS.rotinaPronta`, "Protocolo Pronto", com
// `variacao: 'v2'`) — o "concluído" também fecha o funil do Paywallo.

const STEP = OB_STEPS.rotinaPronta;
const STEP_NAME = 'Protocolo Pronto';

// Paleta e medidas da rotina pronta v1.
const INK = '#121212';
const SUB = '#818181';
const PINK = '#FF5EA8';
const LINE = '#EFEBEC';
const CLARO = '#B5AEB1';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const LADO = 17;              // laterais da página (v1)
const PAD = 18;               // dentro dos cards

// Os elementos que entram na sua vez (a ordem da página).
const EL = {
  abertura: 0, rotina: 1, ajustar: 2,
  cabCaminho: 3, jornada: 4, aviso: 5, cabResultados: 6, resultados: 7,
  cabLeva: 8, item1: 9, item2: 10, item3: 11, item4: 12,
} as const;
const N_EL = 13;

/** RESULTADOS REAIS — os MESMOS da tela "Transformação real" (`transformacao.tsx`, pedido
 *  do produto em 04/nov/2026): as duas fotos, o nome e a cidade. Regra desta seção (pedido
 *  do produto): só fotos REAIS de uma usuária, com autorização, nunca geradas por IA nem
 *  pessoa inventada. O PRODUTO CONFIRMOU (04/nov/2026, e reafirmou): as duas fotos são da
 *  mesma usuária, reais, tiradas com alguns anos de diferença, e há autorização de uso da
 *  imagem das duas. (Uma imagem gerada enviada depois saiu da foto do depois — mesmo fundo —,
 *  mas não foi usada.) Veracidade e autorização: responsabilidade do produto; guardar a
 *  autorização por escrito. */
const RESULTADO_REAL: { nome: string | null; cidade: string | null; antes: number | null; depois: number | null } = {
  nome: 'Larissa Cavalcante',
  cidade: 'Ribeirão Preto, SP',
  antes: require('../../assets/onboarding/transformacao/antes.jpg'),
  depois: require('../../assets/onboarding/transformacao/depois.jpg'),
};

// ── Dados ────────────────────────────────────────────────────────────────────
const NOME_QUEIXA: Record<string, string> = { 'Acne/espinhas': 'Acne e espinhas' };

// ⚠️ PROVISÓRIO (06/nov/2026, pedido do produto): os passos de manhã e de noite do card. A
// rotina só é gerada DEPOIS da compra (a análise completa saiu de antes do paywall), então
// esta tela não tem a contagem real. Trocar quando houver uma decisão do produto.
const PASSOS_PROVISORIOS = { manha: 4, noite: 3 };

/** "Acne e espinhas" (1 queixa) · "Acne, manchas e cravos" (várias, na ordem das opções). */
const QUEIXA_NA_LISTA: Record<string, string> = { 'Acne/espinhas': 'acne' };
function textoFoco(concerns: string[]): string | null {
  const marcadas = CONCERN_LABELS.filter((c) => c !== 'Outro' && concerns.includes(c));
  if (!marcadas.length) return null;
  if (marcadas.length === 1) return NOME_QUEIXA[marcadas[0]] ?? marcadas[0];
  const nomes = marcadas.map((c) => (QUEIXA_NA_LISTA[c] ?? c).toLowerCase());
  const t = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function textoRegiao(regioes: string[]): string | null {
  const validas = regioes.filter((r): r is Regiao => ['testa', 'nariz', 'bochechas', 'queixo'].includes(r));
  if (!validas.length) return null;
  if (validas.length === 4) return 'Rosto todo';
  const t = focoNome(validas);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Ícones (traço 2, cantos redondos, como na v1) ───────────────────────────
const I = {
  raios: 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  lua: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  subida: 'M3.5 17.5l6-6 4 4 7-7.5M15 8h5.5v5.5',
  presente: 'M4 11h16v9H4zM3 7.5h18V11H3zM12 7.5V20M12 7.5C10.5 4 7 4 7 6s2.5 1.5 5 1.5c2.5 0 5 .5 5-1.5s-3.5-2-5 1.5',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  lista: 'M10 6h10M10 12h10M10 18h10M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  codigo: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 8v8M11 8v8M14 8v8M17 8v8',
  sino: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  foto: 'M4 6h16v13H4zM4 16l4.5-4.5 4 4 3-3L20 17M15.5 9.5h.01',
};
type IconeProps = { d?: string; cor?: string; tam?: number; larg?: number; tipo?: 'sol' | 'alvo' | 'rotina' };
function Icone({ d, cor = PINK, tam = 22, larg = 2, tipo }: IconeProps) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      {tipo === 'sol' ? (
        <>
          <Circle cx={12} cy={12} r={4} fill="none" stroke={cor} strokeWidth={larg} />
          <Path d={I.raios} fill="none" stroke={cor} strokeWidth={larg} strokeLinecap="round" />
        </>
      ) : tipo === 'alvo' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} fill="none" stroke={cor} strokeWidth={larg} />
          <Circle cx={12} cy={12} r={4} fill="none" stroke={cor} strokeWidth={larg} />
        </>
      ) : tipo === 'rotina' ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={3} fill="none" stroke={cor} strokeWidth={larg} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke={cor} strokeWidth={larg} strokeLinecap="round" />
        </>
      ) : (
        <Path d={d} fill="none" stroke={cor} strokeWidth={larg} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}

/** O check do topo — o do Tapfit (medido na gravação: anel de ~50 pt SEM preenchimento,
 *  traço de ~3 pt em degradê na diagonal, check grosso de pontas redondas no meio) nas
 *  cores do NIKS: o anel vai do rosa da marca (embaixo, à esquerda) ao rosa claro das cartas
 *  raras (#FF9BC8, em cima, à direita) e o check é rosa (o branco do Tapfit sumiria no
 *  fundo branco). 04/nov/2026, pedido do produto. */
const CHECK_TAM = 52;
const CHECK_D = (() => {
  const k = (CHECK_TAM * 0.44) / 14;   // largura do check (14 no 24 × 24) → 44% do anel
  const p = (x: number, y: number) => `${(CHECK_TAM / 2 + (x - 12) * k).toFixed(2)} ${(CHECK_TAM / 2 + (y - 12.25) * k).toFixed(2)}`;
  return `M${p(5, 12.5)} L${p(9.5, 17)} L${p(19, 7.5)}`;
})();
function CheckAnel() {
  const r = (CHECK_TAM - 3.2) / 2;
  return (
    <Svg width={CHECK_TAM} height={CHECK_TAM} accessibilityLabel="Pronto">
      <Defs>
        <SvgGradient id="anelCheck" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={PINK} />
          <Stop offset="1" stopColor="#FF9BC8" />
        </SvgGradient>
      </Defs>
      <Circle cx={CHECK_TAM / 2} cy={CHECK_TAM / 2} r={r} fill="none" stroke="url(#anelCheck)" strokeWidth={3.2} />
      {/* Check centrado no anel (04/nov/2026, pedido do produto: antes ele ficava baixo e
          grande): o check dos ícones do app (24 × 24: 5,12,5 → 9,5,17 → 19,7,5) com o
          retângulo dele no CENTRO do anel e 44% do diâmetro de largura. */}
      <Path d={CHECK_D} fill="none" stroke={PINK} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Peças (estilos da v1) ────────────────────────────────────────────────────
const tituloSecao = { textAlign: 'center' as const, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3, color: INK };
const cartao = {
  borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE,
  shadowColor: INK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 12,
};
const Divisor = () => <View style={{ marginTop: 32, height: 1, backgroundColor: LINE, marginHorizontal: 8 }} />;
// Título da tela (o da v1: 28/33 em negrito, centrado).
const tituloTela = { alignSelf: 'stretch' as const, fontSize: 28, lineHeight: 33, fontWeight: '700' as const, letterSpacing: -0.4, color: INK, textAlign: 'center' as const };
// Rótulo pequeno e espaçado (o "HOJE"/"SUA META" do "Sua evolução", o "COMUNIDADE"…).
const rotuloPequeno = { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 1.4, color: SUB };

/** Cabeçalho de seção da v1: ícone + título 22 centrado; a frase cinza embaixo. */
function Cabecalho({ icone, titulo, frase }: { icone: React.ReactNode; titulo: string; frase?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {icone}
        <Text style={tituloSecao}>{titulo}</Text>
      </View>
      {!!frase && <Text style={{ fontSize: 17, lineHeight: 23, color: SUB, textAlign: 'center' }}>{frase}</Text>}
    </View>
  );
}

/** Uma coluna da parte de baixo do card da rotina: ícone rosa + período, e o nº de passos. */
function Periodo({ tipo, d, periodo, n }: { tipo?: 'sol'; d?: string; periodo: string; n: number | null }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icone tipo={tipo} d={d} tam={18} />
        <Text style={{ fontSize: 15, lineHeight: 20, color: SUB }}>{periodo}</Text>
      </View>
      <Text style={{ fontSize: 17, lineHeight: 32, color: INK }}>
        <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: PINK }}>{n == null ? '…' : n}</Text>
        {n == null ? '' : n === 1 ? ' passo' : ' passos'}
      </Text>
    </View>
  );
}

/** O card da rotina (04/nov/2026, pedido do produto): UM card só, sem cards dentro e sem
 *  rosto nem imagem. Em cima, "SEU FOCO", o problema em destaque e a região; uma divisória
 *  fina; embaixo, manhã | noite em duas colunas (com um fio no meio). Centrado. */
function CardRotina({ foco, regiao, manha, noite }: { foco: string | null; regiao: string | null; manha: number | null; noite: number | null }) {
  const temTopo = !!foco || !!regiao;
  return (
    <View style={[cartao, { paddingTop: 20, paddingBottom: 16, paddingHorizontal: PAD }]}>
      {temTopo && (
        <View style={{ alignItems: 'center' }}>
          <Text style={rotuloPequeno}>SEU FOCO</Text>
          {!!foco && (
            <Text style={{ marginTop: 6, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5, color: INK, textAlign: 'center' }}>{foco}</Text>
          )}
          {!!regiao && (
            <Text style={{ marginTop: foco ? 2 : 6, fontSize: 17, lineHeight: 22, color: SUB, textAlign: 'center' }}>{regiao}</Text>
          )}
          <View style={{ alignSelf: 'stretch', height: 1, backgroundColor: LINE, marginTop: 18, marginBottom: 14 }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Periodo tipo="sol" periodo="Manhã" n={manha} />
        <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: LINE, marginVertical: 4 }} />
        <Periodo d={I.lua} periodo="Noite" n={noite} />
      </View>
    </View>
  );
}

/** Item do "O que você leva" — o card da semana da v1: ícone rosa, título e texto. */
function Item({ icone, titulo, texto }: { icone: React.ReactNode; titulo: string; texto: string }) {
  return (
    <View style={[cartao, { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      {icone}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: INK }}>{titulo}</Text>
        <Text style={{ fontSize: 15, lineHeight: 20, color: SUB }}>{texto}</Text>
      </View>
    </View>
  );
}

/** Metade do "antes | depois": a foto real ou o espaço vazio marcado. */
function Slot({ foto, selo, seloRosa }: { foto: number | null; selo: string; seloRosa?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#FAF7F8', borderWidth: foto ? 0 : 1.5, borderColor: LINE, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {foto ? (
          <Image source={foto} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        ) : (
          <>
            <Icone d={I.foto} cor="#C9C1C4" tam={26} larg={1.8} />
            <Text style={{ fontSize: 13, lineHeight: 17, color: SUB, textAlign: 'center' }}>{'Foto real\nautorizada'}</Text>
          </>
        )}
      </View>
      <View style={{ position: 'absolute', top: -11, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ height: 22, paddingHorizontal: 10, borderRadius: 11, backgroundColor: seloRosa ? PINK : INK, justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: '#FFFFFF' }}>{selo}</Text>
        </View>
      </View>
    </View>
  );
}

// ── A jornada do "Seu caminho" (mesma trilha, mesmos pontos, mesma coreografia) ─
// A trilha do Tapfit normalizada: (0, 0) = 1º ponto, (1, 1) = flor; pontos 2 e 3 nos nós 6 e 10.
const TRILHA: [number, number][] = [
  [0, 0], [0.026, 0.07], [0.09, 0.129], [0.226, 0.187], [0.344, 0.245], [0.397, 0.304],
  [0.411, 0.377], [0.454, 0.479], [0.523, 0.537], [0.591, 0.595], [0.634, 0.714],
  [0.739, 0.828], [0.895, 0.887], [1, 1],
];
const I_P2 = 6;
const I_P3 = 10;
const X_P1 = 0.174;           // fração da largura da TELA (como no "Seu caminho")
const X_FLOR = 0.8;
const R = 18;
const FLOR = 36;
const HALO = 62;
const FIM_BAIXO = 46;
const GAP_TXT = 12;
const JORNADA_H = 400;        // a altura máxima da trilha no "Seu caminho"
const LOGO_BRANCO = require('../../assets/onboarding/niks-logo-branco-v3.png');
// Os tempos do "Seu caminho" contados do 1º ponto (lá, 396 ms depois da entrada da tela).
const J = { p1: 378, linha: [100, 560] as const, p2: 275, p3: 408, flor: 570, destaque: 1034 };
const LINHA_CURVA = Easing.bezier(0.5, 0.25, 0.55, 1);
const CRESCE = Easing.out(Easing.cubic);
const ASSENTA = Easing.inOut(Easing.quad);

function caminho(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}
const tituloTxt = { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2, color: INK } as const;
const subTxt = { fontSize: 14, lineHeight: 18, color: SUB } as const;

function PontoJornada({ Icone: Ic }: { Icone: typeof ScanFace }) {
  return (
    <View style={{
      width: 2 * R, height: 2 * R, borderRadius: R, backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: PINK,
      alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(255,94,168,0.25)',
    }}>
      <Ic size={17} color={PINK} strokeWidth={2.2} />
    </View>
  );
}

/** A trilha da jornada. `modo` (escrito pela tela, no thread de UI):
 *   1 = COMEÇO PARADO (o estado inicial): 1º ponto, a linha até a Semana 1 e a Semana 1 —
 *       é o que se vê ao abrir a tela, parado (pedido do produto, 04/nov/2026);
 *   3 = escondida (na abertura ela estava toda abaixo da tela — iPhone pequeno);
 *   2 = anda: a linha continua de onde parou até a flor (ou, se estava escondida, a
 *       coreografia inteira do "Seu caminho").
 *  Os pontos acendem quando a ponta da linha chega neles (a regra do "Seu caminho"). */
function Jornada({ cam, telaW, modo, reduce }: { cam: CaminhoOnboarding; telaW: number; modo: SharedValue<number>; reduce: boolean }) {
  const A = telaW - 2 * LADO;
  const x1 = X_P1 * telaW - LADO;
  const xF = X_FLOR * telaW - LADO;
  const y1 = R + 2;
  const yF = JORNADA_H - FIM_BAIXO;
  const pts = TRILHA.map(([u, v]) => [x1 + u * (xF - x1), y1 + v * (yF - y1)] as [number, number]);
  const [c2x, c2y] = pts[I_P2];
  const [c3x, c3y] = pts[I_P3];
  const d = caminho(pts);
  const yFim = yF - (FLOR + 5) / 2 - 2;
  // Onde a ponta da linha está quando chega em cada ponto (fração do desenho).
  const fracP2 = (c2y - y1) / (yFim - y1);
  const fracP3 = (c3y - y1) / (yFim - y1);

  // Estado inicial = começo parado (com "Reduzir movimento", tudo pronto).
  const p1 = useSharedValue(1);
  const desenho = useSharedValue(reduce ? 1 : fracP2);
  const p2 = useSharedValue(1);
  const p2Vis = useSharedValue(1);
  const p3 = useSharedValue(reduce ? 1 : 0.5);
  const p3Vis = useSharedValue(reduce ? 1 : 0);
  const flor = useSharedValue(reduce ? 1 : 0.55);
  const florVis = useSharedValue(reduce ? 1 : 0);
  const destaque = useSharedValue(reduce ? 1 : 0);
  const onda = useSharedValue(0);
  const feitos = useSharedValue(reduce ? 7 : 1);   // pontos já acesos: 1 = Semana 1, 2 = Semana 2, 4 = flor
  const [altTxt, setAltTxt] = useState<[number, number]>([0, 0]);
  const topoTxt = (cy: number, h: number) => cy - Math.max(R, h / 2);

  // Cada ponto acende (esmaece e cresce 1,05 → 1) quando a ponta da linha chega nele; a
  // flor (1,08 → 1) no fim e, 464 ms depois, a piscada do destaque — como no "Seu caminho".
  useAnimatedReaction(
    () => desenho.get(),
    (p) => {
      if (reduce) return;
      const SOBE = Easing.bezier(0.23, 1, 0.32, 1);
      const pula = (pico: number, sobe: number, volta: number) => withSequence(
        withTiming(pico, { duration: sobe, easing: CRESCE }),
        withTiming(1, { duration: volta, easing: ASSENTA }),
      );
      const f = feitos.get();
      if (!(f & 1) && p >= fracP2) {
        feitos.set(feitos.get() | 1);
        p2Vis.set(withTiming(1, { duration: 140, easing: SOBE }));
        p2.set(pula(1.05, 220, 180));
      }
      if (!(f & 2) && p >= fracP3) {
        feitos.set(feitos.get() | 2);
        p3Vis.set(withTiming(1, { duration: 140, easing: SOBE }));
        p3.set(pula(1.05, 220, 180));
      }
      if (!(f & 4) && p >= 0.97) {
        feitos.set(feitos.get() | 4);
        florVis.set(withTiming(1, { duration: 140, easing: SOBE }));
        flor.set(pula(1.08, 220, 160));
        destaque.set(withDelay(464, withSequence(
          withTiming(1.7, { duration: 150, easing: CRESCE }),
          withTiming(1, { duration: 230, easing: ASSENTA }),
        )));
        onda.set(withDelay(464, withTiming(1, { duration: 420, easing: CRESCE })));
      }
    },
  );

  useAnimatedReaction(
    () => modo.get(),
    (m, antes) => {
      if (reduce || m === antes) return;
      if (m === 3) {
        // Estava toda abaixo da tela na abertura: some, para fazer a coreografia inteira.
        p1.set(0); desenho.set(0); p2Vis.set(0); p2.set(0.5); feitos.set(0);
      } else if (m === 2) {
        if (desenho.get() >= fracP2 - 0.001) {
          // Continua do começo parado: da Semana 1 até a flor.
          desenho.set(withDelay(120, withTiming(1, { duration: Math.round(900 * (1 - fracP2)), easing: LINHA_CURVA })));
        } else {
          // A coreografia inteira do "Seu caminho": 1º ponto, e a linha desce até a flor.
          p1.set(withTiming(1, { duration: J.p1, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
          desenho.set(withDelay(J.linha[0], withTiming(1, { duration: J.linha[1], easing: LINHA_CURVA })));
        }
      }
    },
  );

  // Máscara de borda horizontal: o recorte desce e o conteúdo sobe o mesmo tanto.
  const janelaStyle = useAnimatedStyle(() => {
    const p = desenho.get();
    return { opacity: p > 0 ? 1 : 0, transform: [{ translateY: p >= 1 ? 0 : y1 + p * (yFim - y1) - JORNADA_H }] };
  });
  const conteudoStyle = useAnimatedStyle(() => {
    const p = desenho.get();
    return { transform: [{ translateY: p >= 1 ? 0 : JORNADA_H - (y1 + p * (yFim - y1)) }] };
  });
  const p1Style = useAnimatedStyle(() => ({ opacity: p1.get(), transform: [{ translateY: (1 - p1.get()) * 6 }] }));
  const p2Style = useAnimatedStyle(() => ({ opacity: p2Vis.get(), transform: [{ scale: p2.get() }] }));
  const p3Style = useAnimatedStyle(() => ({ opacity: p3Vis.get(), transform: [{ scale: p3.get() }] }));
  const florStyle = useAnimatedStyle(() => ({ opacity: florVis.get(), transform: [{ scale: flor.get() }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.22 + 0.1 * destaque.get(), transform: [{ scale: 1 + 0.12 * destaque.get() }] }));
  const florIconeStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * destaque.get() }] }));
  const brilhoStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, destaque.get()) }));
  const ondaStyle = useAnimatedStyle(() => {
    const p = onda.get();
    return { opacity: p > 0 ? 0.5 * (1 - p) : 0, transform: [{ scale: 1 + 0.9 * p }] };
  });
  const grupo = (cx: number, cy: number) => ({
    position: 'absolute' as const, left: 0, top: 0, width: A, height: JORNADA_H, transformOrigin: [cx, cy, 0],
  });

  return (
    <View
      accessible
      accessibilityLabel={`${cam.pontos.map((p) => `${p.titulo}, ${p.sub}`).join('. ')}. ${cam.final.titulo}, ${cam.final.sub}.`}
      style={{ width: A, height: JORNADA_H }}
    >
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: A, height: JORNADA_H, overflow: 'hidden' }, janelaStyle]}>
        <Animated.View style={conteudoStyle}>
          <Svg width={A} height={JORNADA_H}>
            <Path d={d} fill="none" stroke={PINK} strokeOpacity={0.18} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} fill="none" stroke={PINK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* 1º ponto: texto à direita */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: A, height: JORNADA_H }, p1Style]}>
        <View style={{ position: 'absolute', left: x1 - R, top: y1 - R }}><PontoJornada Icone={ScanFace} /></View>
        <View style={{ position: 'absolute', left: x1 + R + GAP_TXT, right: 0, top: y1 - R }}>
          <BalancedText style={tituloTxt} text={cam.pontos[0].titulo} />
          <BalancedText style={subTxt} text={cam.pontos[0].sub} />
        </View>
      </Animated.View>

      {/* 2º ponto: texto à direita */}
      <Animated.View pointerEvents="none" style={[grupo(c2x, c2y), p2Style]}>
        <View style={{ position: 'absolute', left: c2x - R, top: c2y - R }}><PontoJornada Icone={ListChecks} /></View>
        <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setAltTxt((v) => (v[0] === h ? v : [h, v[1]])); }} style={{ position: 'absolute', left: c2x + R + GAP_TXT, right: 0, top: topoTxt(c2y, altTxt[0]) }}>
          <BalancedText style={tituloTxt} text={cam.pontos[1].titulo} />
          <BalancedText style={subTxt} text={cam.pontos[1].sub} />
        </View>
      </Animated.View>

      {/* 3º ponto: texto à esquerda */}
      <Animated.View pointerEvents="none" style={[grupo(c3x, c3y), p3Style]}>
        <View style={{ position: 'absolute', left: c3x - R, top: c3y - R }}><PontoJornada Icone={ShoppingBag} /></View>
        <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setAltTxt((v) => (v[1] === h ? v : [v[0], h])); }} style={{ position: 'absolute', left: 0, width: c3x - R - GAP_TXT, top: topoTxt(c3y, altTxt[1]) }}>
          <BalancedText style={[tituloTxt, { textAlign: 'right' }]} text={cam.pontos[2].titulo} />
          <BalancedText style={[subTxt, { textAlign: 'right' }]} text={cam.pontos[2].sub} />
        </View>
      </Animated.View>

      {/* A flor do NIKS no fim, com halo e o destaque; o texto final à esquerda dela */}
      <Animated.View pointerEvents="none" style={[grupo(xF, yF), florStyle]}>
        <View style={{ position: 'absolute', left: xF - HALO / 2, top: yF - HALO / 2, width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, backgroundColor: PINK }, haloStyle]} />
          <Animated.View style={[{ position: 'absolute', width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2, borderWidth: 2, borderColor: PINK }, ondaStyle]} />
          <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, florIconeStyle]}>
            <Animated.View style={[{
              position: 'absolute', width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2,
              backgroundColor: PINK, boxShadow: '0px 0px 16px 3px rgba(255,94,168,0.55)',
            }, brilhoStyle]} />
            <View style={{ width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: FLOR, height: FLOR, borderRadius: FLOR / 2, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={LOGO_BRANCO} style={{ width: 24, height: 24 }} />
              </View>
            </View>
          </Animated.View>
        </View>
        <View style={{ position: 'absolute', left: 0, width: xF - HALO / 2 - 6, top: yF - 12 }}>
          <BalancedText style={[tituloTxt, { textAlign: 'right' }]} text={cam.final.titulo} />
          <BalancedText style={[subTxt, { textAlign: 'right', color: PINK, fontWeight: '600' }]} text={cam.final.sub} />
        </View>
      </Animated.View>
    </View>
  );
}

// ── Entrada de cada elemento ─────────────────────────────────────────────────
/** N shared values (N fixo: sempre a mesma ordem de hooks). */
function useValores(n: number): SharedValue<number>[] {
  const out: SharedValue<number>[] = [];
  // Começam em 1 (visíveis): o que aparece na abertura fica PARADO, sem piscar; o que está
  // abaixo da tela vai para 0 na 1ª medida (fora da vista) e entra ao rolar.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  for (let i = 0; i < n; i++) out.push(useSharedValue(1));
  return out;
}

/** Um elemento da página: mede a própria posição e entra (sobe 14 pt e acende) quando a
 *  reação da tela libera o seu valor. `parado` = sem a subida (a jornada tem a dela). */
function Elemento({ v, i, medir, reduce, parado, mt = 0, children }: {
  v: SharedValue<number>; i: number; medir: (i: number, y: number) => void; reduce: boolean;
  parado?: boolean; mt?: number; children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => (parado ? {} : {
    opacity: v.get(), transform: [{ translateY: reduce ? 0 : (1 - v.get()) * 14 }],
  }));
  return (
    <Animated.View onLayout={(e) => medir(i, e.nativeEvent.layout.y)} style={[{ marginTop: mt }, style]}>
      {children}
    </Animated.View>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
export default function RotinaProntaV2() {
  const router = useRouter();
  const { track } = useMixpanel();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduce = useReducedMotion();
  const nomeReal = useObName();
  const onboarding = useAppStore((s) => s.onboarding);
  const analiseRapida = useAppStore((s) => s.analiseRapida);
  const regioesFoco = useAppStore((s) => s.regioesFoco);

  // Dados reais; em __DEV__, sem dado, o exemplo do pedido.
  const exemplo = __DEV__;
  const nome = nomeReal || (exemplo ? 'Ana' : '');
  const pele = objetivoPele(onboarding.goal_desire)?.pele ?? (exemplo ? 'pele de vidro' : null);
  const manha = PASSOS_PROVISORIOS.manha;
  const noite = PASSOS_PROVISORIOS.noite;
  // A carta que ela viu: o foco e a jornada usam o MESMO problema. Sem carta (só em teste),
  // o exemplo do pedido: pele de 34, ela de 28.
  const cartaVista = cartaDoOnboarding(analiseRapida, onboarding);
  const carta = cartaVista ?? (exemplo ? { tipo: 'idade' as const, idadePele: 34, idadeReal: 28 } : null);
  const queixaDaCarta = cartaVista?.tipo === 'comparacao'
    ? Object.keys(PROBLEMA_DA_QUEIXA).find((q) => PROBLEMA_DA_QUEIXA[q] === cartaVista.problema) ?? null
    : onboarding.concerns.find((c) => c !== 'Outro') ?? null;
  // "SEU FOCO" = TODAS as queixas marcadas em "o que mais te incomoda" (08/nov/2026, pedido do
  // produto: com acne, manchas e cravos marcados aparecia só "Manchas", o problema da carta),
  // na ordem das opções da tela. Sem queixa marcada, o problema da carta.
  const foco = textoFoco(onboarding.concerns)
    ?? (queixaDaCarta ? (NOME_QUEIXA[queixaDaCarta] ?? queixaDaCarta) : exemplo ? 'Acne e espinhas' : null);
  const regiao = textoRegiao(regioesFoco) ?? (exemplo ? 'Testa e bochechas' : null);
  const cam = carta ? caminhoDaCarta(carta) : null;

  useOnMount(() => track('onboarding_step_viewed', { ...obStep(STEP, STEP_NAME), variacao: 'v2' }));

  const continuar = () => {
    haptics.action();
    // Também marca o fim do onboarding no Paywallo (`OB_PAYWALLO_LAST`), como a v1.
    track('onboarding_step_completed', { ...obStep(STEP, STEP_NAME), variacao: 'v2' });
    router.push('/(onboarding)/paywall-soft' as any);
  };

  // ── Quem entra e quando (thread de UI) ────────────────────────────────────
  const valores = useValores(N_EL);
  const scrollY = useSharedValue(0);
  const posicoes = useSharedValue<number[]>(Array(N_EL).fill(-1));
  // 0 = ainda não medido; 1 = à vista (parado ou já entrou); 2 = esperando a rolagem.
  const estado = useSharedValue<number[]>(Array(N_EL).fill(0));
  const modoJornada = useSharedValue(1);   // ver `Jornada`: 1 parado · 2 anda · 3 escondida
  const ys = useRef<number[]>(Array(N_EL).fill(-1));
  const medir = (i: number, y: number) => {
    if (ys.current[i] === y) return;
    ys.current[i] = y;
    posicoes.set([...ys.current]);
  };

  const rolar = useAnimatedScrollHandler((e) => { scrollY.set(e.contentOffset.y); });
  // Altura À VISTA da página (a rolagem começa abaixo da barra de status): até um pouco
  // acima do botão fixo (60 pt a insets.bottom + 22 da base).
  const visivelAte = H - insets.top - (insets.bottom + 22 + 60 + 16);
  // Altura da janela de rolagem (o que cabe na tela, até atrás do botão).
  const janela = H - insets.top;
  useAnimatedReaction(
    () => ({ y: scrollY.get(), pos: posicoes.get() }),
    ({ y, pos }) => {
      const est = estado.get();
      let novo: number[] | null = null;
      let fila = 0;
      for (let i = 0; i < N_EL; i++) {
        if (pos[i] < 0 || est[i] === 1) continue;
        if (est[i] === 0) {
          // 1ª medida. Na tela ao abrir → fica PARADO como está (pedido do produto: a tela
          // abre estática). Abaixo da tela → esconde (fora da vista) e espera a rolagem.
          if (!novo) novo = est.slice();
          if (y < 1 && pos[i] < janela) {
            novo[i] = 1;
          } else {
            novo[i] = 2;
            valores[i].set(0);
            if (i === EL.jornada) modoJornada.set(3);
          }
          continue;
        }
        // Esperando: entra quando o topo passa 24 pt acima do que está à vista (a jornada,
        // de 400 pt, com uns 220 pt à vista, para a linha descer diante dela).
        if (pos[i] + (i === EL.jornada ? 220 : 24) > y + visivelAte) continue;
        if (!novo) novo = est.slice();
        novo[i] = 1;
        valores[i].set(withDelay(fila * 70, withTiming(1, { duration: reduce ? 250 : 380, easing: EASE_OUT })));
        if (i === EL.jornada) modoJornada.set(2);
        fila++;
      }
      if (novo) estado.set(novo);
      // A jornada que abriu PARADA (1º ponto, linha até a Semana 1) continua quando ela
      // começa a rolar e a trilha já está à vista até a Semana 2.
      const pj = pos[EL.jornada];
      if (modoJornada.get() === 1 && pj >= 0 && y > 8 && pj + 260 <= y + visivelAte) modoJornada.set(2);
    },
  );

  const el = (k: keyof typeof EL, mt: number, filho: React.ReactNode, parado?: boolean) => (
    <Elemento key={k} v={valores[EL[k]]} i={EL[k]} medir={medir} reduce={reduce} parado={parado} mt={mt}>{filho}</Elemento>
  );
  const slotH = Math.round((W - 2 * LADO - 2 * PAD) / 1.5);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="dark" />
      {/* Como na v1: a rolagem começa ABAIXO da barra de status. */}
      <Animated.ScrollView
        onScroll={rolar}
        scrollEventThrottle={16}
        style={{ marginTop: insets.top }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 34, paddingHorizontal: LADO, paddingBottom: 170 }}
      >
        {el('abertura', 0, (
          <View style={{ alignItems: 'center' }}>
            <CheckAnel />
            {/* Duas linhas fixas, cada uma em UMA linha que encolhe se não couber (até 72%):
                no iPhone SE a 1ª quebrava e deixava "uma" sozinho (visto em 04/nov/2026). */}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[tituloTela, { marginTop: 20 }]}>
              {`${nome ? `${nome}, sua` : 'Sua'} rotina ${pele ? 'para ter uma' : 'está pronta.'}`}
            </Text>
            {!!pele && (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={tituloTela}>
                <Text style={{ color: PINK }}>{pele}</Text>
                {' está pronta.'}
              </Text>
            )}
          </View>
        ))}

        {/* A rotina: um card só (foco + região em cima; manhã | noite embaixo) */}
        {el('rotina', 28, <CardRotina foco={foco} regiao={regiao} manha={manha} noite={noite} />)}
        {el('ajustar', 10, (
          <Text style={{ textAlign: 'center', fontSize: 14, lineHeight: 19, color: SUB }}>Você pode ajustar depois.</Text>
        ))}

        {/* Para onde você vai — a jornada do "Seu caminho" */}
        {!!cam && (
          <>
            {el('cabCaminho', 32, <Cabecalho icone={<Icone d={I.subida} cor={INK} tam={20} larg={1.8} />} titulo="Para onde você vai" frase="Da sua pele hoje até a sua meta." />)}
            {el('jornada', 22, <Jornada cam={cam} telaW={W} modo={modoJornada} reduce={reduce} />, true)}
            {el('aviso', 6, (
              <Text style={{ textAlign: 'center', fontSize: 13, lineHeight: 17, color: CLARO }}>Meta estimada. Os resultados podem variar.</Text>
            ))}
          </>
        )}

        <Divisor />

        {/* Resultados reais (vazio até chegarem fotos reais e autorizadas) */}
        {el('cabResultados', 32, <Cabecalho icone={<Icone d={I.foto} cor={INK} tam={20} larg={1.8} />} titulo="Resultados reais" />)}
        {el('resultados', 16, (
          <View style={[cartao, { padding: PAD }]}>
            <View style={{ marginTop: 11, height: slotH, flexDirection: 'row', gap: 8 }}>
              <Slot foto={RESULTADO_REAL.antes} selo="ANTES" />
              <Slot foto={RESULTADO_REAL.depois} selo="DEPOIS" seloRosa />
            </View>
            <Text style={{ marginTop: 14, textAlign: 'center', fontSize: 17, lineHeight: 22 }}>
              <Text style={{ fontWeight: '600', color: RESULTADO_REAL.nome ? INK : CLARO }}>{RESULTADO_REAL.nome ?? 'Nome da usuária'}</Text>
              <Text style={{ color: RESULTADO_REAL.cidade ? SUB : CLARO }}>{`  ·  ${RESULTADO_REAL.cidade ?? 'Cidade, UF'}`}</Text>
            </Text>
          </View>
        ))}

        <Divisor />

        {/* O que você leva */}
        {el('cabLeva', 32, <Cabecalho icone={<Icone d={I.presente} cor={INK} tam={20} larg={1.8} />} titulo="O que você leva" frase="Tudo para cuidar da sua pele" />)}
        {el('item1', 16, <Item icone={<Icone d={I.scan} />} titulo="Análise de pele com IA" texto="Acompanhe a evolução da sua pele." />)}
        {el('item2', 10, <Item icone={<Icone d={I.lista} />} titulo="Rotina personalizada" texto="Passos de manhã e à noite para você." />)}
        {el('item3', 10, <Item icone={<Icone d={I.codigo} />} titulo="Scanner de produtos" texto="Veja a compatibilidade antes de comprar." />)}
        {el('item4', 10, <Item icone={<Icone d={I.sino} />} titulo="Lembretes e cartas" texto="Mantenha sua rotina em dia." />)}
      </Animated.ScrollView>

      {/* Véu + botão fixo (os da v1: degradê de 150 pt, botão de 60 pt a 26 pt das bordas) */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.4]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 }}
      />
      {/* Botão fixo, parado desde a abertura (a tela abre estática). */}
      <View style={{ position: 'absolute', left: 26, right: 26, bottom: insets.bottom + 22 }}>
        <TouchableOpacity
          onPress={continuar}
          activeOpacity={0.85}
          style={{
            height: 60, borderRadius: 30, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
            shadowColor: PINK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15,
          }}
        >
          <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.2, color: '#FFFFFF' }}>Vamos começar!</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
