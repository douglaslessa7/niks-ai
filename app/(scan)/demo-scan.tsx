import { useEffect, useRef, useState } from 'react';
import {
  BackHandler, Image, ImageSourcePropType, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeIn, FadeOut, LinearTransition, SharedValue, cancelAnimation, useAnimatedProps, useAnimatedStyle,
  useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { Contador } from '../../components/cartas/Carta';
import { OB, ObHeader } from '../../components/onboarding/kit';
import { useObPassoVisto } from '../../components/onboarding/passo';
import { OB_STEPS } from '../../components/onboarding/kit';

// Onboarding — demonstração do scan de produto, telas 3 e 4 (04/nov/2026), depois da transição
// rosa "Nem todo produto serve para a sua pele…" (`(scan)/demo-transicao`, que termina com o
// fundo desta tela; por isso ela entra sem animação e o aviso e o botão esmaecem ao montar).
// Uma tela só: o produto escaneado se solta da foto e vira o resultado (tela 4) por cima do scan.
//
// Tela 3: a foto do produto em tela cheia (`FOTO_PRODUTO`), o aviso "Esta foto é nossa." e o
// botão de captura pulsando com "VER O QUE O NIKS LÊ". NÃO abre a câmera nem pede permissão.
// Como no Tapfit, NADA de scan antes do toque (sem linha passando): é o toque (vibração leve)
// que liga os cantos de enquadramento, a linha de scan e as 2 mensagens — a "análise" começa
// porque a pessoa tirou a foto (04/nov/2026, pedido do produto).
// Tela 4 (refeita em 04/nov/2026, pedido do produto — SEM carta): acabou o scan, o frasco
// (recortado, sem fundo) se solta da foto e vem para o meio da tela enquanto o rosa nasce dele;
// no meio ele dá UMA VOLTA inteira e sobe para o topo da tela, ainda grande — ver `VOO`. Embaixo
// SOBE UMA FOLHA da borda de baixo da tela (05/nov/2026, pedido do produto, no molde da folha do
// scan do prato do Tapfit), no desenho do Claude Design "NIKS Scan Resultado v5" (ver `DS`):
// "✓ ANALISADO PELO NIKS", o nome do produto, "POR QUE NÃO RECOMENDAMOS" com os motivos se
// escrevendo palavra por palavra e, embaixo, "COMPATIBILIDADE" + "Não recomendado" em vermelho
// (entra com a vibração forte no mesmo quadro) ao lado do anel que enche e conta de 0 a 22%; por
// último o botão rosa, dentro da folha.
//
// RITMO DO SCAN (t = 0 no toque) — a ordem é a do vídeo do Tapfit (`~/Downloads/ScreenRecording_
// 11-04-2026 13-35-44_1.MP4`), os tempos são mais lentos para dar tempo de ler (04/nov/2026):
//    0 ms      o aviso e o botão somem; entram os cantos e a pílula com a 1ª frase
//    1700 ms   troca a frase (o texto antigo some, a pílula ajusta a largura e o novo esmaece)
//    200 ms e 1900 ms  a linha desce a tela inteira, 900 ms cada (com uma cauda iluminada)
//    3400 ms   o resultado entra
// (No Tapfit: 4 mensagens em 0/570/1170/1720 ms, linhas de 630 ms em 190/1325 ms, resultado
// aos 2240 ms.)
// O resultado FIXO é igual para todas (22%, não recomendado); nada é gravado
// (nem no histórico de scans, nem no store): a rotina, que começou a ser gerada na pergunta da
// água, segue em segundo plano sem ser tocada.
// "Reduzir movimento": sem linha, sem pulso, sem o produto voando e girando e sem a cascata do
// conteúdo — o rosa, o frasco (já no topo) e o resultado só esmaecem; o número
// aparece pronto.

/** Foto do produto da demonstração (04/nov/2026, enviada pelo produto), em tela cheia no scan.
 *  `null` = espaço neutro (sem foto). Gerada da foto enviada no chat em 04/nov/2026, 1180 × 2114
 *  → 1116 × 2000.
 *  ⚠️ A foto mostra um produto de MARCA REAL — ver a nota da linha 11e do README. */
const FOTO_PRODUTO: ImageSourcePropType | null = require('../../assets/onboarding/demo-produto-foto.jpg');
/** Nome do produto no card do resultado. */
const NOME_PRODUTO = 'Gel de Limpeza Principia';

// As frases da "análise" (04/nov/2026, pedido do produto: "analisando componentes,
// verificando…"), em maiúsculas espaçadas como no Tapfit ("OLHANDO O PRATO…") e no nosso
// "VER O QUE O NIKS LÊ" — a caixa alta vem do estilo (`textTransform`), o leitor de tela lê normal.
// Só 2 frases, cada uma ≈ 1,7 s na tela para dar tempo de ler (pedido do produto, 04/nov/2026).
const MENSAGENS = [
  'Analisando componentes...',
  'Verificando a compatibilidade...',
];
// Mais devagar que o Tapfit (lá: 4 mensagens a cada ~0,55 s, linhas de 630 ms e resultado aos
// 2,24 s): uma passada da linha por frase, 900 ms cada, e o resultado aos 3,4 s.
const T = {
  mensagens: [0, 1700],
  varreduras: [200, 1900],
  varreduraMs: 900,
  resultado: 3400,
};
const COMPATIBILIDADE = 22;

// Os motivos do "Por que não recomendamos" (04/nov/2026 — texto PROPOSTO, esperando o Douglas).
// Como o resultado é fixo e igual para todas, falam do encaixe com a pele, nunca de defeito do
// produto. 06/nov/2026 (pedido do produto): saiu o 1º, "Ele é feito para pele normal a oleosa."
// (vinha do rótulo do CeraVe; a foto agora é a da Principia) — ficam dois.
const MOTIVOS = [
  'A espuma pode ressecar e deixar a pele repuxando.',
  'Os ativos são bons, mas não são os que a sua pele precisa agora.',
];
// A entrada do conteúdo da folha (05/nov/2026, pedido do produto: rápida, suave, de cima para
// baixo, e o anel por último): um relógio só (`cascata`, em ms) e cada item — o rótulo, o nome,
// "POR QUE NÃO RECOMENDAMOS", cada motivo, "COMPATIBILIDADE / Não recomendado" e, por último, o
// anel dos 22% — esmaece e sobe 10 pt em `dur` ms, `passo` ms depois do anterior. Quando o anel
// aparece, ele enche e o número conta.
// `itens` = rótulo, nome, título, os motivos, compatibilidade e o anel.
const CASCATA = { passo: 60, dur: 340, itens: 5 + MOTIVOS.length };
const CASCATA_FIM = (CASCATA.itens - 1) * CASCATA.passo + CASCATA.dur;
// A contagem do número/anel, mais curta que a da carta (1,3 s): a compatibilidade é o momento
// principal, mas não pode demorar.
const CONTA_RAPIDA = 900;

// O produto do resultado: o frasco INTEIRO recortado da foto do scan, sem fundo e sem a mão
// (`demo-produto-recorte.png`, 403 × 1482, PNG transparente). 06/nov/2026: a foto passou a ser a
// do Gel de Limpeza da Principia (GL-01) na mão, enviada pelo produto (era o CeraVe); o recorte
// foi refeito com o recorte de objeto do macOS (Vision), que pega mão + frasco, e a mão cortada
// pelo contorno do frasco (bordas medidas nas linhas em que a mão não encosta; canto de baixo espelhado do lado direito). O
// frasco é translúcido: um pouco da farmácia aparece por dentro, como na foto. `RECORTE` é onde
// ele está na foto (`demo-produto-foto.jpg`, 1180 × 2114), em pixels: no começo ele cai
// EXATAMENTE em cima do frasco da foto. Troque os dois junto com `FOTO_PRODUTO`.
const FOTO_RECORTE: ImageSourcePropType | null = require('../../assets/onboarding/demo-produto-recorte.png');
const RECORTE = { foto: { w: 1180, h: 2114 }, x: 398, y: 165, w: 403, h: 1482 };
// A sombra do frasco, pronta (o contorno do recorte em vinho e desfocado, 149 × 418 = o recorte
// reduzido 4× (101 × 370) com 24 px de folga em volta para o desfoque não ser cortado). Feita à
// parte porque `tintColor` + `blurRadius` no iOS saía como um brilho branco com borda reta.
const SOMBRA_RECORTE = require('../../assets/onboarding/demo-produto-recorte-sombra.png');
const SOMBRA = { w: 149, h: 418, dentroW: 101, dentroH: 370, folga: 24 };
// A transição scan → resultado (ms desde o fim do scan), um movimento só, tudo no thread de UI e
// com todas as camadas JÁ MONTADAS desde a abertura da tela (a troca de fase não monta nada —
// montar o recorte no 1º quadro do movimento fazia ele engasgar):
//    0–1000    o frasco se solta e VEM PARA O MEIO (ease-in-out: nos primeiros ~0,3 s ele quase
//              não sai do lugar — só ganha sombra e começa a crescer —, então segue cobrindo o
//              frasco da foto até o rosa chegar): cresce até 12% (sem passar de 66% da altura)
//    0–900     o ROSA NASCE DO PRODUTO: um brilho rosa que começa escondido atrás do frasco, aparece
//              em volta dele por volta de 0,2 s, viaja com ele e incha até cobrir a tela entre
//              ~0,45 e 0,7 s; aos 750 ms o fundo rosa final esmaece por baixo dele
//    850–2050  GIRA uma volta inteira no eixo Y (as duas faces mostram o rótulo; "pulo" de 4% no
//              meio) — começa ainda no fim da chegada, sem parada
//    1050–2050 SOBE para o topo da tela e encolhe até o tamanho final (o maior que cabe acima do
//              resultado, até 42% da altura da tela) — giro e subida terminam juntos
//    1750      a folha do resultado sobe (500 ms); o conteúdo entra em cascata de cima para baixo
//              (`CASCATA`, ≈ 0,8 s) com "Não recomendado" antes do anel; por último o anel aparece,
//              enche e conta (`CONTA_RAPIDA`, 0,9 s) e vem o botão (tempos em `mostrarResultado`;
//              ≈ 3,4 s depois do scan)
const VOO = { frente: 1000, rosa: 900, veu: [750, 300], gira: [850, 1200], sobe: [1050, 1000], info: 1750 };
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);   // a chegada ao meio
const GIRA = Easing.bezier(0.42, 0, 0.2, 1);            // giro e subida: saem macios e assentam longo
const VARRE = Easing.bezier(0.42, 0, 0.58, 1);          // a linha do Tapfit acelera, anda e assenta
const CAUDA = 120;                                       // altura da cauda iluminada acima da linha
const BTN = 72;
const BOTAO_H = 56;

type Fase = 'pronto' | 'escaneando' | 'resultado';

/** Onde está o frasco a cada quadro: a chegada ao meio (`f`), a subida (`s`) e o "pulo" do giro
 *  (`g`). A escala é relativa ao tamanho do frasco na foto. */
function movimento(
  f: number, s: number, g: number,
  dx: number, dy: number, dyTopo: number, emFoco: number, escTopo: number,
) {
  'worklet';
  const noMeio = 1 + (emFoco - 1) * f;
  return {
    tx: dx * (1 - f),
    ty: dy * (1 - f) + dyTopo * s,
    escala: (noMeio + (escTopo - noMeio) * s) * (1 + 0.04 * Math.sin(Math.PI * g)),
  };
}


// O resultado é uma FOLHA que sobe da borda de baixo e cobre a parte de baixo da tela (05/nov/2026,
// pedido do produto, no molde da folha do scan do prato do Tapfit). O DESENHO da folha é o do
// Claude Design "NIKS Scan Resultado v5" (projeto "NIKS Onboarding Modelos", 05/nov/2026; só o card
// foi trazido, com as medidas de lá): branca, cantos de cima de 32, "✓ ANALISADO PELO NIKS" rosa,
// o nome em 28, "POR QUE NÃO RECOMENDAMOS" com os motivos (tracinho rosa 10 × 3, fio #F0ECEE
// embaixo de cada linha) e, embaixo, "COMPATIBILIDADE" + "Não recomendado" em vermelho à esquerda e
// o anel de 88 (traço 9, trilho #F3EDF0, arco vermelho com brilho, "22%" em tinta no meio) à
// direita; o botão rosa centrado. Cores do resultado = a opção "Vermelho" do design.
const DS = {
  linha: '#F0ECEE',
  trilho: '#F3EDF0',
  arco: '#EF4444',
  brilho: 'rgba(239,68,68,0.22)',
  veredito: '#D93A3A',
  anel: 88,
  traco: 9,
};
const ANEL_R = 39;
const ANEL_C = 2 * Math.PI * ANEL_R;
const ArcoAnel = Animated.createAnimatedComponent(Circle);
const EASE_FOLHA = Easing.bezier(0.32, 0.72, 0, 1);    // a curva da folha do iOS
// O arco enche na MESMA curva e duração do número (`Contador`: ease-out quártico em `CONTA_RAPIDA`).
const CONTA_CURVA = Easing.out(Easing.poly(4));
const rotuloPequeno = { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 1.4, color: OB.sub };

/** Um item da folha na cascata: esmaece e sobe 10 pt (ease-out cúbico) na vez dele. */
function Entra({ i, t, style, children }: { i: number; t: SharedValue<number>; style?: any; children: React.ReactNode }) {
  const st = useAnimatedStyle(() => {
    const k = Math.min(1, Math.max(0, (t.get() - i * CASCATA.passo) / CASCATA.dur));
    const e = 1 - Math.pow(1 - k, 3);
    return { opacity: e, transform: [{ translateY: (1 - e) * 10 }] };
  });
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

export default function DemoScan() {
  useObPassoVisto(OB_STEPS.demoScan, 'Demo: scan de produto');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduce = useReducedMotion();

  const [fase, setFase] = useState<Fase>('pronto');
  const [msg, setMsg] = useState(0);
  const [numero, setNumero] = useState<number | null>(null);
  const [podeSeguir, setPodeSeguir] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const espera = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Sem voltar durante o scan e no resultado (gesto desligado abaixo; Android aqui).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fase === 'pronto') return false;
      return true;
    });
    return () => sub.remove();
  }, [fase]);

  // ── Tela 3: aviso + botão (pulso) ────────────────────────────────────────────
  const avisoVis = useSharedValue(0);
  const pulso = useSharedValue(0);
  const aperto = useSharedValue(1);
  // A foto, o aviso e o botão esmaecem ao montar (a tela entra sem animação, por cima do mesmo fundo).
  const fotoVis = useSharedValue(0);
  useEffect(() => {
    fotoVis.set(withTiming(1, { duration: 400, easing: EASE_OUT }));
    avisoVis.set(withDelay(120, withTiming(1, { duration: 320, easing: EASE_OUT })));
  }, []);
  // (A foto não recua: encolher deixava aparecer o fundo neutro da tela nas bordas.)
  const fotoStyle = useAnimatedStyle(() => ({ opacity: fotoVis.get() }));
  useEffect(() => {
    if (reduce) return;
    pulso.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(pulso);
  }, [reduce]);
  const avisoStyle = useAnimatedStyle(() => ({ opacity: avisoVis.get() }));
  const pulsoStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulso.get()), transform: [{ scale: 1 + 0.45 * pulso.get() }],
  }));
  const botaoStyle = useAnimatedStyle(() => ({ transform: [{ scale: aperto.get() }] }));

  // ── Scan: cantos e linha ─────────────────────────────────────────────────────
  const cantos = useSharedValue(0);
  const varre = useSharedValue(0);
  const cantosStyle = useAnimatedStyle(() => ({
    opacity: cantos.get(), transform: [{ scale: reduce ? 1 : 1.05 - 0.05 * cantos.get() }],
  }));
  const linhaStyle = useAnimatedStyle(() => {
    const p = varre.get();
    return { opacity: p > 0 && p < 1 ? 1 : 0, transform: [{ translateY: -CAUDA + p * (H + CAUDA) }] };
  });

  // ── Tela 4: véu rosa, o frasco e o resultado (estilos do frasco depois da geometria) ──
  const veu = useSharedValue(0);      // o fundo rosa final (entra por baixo do brilho)
  const rosa = useSharedValue(0);     // o brilho rosa que nasce atrás do frasco e cobre a tela
  const apaga = useSharedValue(0);    // o brilho sai quando o fundo da home já está inteiro por baixo
  const solto = useSharedValue(0);    // o frasco recortado aparece (em cima do da foto) no início
  const frente = useSharedValue(0);   // o frasco vindo para o meio
  const gira = useSharedValue(0);     // a volta inteira: 0 → 1 = 0° → 360°
  const sobe = useSharedValue(0);     // do meio para o topo
  const folha = useSharedValue(0);    // a folha do resultado sobe
  const anel = useSharedValue(0);     // o arco da compatibilidade: 0 → 0,22
  const cascata = useSharedValue(reduce ? CASCATA_FIM : 0);     // relógio da entrada do conteúdo (ms)
  const fimBotao = useSharedValue(0); // "Quero saber o que usar"
  // A folha é medida (`onLayout`) — muda com o tamanho do texto do sistema; o frasco usa o espaço
  // que sobra em cima dela.
  const [infoH, setInfoH] = useState(0);
  const folhaAlt = infoH || 540;
  const veuStyle = useAnimatedStyle(() => ({ opacity: veu.get() }));
  // A folha sobe da borda de baixo (só translateY); com "Reduzir movimento", só esmaece.
  const folhaStyle = useAnimatedStyle(() => (reduce
    ? { opacity: folha.get() }
    : { transform: [{ translateY: (1 - folha.get()) * (folhaAlt + 40) }] }));
  // Em 0% a ponta redonda do arco ainda desenharia um ponto: ele só aparece quando começa a encher.
  const arcoProps = useAnimatedProps(() => ({
    strokeDashoffset: ANEL_C * (1 - anel.get()),
    strokeOpacity: anel.get() > 0.003 ? 1 : 0,
  }));
  const fimBotaoStyle = useAnimatedStyle(() => ({ opacity: fimBotao.get() }));

  const escanear = () => {
    if (fase !== 'pronto') return;
    haptics.tap();                              // vibração leve no toque
    setFase('escaneando');
    setMsg(0);
    cancelAnimation(pulso);
    avisoVis.set(withTiming(0, { duration: 120 }));
    cantos.set(withTiming(1, { duration: 220, easing: EASE_OUT }));
    if (!reduce) {
      const [a, b] = T.varreduras;
      varre.set(withSequence(
        withDelay(a, withTiming(1, { duration: T.varreduraMs, easing: VARRE })),
        withTiming(0, { duration: 0 }),
        withDelay(b - a - T.varreduraMs, withTiming(1, { duration: T.varreduraMs, easing: VARRE })),
      ));
    }
    T.mensagens.slice(1).forEach((ms, i) => espera(ms, () => setMsg(i + 1)));
    espera(T.resultado, mostrarResultado);
  };

  const mostrarResultado = () => {
    setFase('resultado');
    cantos.set(withTiming(0, { duration: 200 }));
    let inicio: number;   // quando o resultado começa a entrar
    if (reduce || !frasco) {
      // Sem voo e sem giro: o fundo rosa e o frasco (já no topo) esmaecem no lugar.
      veu.set(withTiming(1, { duration: 300, easing: EASE_OUT }));
      frente.set(1);
      sobe.set(1);
      solto.set(withTiming(1, { duration: 300, easing: EASE_OUT }));
      inicio = 300;
    } else {
      // Um movimento só: o frasco vem para o meio, o rosa nasce atrás dele e cobre a tela, e ele
      // gira e sobe ainda chegando (sem parada no meio).
      solto.set(1);
      frente.set(withTiming(1, { duration: VOO.frente, easing: EASE_IN_OUT }));
      rosa.set(withTiming(1, { duration: VOO.rosa, easing: EASE_IN_OUT }));
      veu.set(withDelay(VOO.veu[0], withTiming(1, { duration: VOO.veu[1], easing: EASE_OUT })));
      gira.set(withDelay(VOO.gira[0], withTiming(1, { duration: VOO.gira[1], easing: GIRA })));
      sobe.set(withDelay(VOO.sobe[0], withTiming(1, { duration: VOO.sobe[1], easing: GIRA })));
      // O brilho (radial) cobriu a tela e o fundo da home (vertical) já entrou por baixo: o brilho
      // esmaece e fica só o fundo da home. A barra de status fica escura (o rosa é claro).
      apaga.set(withDelay(VOO.veu[0] + VOO.veu[1], withTiming(1, { duration: 400, easing: EASE_OUT })));
      inicio = VOO.info;
    }
    // A folha sobe da borda de baixo → ainda subindo, o conteúdo entra em cascata de cima para
    // baixo (≈ 0,8 s), "COMPATIBILIDADE / Não recomendado" antes do anel → por último o anel
    // aparece, enche e o número conta junto (0 → 22% em 0,9 s) → vibração forte → o botão.
    folha.set(withDelay(inicio, reduce
      ? withTiming(1, { duration: 300, easing: EASE_OUT })
      : withTiming(1, { duration: 500, easing: EASE_FOLHA })));
    const tCascata = inicio + 120;
    if (!reduce) cascata.set(withDelay(tCascata, withTiming(CASCATA_FIM, { duration: CASCATA_FIM, easing: Easing.linear })));
    // O anel é o último item da cascata: a contagem começa quando ele já apareceu quase todo.
    const tConta = reduce ? inicio : tCascata + (CASCATA.itens - 1) * CASCATA.passo + 200;
    espera(tConta, () => setNumero(COMPATIBILIDADE));
    const alvo = COMPATIBILIDADE / 100;
    if (reduce) anel.set(alvo);
    else anel.set(withDelay(tConta, withTiming(alvo, { duration: CONTA_RAPIDA, easing: CONTA_CURVA })));
    const tFim = tConta + (reduce ? 0 : CONTA_RAPIDA);
    espera(tFim, () => haptics.impact());       // mesmo quadro em que o arco assenta nos 22%
    const tBotao = tFim + 180;
    fimBotao.set(withDelay(tBotao, withTiming(1, { duration: 400, easing: EASE_OUT })));
    espera(tBotao, () => setPodeSeguir(true));
  };

  // "Quero saber o que usar" → horário da rotina (04/nov/2026, pedido do produto: resultado →
  // horário → notificações → "Comunidade"). `push`: o voltar da manhã no horário volta para
  // este resultado (a tela continua montada).
  const continuar = () => {
    haptics.action();
    router.push('/(onboarding)/horario' as any);
  };

  // ── Geometria ────────────────────────────────────────────────────────────────
  const labelBottom = insets.bottom + 18;
  const btnBottom = labelBottom + 16 + 14;
  const avisoBottom = btnBottom + BTN + 20;
  const quadro = { left: W * 0.14, right: W * 0.14, top: insets.top + H * 0.1, bottom: H * 0.34 };
  const pilulaBottom = H * 0.34 - 18 - 36;   // logo abaixo do quadro

  // Tela 4: a folha do resultado presa na borda de baixo (o botão dentro dela) e o frasco no espaço
  // que sobra em cima, o maior que couber (até 42% da altura).
  const botaoFimBottom = insets.bottom + 13;
  const infoTop = H - folhaAlt;
  const topoLivre = insets.top + 10;
  const fundoLivre = infoTop - 14;
  const cyFoco = H / 2;   // o meio da tela, onde o frasco fica em foco

  // O frasco na tela: onde ele está na foto do scan (a foto é `cover` na tela inteira), para o
  // recorte começar EXATAMENTE em cima dele — a troca não aparece. Ele é montado já centrado no
  // meio da tela e levado (transform) de volta até a foto no começo.
  let frasco: { w: number; h: number; dx: number; dy: number } | null = null;
  if (FOTO_PRODUTO && FOTO_RECORTE) {
    const { foto } = RECORTE;
    const k = Math.max(W / foto.w, H / foto.h);
    const ox = (W - foto.w * k) / 2;
    const oy = (H - foto.h * k) / 2;
    frasco = {
      w: RECORTE.w * k,
      h: RECORTE.h * k,
      dx: ox + (RECORTE.x + RECORTE.w / 2) * k - W / 2,
      dy: oy + (RECORTE.y + RECORTE.h / 2) * k - cyFoco,
    };
  }
  const fW = frasco?.w ?? 1;
  const fH = frasco?.h ?? 1;
  const fdx = frasco?.dx ?? 0;
  const fdy = frasco?.dy ?? 0;
  // No meio: até 12% maior, sem passar de 66% da altura da tela. No topo: o espaço acima do
  // resultado (no mínimo 120 pt, até 42% da altura), centrado nele.
  const emFoco = Math.min(1.12, (H * 0.66) / fH);
  const altTopo = Math.max(120, Math.min(fundoLivre - topoLivre, H * 0.42));
  const escTopo = altTopo / fH;
  const dyTopo = (topoLivre + fundoLivre) / 2 - cyFoco;

  // O brilho rosa que nasce do produto: um círculo com o degradê do fundo rosa (claro no meio,
  // apagando na borda), centrado no frasco e viajando com ele. Começa menor que a largura do
  // frasco (escondido atrás dele) e incha até a parte cheia cobrir a tela inteira a partir do
  // meio. A camada é ¼ do tamanho final e cresce por `scale` até 4× (só transform; um degradê
  // ampliado não perde nada).
  const cantoLonge = Math.hypot(W / 2, Math.max(cyFoco, H - cyFoco));
  const brilhoD = (2 * (cantoLonge / 0.7)) / 4;          // cheio até 70% do raio
  const brilhoIni = (fW * 0.8) / brilhoD;
  const brilhoStyle = useAnimatedStyle(() => {
    const r = rosa.get();
    const f = frente.get();
    return {
      opacity: Math.min(1, r / 0.03) * (1 - apaga.get()),
      transform: [
        { translateX: fdx * (1 - f) },
        { translateY: fdy * (1 - f) },
        { scale: brilhoIni + (4 - brilhoIni) * r },
      ],
    };
  });

  // As duas faces do frasco giram juntas: a da frente vale de 0° a 90° e de 270° a 360°, a de
  // trás (a MESMA imagem, girada 180° a mais — então o rótulo aparece sempre de frente) no meio.
  const frenteFrascoStyle = useAnimatedStyle(() => {
    const m = movimento(frente.get(), sobe.get(), gira.get(), fdx, fdy, dyTopo, emFoco, escTopo);
    const a = 360 * gira.get();
    return {
      opacity: Math.cos((a * Math.PI) / 180) >= 0 ? solto.get() : 0,
      transform: [
        { perspective: 1400 }, { translateX: m.tx }, { translateY: m.ty }, { rotateY: `${a}deg` }, { scale: m.escala },
      ],
    };
  });
  const versoFrascoStyle = useAnimatedStyle(() => {
    const m = movimento(frente.get(), sobe.get(), gira.get(), fdx, fdy, dyTopo, emFoco, escTopo);
    const a = 360 * gira.get();
    return {
      opacity: Math.cos((a * Math.PI) / 180) < 0 ? solto.get() : 0,
      transform: [
        { perspective: 1400 }, { translateX: m.tx }, { translateY: m.ty }, { rotateY: `${a - 180}deg` }, { scale: m.escala },
      ],
    };
  });
  // A sombra no formato do frasco: chega enquanto ele vem para o meio, não gira (fica no chão) e
  // afina quando ele está de lado.
  const sombraFrascoStyle = useAnimatedStyle(() => {
    const m = movimento(frente.get(), sobe.get(), gira.get(), fdx, fdy, dyTopo, emFoco, escTopo);
    const a = (360 * gira.get() * Math.PI) / 180;
    return {
      opacity: 0.4 * frente.get() * solto.get(),
      transform: [
        { translateX: m.tx }, { translateY: m.ty }, { scale: m.escala }, { scaleX: 0.3 + 0.7 * Math.abs(Math.cos(a)) },
      ],
    };
  });
  const caixaFrasco = { position: 'absolute' as const, left: W / 2 - fW / 2, top: cyFoco - fH / 2, width: fW, height: fH };

  return (
    <View style={{ flex: 1, backgroundColor: '#ECE6E9' }}>
      <Stack.Screen options={{ gestureEnabled: false }} />{/* onboarding: só a setinha volta (12/nov/2026) */}
      <StatusBar style="dark" />

      {/* O fundo neutro fica sempre por baixo (é nele que a transição rosa termina); a foto
          entra esmaecendo por cima, para não aparecer de repente. */}
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(180deg, #F5F1F3 0%, #E6DFE3 100%)' }]} />
      {FOTO_PRODUTO && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fotoStyle]}>
          {/* Largura e altura EXPLÍCITAS: só com `absoluteFill` a foto saía no tamanho dos pixels
              (1116 × 2000 pt), ampliada e cortada (visto no simulador, 04/nov/2026). */}
          <Image source={FOTO_PRODUTO} resizeMode="cover" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
        </Animated.View>
      )}

      {/* Cantos de enquadramento */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', ...quadro }, cantosStyle]}>
        <View style={[styles.canto, { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 10 }]} />
        <View style={[styles.canto, { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 10 }]} />
        <View style={[styles.canto, { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 10 }]} />
        <View style={[styles.canto, { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 10 }]} />
      </Animated.View>

      {/* Linha de scan com a cauda iluminada acima (desce a tela inteira; só depois do toque) */}
      {!reduce && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: CAUDA + 3 }, linhaStyle]}>
          <View style={{ height: CAUDA, experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,94,168,0) 0%, rgba(255,94,168,0.26) 100%)' }} />
          <View style={{ height: 3, backgroundColor: OB.pink, boxShadow: '0px 0px 12px rgba(255,94,168,0.9)' }} />
        </Animated.View>
      )}

      {/* Pílula com as mensagens do scan */}
      {fase === 'escaneando' && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: pilulaBottom, alignItems: 'center' }}>
          <Animated.View
            layout={LinearTransition.duration(160)}
            entering={FadeIn.duration(160)}
            style={{ height: 34, paddingLeft: 14, paddingRight: 16, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.95)', flexDirection: 'row', alignItems: 'center', gap: 8, boxShadow: '0px 6px 18px rgba(18,18,18,0.12)' }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: OB.pink }} />
            <Animated.Text
              key={msg}
              entering={FadeIn.duration(120).delay(60)}
              exiting={FadeOut.duration(60)}
              style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: OB.ink }}
            >
              {MENSAGENS[msg]}
            </Animated.Text>
          </Animated.View>
        </View>
      )}

      {/* Aviso "Esta foto é nossa." + botão de captura pulsando */}
      {fase === 'pronto' || fase === 'escaneando' ? (
        <Animated.View pointerEvents={fase === 'pronto' ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, avisoStyle]}>
          <View style={{ position: 'absolute', left: 24, right: 24, bottom: avisoBottom, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)', paddingVertical: 14, paddingHorizontal: 18, boxShadow: '0px 8px 24px rgba(18,18,18,0.10)' }}>
            <Text style={{ textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '700', color: OB.ink }}>Esta foto é nossa.</Text>
            <Text style={{ marginTop: 2, textAlign: 'center', fontSize: 14, lineHeight: 19, color: OB.sub }}>Toque e veja como o NIKS analisa um produto.</Text>
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: btnBottom, alignItems: 'center' }}>
            <View style={{ width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: BTN, height: BTN, borderRadius: BTN / 2, backgroundColor: OB.pink }, pulsoStyle]} />
              <Pressable
                onPress={escanear}
                onPressIn={() => aperto.set(withTiming(0.94, { duration: 110, easing: EASE_OUT }))}
                onPressOut={() => aperto.set(withTiming(1, { duration: 160, easing: EASE_OUT }))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Ver o que o NIKS lê"
              >
                <Animated.View style={[{ width: BTN, height: BTN, borderRadius: BTN / 2, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: OB.pink, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 6px 18px rgba(255,94,168,0.35)' }, botaoStyle]}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: OB.pink }} />
                </Animated.View>
              </Pressable>
            </View>
          </View>
          <Text style={{ position: 'absolute', left: 0, right: 0, bottom: labelBottom, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.6, color: OB.ink }}>
            VER O QUE O NIKS LÊ
          </Text>
        </Animated.View>
      ) : null}

      {fase === 'pronto' && <ObHeader onBack={() => router.back()} />}

      {/* Tela 4 — TUDO JÁ MONTADO desde a abertura da tela (invisível e sem receber toque): a
          troca de fase só dispara os movimentos; montar e decodificar o recorte no 1º quadro do
          movimento fazia ele engasgar. */}
      {/* O fundo final (o MESMO degradê da home), que esmaece por baixo quando o brilho já
          cobriu a tela, e o rosa claro nascendo do produto (atrás do frasco), que depois sai. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fundoRosa, veuStyle]} />
      {!reduce && frasco && (
        <Animated.View
          pointerEvents="none"
          style={[{
            position: 'absolute', left: W / 2 - brilhoD / 2, top: cyFoco - brilhoD / 2, width: brilhoD, height: brilhoD,
            // As cores do fundo da home (06/nov/2026, pedido do produto: o rosa forte das cartas
            // ficava rosa demais), com o tom mais forte da home no meio.
            experimental_backgroundImage: 'radial-gradient(closest-side, #FDD5E6 0%, #FCDFEA 40%, #FCE3EE 70%, rgba(252,227,238,0) 100%)',
          }, brilhoStyle]}
        />
      )}

      {/* O frasco recortado (sem fundo): começa em cima do frasco da foto, vem para o meio, gira
          e sobe para o topo. A sombra (não gira) fica por baixo. Cada face que gira fica numa
          CAIXA SÓ DELA (`collapsable={false}`, sem fundo): no iOS, irmãs de camada se cruzam em 3D
          e a metade que gira "para trás" sumia atrás do véu rosa (visto no simulador,
          04/nov/2026); a caixa achata o giro no plano dela. (O `zIndex` não resolve: no Fabric
          ele só reordena, não muda a profundidade da camada.) */}
      {frasco && FOTO_RECORTE && (
        <>
          {!reduce && (
            <Animated.View pointerEvents="none" style={[caixaFrasco, sombraFrascoStyle]}>
              <Image
                source={SOMBRA_RECORTE}
                resizeMode="stretch"
                style={{
                  position: 'absolute',
                  left: (-fW * SOMBRA.folga) / SOMBRA.dentroW,
                  top: (-fH * SOMBRA.folga) / SOMBRA.dentroH + fH * 0.04,
                  width: (fW * SOMBRA.w) / SOMBRA.dentroW,
                  height: (fH * SOMBRA.h) / SOMBRA.dentroH,
                }}
              />
            </Animated.View>
          )}
          {!reduce && (
            <View collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Animated.View style={[caixaFrasco, { backfaceVisibility: 'hidden' }, versoFrascoStyle]}>
                <Image source={FOTO_RECORTE} resizeMode="stretch" style={{ position: 'absolute', left: 0, top: 0, width: fW, height: fH }} />
              </Animated.View>
            </View>
          )}
          <View collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View style={[caixaFrasco, { backfaceVisibility: 'hidden' }, frenteFrascoStyle]}>
              <Image source={FOTO_RECORTE} resizeMode="stretch" style={{ position: 'absolute', left: 0, top: 0, width: fW, height: fH }} />
            </Animated.View>
          </View>
        </>
      )}

      {/* O resultado: a FOLHA que sobe da borda de baixo e cobre a parte de baixo da tela (como a
          do scan do prato do Tapfit), com o botão dentro. Os dois destaques lado a lado: o anel
          da compatibilidade e o selo vermelho "Não recomendado". Medida (`onLayout`): o frasco
          usa o espaço que sobra em cima. */}
      <Animated.View
        pointerEvents={podeSeguir ? 'box-none' : 'none'}
        onLayout={(e) => setInfoH(e.nativeEvent.layout.height)}
        style={[styles.folha, { paddingBottom: botaoFimBottom }, folhaStyle]}
      >
        <Entra i={0} t={cascata} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Svg width={16} height={16} viewBox="0 0 16 16">
            <Circle cx={8} cy={8} r={8} fill={OB.pink} />
            <Path d="M4.6 8.2l2.3 2.3 4.5-4.8" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.6, color: OB.pink }}>ANALISADO PELO NIKS</Text>
        </Entra>
        <Entra i={1} t={cascata}>
          <Text numberOfLines={2} style={{ marginTop: 8, fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5, color: OB.ink }}>{NOME_PRODUTO}</Text>
        </Entra>

        <Entra i={2} t={cascata}>
          <Text style={[rotuloPequeno, { marginTop: 22 }]}>POR QUE NÃO RECOMENDAMOS</Text>
        </Entra>
        <View style={{ marginTop: 4 }}>
          {MOTIVOS.map((m, r) => (
            <Entra
              key={r}
              i={3 + r}
              t={cascata}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: DS.linha }}
            >
              <View style={styles.marcador} />
              <Text style={[styles.motivo, { flex: 1 }]} lineBreakStrategyIOS="push-out">{m}</Text>
            </Entra>
          ))}
        </View>

        <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Entra i={3 + MOTIVOS.length} t={cascata} style={{ flexShrink: 1, gap: 6 }}>
            <Text style={rotuloPequeno}>COMPATIBILIDADE</Text>
            <Text style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: DS.veredito }}>
              Não recomendado
            </Text>
          </Entra>
          <Entra i={4 + MOTIVOS.length} t={cascata} style={{ width: DS.anel, height: DS.anel }}>
            <View
              accessible
              accessibilityLabel={`${COMPATIBILIDADE}% compatível com a sua pele`}
              style={{ width: DS.anel, height: DS.anel }}
            >
              <Svg width={DS.anel} height={DS.anel} style={{ position: 'absolute', left: 0, top: 0, transform: [{ rotate: '-90deg' }] }}>
                <Circle cx={44} cy={44} r={ANEL_R} fill="none" stroke={DS.trilho} strokeWidth={DS.traco} />
                {/* O brilho do arco (no design, `drop-shadow(0 0 5px …)`, que o react-native-svg
                    não desenha): o mesmo arco mais largo e translúcido por baixo. */}
                <ArcoAnel
                  cx={44} cy={44} r={ANEL_R}
                  fill="none" stroke={DS.brilho} strokeWidth={DS.traco + 7} strokeLinecap="round"
                  strokeDasharray={ANEL_C}
                  animatedProps={arcoProps}
                />
                <ArcoAnel
                  cx={44} cy={44} r={ANEL_R}
                  fill="none" stroke={DS.arco} strokeWidth={DS.traco} strokeLinecap="round"
                  strokeDasharray={ANEL_C}
                  animatedProps={arcoProps}
                />
              </Svg>
              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 25 }]}>
                {numero != null
                  ? <Contador alvo={numero} contar={!reduce} duracao={CONTA_RAPIDA} style={styles.numero} />
                  : <Text style={styles.numero}>0</Text>}
                <Text style={styles.porcento}>%</Text>
              </View>
            </View>
          </Entra>
        </View>

        <Animated.View style={[{ marginTop: 29, alignItems: 'center' }, fimBotaoStyle]}>
          <TouchableOpacity
            onPress={continuar}
            activeOpacity={0.88}
            style={{ height: 48, paddingHorizontal: 30, borderRadius: 24, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 6px 16px rgba(255,94,168,0.28)' }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Quero saber o que usar</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  canto: { position: 'absolute', width: 30, height: 30, borderColor: OB.pink },
  // O MESMO degradê do fundo da home (`app/(app)/home.tsx`) — mudou lá, mude aqui. Até 06/nov/2026
  // era o rosa forte da carta do onboarding (`fundoOb`); o produto pediu um rosa mais claro.
  fundoRosa: {
    backgroundColor: '#F9F1F4',
    experimental_backgroundImage: 'linear-gradient(180deg, #FCE3EE 0%, #FDD5E6 45%, #FCDFEA 72%, #F9F1F4 100%)',
  },
  // A folha do resultado (design "NIKS Scan Resultado v5"): presa na borda de baixo, de ponta a
  // ponta, cantos de cima de 32, sombra para cima.
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingTop: 28, paddingHorizontal: 24,
    boxShadow: '0px -8px 30px rgba(120,18,70,0.14)',
  },
  numero: { fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8, color: OB.ink, fontVariant: ['tabular-nums'] },
  porcento: { marginLeft: 1, fontSize: 15, lineHeight: 15, fontWeight: '700', color: OB.ink },
  // O tracinho rosa dos motivos (10 × 3, no design).
  marcador: { width: 10, height: 3, borderRadius: 2, backgroundColor: OB.pink, marginTop: 9 },
  motivo: { fontSize: 16, lineHeight: 21, color: OB.ink },
});
