import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Line } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import {
  listarMinhaRotina, garantirMinhaRotina, temProdutosNoCelular, diaDaSemana, passoValeNoDia, nomeDoPasso,
  type MinhaRotina, type PassoRotina,
} from '../../lib/minhaRotina';
import { getRoutineHistory, sessionDate, dateKey, type RoutinePeriod } from '../../lib/routineProgress';
import { tipoDoPasso } from '../../lib/tipoPasso';
import { diasDoPasso, seloFrequencia } from '../../lib/frequencia';
import { abrirCartasEDepois, concluirSkincare, janelaDoSkincare, SKINCARE_SEMPRE_DISPONIVEL } from '../../lib/concluirSkincare';
import { estadoCartas } from '../../lib/cartasServidor';
import { ganhouPontos } from '../../lib/pontosAnimacao';
import { useMeusGrupos } from '../../lib/gruposServidor';
import FolhaCompartilhar from '../../components/grupos/FolhaCompartilhar';
import StepIcon from '../../components/rotina/StepIcon';
import AlvoGuia from '../../components/coach/AlvoGuia';
import { encerrarGuia, irParaGuia, useGuia } from '../../lib/guia';
import { verificarDesafios } from '../../lib/missoes';
import VoltarPelaBorda from '../../components/VoltarPelaBorda';

// ─────────────────────────────────────────────────────────────────────────────
// Skincare (05/nov/2026, pedido do produto) — o que abre o "Iniciar skincare" da HOME, no
// lugar do guia passo a passo: só a lista dos produtos do período (manhã ou noite), os
// mesmos passos que a aba Rotina mostra hoje (Minha rotina, respeitando os dias de cada
// passo), sem toque nos itens, e "Concluir skincare" embaixo. Concluir grava a rotina
// pelo mesmo caminho da aba Rotina (`lib/concluirSkincare`) e — o check-in é OPCIONAL
// (05/nov/2026, pedido do produto) — sobe a folha que já existe, "Compartilhar com o grupo?"
// (81t, pop-up no meio da tela com ativar/desativar por grupo): "Compartilhar" abre a câmera
// do check-in com os grupos ativados marcados (`/checkin?fluxo=skincare`:
// foto → Novo check-in → carta → mural). Regras novas das cartas (05/nov/2026): é o caminho
// ÚNICO (a aba Rotina também abre esta lista) e a carta do dia ABRE SOZINHA no fim do fluxo,
// com ou sem check-in: "Agora não" → carta → home; sem grupo, o convite (81u): "Criar grupo"
// → carta → criar grupo, "Agora não" → carta → home. Pontos sem carta (2º skincare do dia):
// com a carta de hoje para raspar, sobem junto com ela, depois de raspar; sem carta, a barra
// de nível sobe logo.
// "Concluir skincare" só funciona no horário daquele período (a regra da aba Rotina) e
// com pelo menos um passo; fora disso fica apagado (40%) e sem toque.
// Visual (05/nov/2026, pedido do produto): os cards são EXATAMENTE os de "Seus passos" da aba
// Rotina (`protocolo.tsx`, linha do tempo do design 41d) — número no círculo com a linha
// pontilhada, card branco de raio 13, produto recortado no quadrado de 52, nome do passo
// pequeno em cima e "Marca · Produto" em 17 semibold — só que sem toque: sem a seta de abrir e
// sem "Escolher produto". Fundo = o degradê do período da Rotina; voltar no círculo branco da
// home; "Concluir skincare" = a pílula rosa de 48 do herói da home. SF Pro, rosa #FF5EA8.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTED = '#8A8387';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const PRODUCT_BG = '#FFFFFF';
const NO_PRODUCT_BG = '#FFF5F9';   // o quadrado rosado do passo sem produto (aba Rotina)
// Degradês do período = os da aba Rotina (BG.am / BG.pm, mesmas paradas).
const BG = {
  am: ['#FFE3EF', '#FFD3E5', '#FFC6DC', '#FDDFEB', '#FBEEF3', '#F9F2F5'],
  pm: ['#EADCF4', '#F0D9EE', '#F6D3E5', '#F9E3EE', '#FBEFF4', '#F9F3F6'],
} as const;
const BG_STOPS = [0, 0.28, 0.5, 0.64, 0.8, 1] as const;
const DEFAULT_AM = 7 * 60;
const DEFAULT_PM = 21 * 60;
const EO = Easing.bezier(0.23, 1, 0.32, 1);

const minutos = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 24 * 60 ? n : fallback;
};

// A mesma busca da aba Rotina (`fetchMinhaRotina` em protocolo.tsx), na mesma chave de
// cache: se a Minha rotina ainda não existe, cria a cópia da ideal no servidor.
async function buscarMinhaRotina(): Promise<MinhaRotina> {
  const uid = await getUserId();
  if (!uid) return { am: [], pm: [] };
  let r = await listarMinhaRotina(uid);
  if ((!r.am.length && !r.pm.length) || (await temProdutosNoCelular())) {
    if ((await garantirMinhaRotina(uid)) === 'ok') r = await listarMinhaRotina(uid);
  }
  return r;
}

// A linha pontilhada entre os números (a mesma `DottedLine` da aba Rotina): medida e desenhada
// absoluta, para o desenho não entrar no cálculo da altura.
function LinhaPontilhada({ hidden }: { hidden: boolean }) {
  const [h, setH] = useState(0);
  return (
    <View style={{ flex: 1, width: 2, marginTop: 4, opacity: hidden ? 0 : 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h > 0 && (
        <Svg width={2} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Line x1={1} y1={1} x2={1} y2={h} stroke="rgba(192,32,106,0.28)" strokeWidth={2} strokeDasharray={[0.001, 4]} strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

/** Um passo, no card da aba Rotina (sem toque). Entra em cascata: esmaece e sobe 10 pt
 *  (só esmaece com "Reduzir movimento"). */
function Passo({ passo, n, primeiro, ultimo, ordem, rm, dia }: {
  passo: PassoRotina; n: number; primeiro: boolean; ultimo: boolean; ordem: number; rm: boolean; dia: string;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.set(withDelay(Math.min(ordem, 8) * 50, withTiming(1, { duration: rm ? 200 : 380, easing: EO })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ opacity: v.get(), transform: [{ translateY: rm ? 0 : (1 - v.get()) * 10 }] }));

  // Mesmo texto da aba Rotina: com produto, o nome do passo pequeno em cima e "Marca · Produto"
  // grande; sem produto, só o nome do passo grande.
  const prod = passo.produto && (passo.produto.recorteUrl || passo.produto.imagemUrl) ? passo.produto : null;
  const nome = (passo.nome ?? '').trim();
  const pline = prod ? [prod.marca, prod.nome].filter(Boolean).join(' · ') : '';
  const tipo = tipoDoPasso(nome, passo.ingrediente ?? '');
  const dias = diasDoPasso(passo.dias);
  return (
    <Animated.View style={[{ flexDirection: 'row', gap: 10 }, st]}>
      <View style={{ width: 30, alignItems: 'center' }}>
        <View style={[styles.num, primeiro ? { borderWidth: 2, borderColor: PINK } : { borderWidth: 1.5, borderColor: '#F4C2D7' }]}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: PINK_TEXT }}>{n}</Text>
        </View>
        <LinhaPontilhada hidden={ultimo} />
      </View>
      <View style={styles.stepCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <View style={[styles.tile, { backgroundColor: prod ? PRODUCT_BG : NO_PRODUCT_BG }]}>
            {prod
              // Recorte sem fundo quando pronto (o produto "flutua" no quadro branco).
              ? <ExpoImage source={{ uri: prod.recorteUrl ?? prod.imagemUrl ?? '' }} style={{ width: 42, height: 42 }} contentFit="contain" />
              : <StepIcon tipo={tipo} size={24} />}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            {!!prod && !!nome && <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }} numberOfLines={1}>{nome}</Text>}
            <Text style={styles.stepName} numberOfLines={2} lineBreakStrategyIOS="push-out">
              {prod ? pline || nomeDoPasso(passo) : nomeDoPasso(passo)}
            </Text>
            {!!dias && (
              <View style={styles.seloDias}>
                <Svg width={12} height={12} viewBox="0 0 24 24">
                  <Path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke={PINK_DEEP} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.seloDiasTxt}>{seloFrequencia(dias, passoValeNoDia(passo, dia))}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function Skincare() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rm = useReducedMotion();
  const params = useLocalSearchParams<{ periodo?: string; am?: string; pm?: string }>();
  const periodo: RoutinePeriod = params.periodo === 'pm' ? 'pm' : 'am';
  const amTime = minutos(params.am, DEFAULT_AM);
  const pmTime = minutos(params.pm, DEFAULT_PM);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const uid = useUserId();

  const fetcher = useCallback(() => buscarMinhaRotina(), []);
  const { data: minha } = useCachedQuery<MinhaRotina>(uid ? `minharotina:${uid}` : null, fetcher, { enabled: Boolean(uid), staleMs: 0 });

  // Relógio (o botão acende sozinho quando chega a hora) e se a rotina já foi feita hoje.
  const [agora, setAgora] = useState(() => new Date());
  const [feitaHoje, setFeitaHoje] = useState(false);
  const indo = useRef(false);
  const [concluindo, setConcluindo] = useState(false);
  // Depois de concluir: a folha "Compartilhar com o grupo?" (ou o convite, sem grupo). Só abre
  // com a lista de grupos já carregada — antes disso a folha mostraria o convite por engano.
  const { data: grupos, state: estadoGrupos } = useMeusGrupos();
  const [folha, setFolha] = useState<'fechada' | 'esperando' | 'aberta'>('fechada');
  const [vez, setVez] = useState(0);   // remonta a folha a cada abertura da tela
  const saindo = useRef(false);
  useFocusEffect(useCallback(() => {
    setFolha('fechada');
    saindo.current = false;
    setVez((v) => v + 1);
    setTabBarVisible(false);
    indo.current = false;
    setConcluindo(false);
    setAgora(new Date());
    getRoutineHistory().then((h) => setFeitaHoje(Boolean(h[dateKey(sessionDate())]?.[periodo])));
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(id); setTabBarVisible(true); };
  }, [setTabBarVisible, periodo]));

  const dia = diaDaSemana(sessionDate(agora));
  const passos = minha ? minha[periodo].filter((p) => passoValeNoDia(p, dia)) : null;
  // ⚠️ Modo de teste (`SKINCARE_SEMPRE_DISPONIVEL`, temporário): só a lista vazia trava.
  const pode = SKINCARE_SEMPRE_DISPONIVEL
    ? !!passos?.length
    : janelaDoSkincare(periodo, agora, amTime, pmTime) && !!passos?.length && !feitaHoje;

  // Dica do desafio 4 (lib/guia.ts): fora do horário, o botão fica apagado — o balão diz
  // quando abre ("Seu skincare abre às HH:MM.").
  const guia = useGuia();
  const foraDoHorario = !SKINCARE_SEMPRE_DISPONIVEL && !!passos?.length && !feitaHoje
    && !janelaDoSkincare(periodo, agora, amTime, pmTime);
  useEffect(() => {
    if (guia?.passo !== 'd4-concluir' || !foraDoHorario) return;
    const min = periodo === 'pm' ? pmTime : amTime;
    irParaGuia('d4-fora', { hora: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` });
  }, [guia?.passo, foraDoHorario, periodo, amTime, pmTime]);

  const voltar = () => { haptics.tap(); router.navigate('/home' as any); };
  // Fim sem check-in: a carta de hoje abre sozinha (e os pontos segurados sobem junto,
  // depois de raspar); sem carta, vai direto ao destino e a barra sobe.
  const terminar = (destino: string) => {
    if (saindo.current) return;
    saindo.current = true;
    void abrirCartasEDepois(router, destino);
  };
  const concluir = async () => {
    if (!pode || !passos || indo.current) return;
    indo.current = true;
    haptics.success();
    setConcluindo(true);
    encerrarGuia(); // a dica do desafio 4 cumpriu o papel
    try {
      const r = await concluirSkincare(periodo, passos.map((p) => p.id));
      // Pontos sem carta (2º skincare do dia) e do desafio 4: se a carta de hoje ainda está
      // para raspar, eles esperam por ela e a barra sobe uma vez só.
      const e = await estadoCartas().catch(() => null);
      const segurar = (e?.a_raspar.length ?? 0) > 0;
      if (r?.pontos) ganhouPontos(r.pontos, { segurar });
      await verificarDesafios({ segurar });
    } finally {
      setFolha('esperando');
    }
  };
  useEffect(() => {
    if (folha !== 'esperando') return;
    if (grupos != null) setFolha('aberta');
    // Sem conseguir ler os grupos (sem rede): o check-in também não sairia — segue sem ele.
    else if (estadoGrupos === 'error') terminar('/home');
  }, [folha, grupos, estadoGrupos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tocou num grupo: a câmera do check-in (sem moldura, sem galeria) com esse grupo marcado.
  // `navigate`, não `replace`: as telas escondidas da barra de abas trocam pela própria aba.
  // "Compartilhar" no pop-up: a câmera do check-in com os grupos ATIVADOS já marcados.
  const fazerCheckin = (grupoIds: string[]) => {
    if (saindo.current || !grupoIds.length) return;
    saindo.current = true;
    router.navigate({ pathname: '/checkin', params: { fluxo: 'skincare', rotina: periodo, grupos: grupoIds.join(',') } } as any);
  };

  const titulo = periodo === 'am' ? 'Skincare matinal' : 'Skincare noturno';
  return (
    <VoltarPelaBorda onVoltar={() => router.navigate('/home' as any)}>
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={BG[periodo]} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 140 }}>
        <View style={styles.hdrRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={voltar} style={styles.circleBtn} accessibilityLabel="Voltar">
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="m15 18-6-6 6-6" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        <View style={styles.listHead}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{titulo}</Text>
        </View>
        {passos == null ? (
          <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={PINK} />
          </View>
        ) : (
          <View style={{ marginTop: 12, paddingLeft: 14, paddingRight: 18 }}>
            {passos.map((p, k) => (
              <Passo key={p.id} passo={p} n={k + 1} primeiro={k === 0} ultimo={k === passos.length - 1} ordem={k} rm={rm} dia={dia} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Véu atrás do botão (como o da barra de abas) e "Concluir skincare". */}
      <LinearGradient
        colors={['rgba(249,241,244,0)', 'rgba(249,241,244,0.85)']}
        locations={[0, 0.7]}
        style={[styles.veu, { height: insets.bottom + 120 }]}
        pointerEvents="none"
      />
      <View style={[styles.cta, { bottom: Math.max(insets.bottom, 16) + 14 }]} pointerEvents="box-none">
        {/* Alvo da dica do desafio 4 ("Concluir skincare"). */}
        <AlvoGuia chave="sk-concluir">
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!pode || concluindo}
            onPress={concluir}
            accessibilityState={{ disabled: !pode || concluindo }}
            style={[styles.heroBtn, !pode && { opacity: 0.4 }]}
          >
            {concluindo
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.heroBtnText}>Concluir skincare</Text>}
          </TouchableOpacity>
        </AlvoGuia>
      </View>
      <FolhaCompartilhar
        key={vez}
        aberta={folha === 'aberta'}
        onCompartilhar={fazerCheckin}
        onCriarGrupo={() => terminar('/seus-grupos?criar=1')}
        onFechar={() => terminar('/home')}
      />
    </View>
    </VoltarPelaBorda>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F1F4' }, // sem overflow:hidden — pai de ScrollView (README #24)

  // Cabeçalho: o círculo branco do botão da sequência da home.
  hdrRow: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },

  // "Seus passos" da aba Rotina (protocolo.tsx), com as mesmas medidas.
  listHead: { marginTop: 22, paddingHorizontal: 18 },
  sectionTitle: { fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },
  num: { marginTop: 14, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stepCard: {
    flex: 1, minWidth: 0, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 13,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1,
  },
  tile: { width: 52, height: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepName: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  seloDias: {
    marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#FFE8F2', maxWidth: '100%',
  },
  seloDiasTxt: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: -0.1, color: PINK_DEEP },

  // "Concluir skincare" = a pílula rosa de 48 do herói da home.
  veu: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  cta: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  heroBtn: {
    height: 48, minWidth: 220, paddingHorizontal: 28, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0px 10px 22px rgba(255,94,168,0.35)',
  },
  heroBtnText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },
});
