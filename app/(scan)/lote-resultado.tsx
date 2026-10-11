// ─────────────────────────────────────────────────────────────────────────────
// "Sua rotina está pronta" — réplica do Claude Design (`NiksLoteFlo`, telas 55h/55i/55j).
// A rotina montada JÁ substituiu a Minha rotina (automático, no servidor, quando o lote
// terminou). Lê o lote pronto (`rotina_lotes`) e mostra, por período (Manhã | Noite):
//   · os passos com os produtos dela (foto sem fundo, como usar, dias da semana e o
//     "BOM SABER" de quem entrou com ressalva);
//   · os passos que FALTAM para a rotina ideal, tracejados ("Para completar · …"),
//     encaixados na ordem limpeza → tônico → sérum → olhos → hidratante → protetor
//     (o servidor não diz a posição);
//   · "Ficaram de fora": motivo, selo "Não indicado pra você" / "Não identificado" e o
//     aviso de precisão baixa de quem foi sem rótulo.
// "Ir para minha rotina" (e o X) levam para a Rotina. Nenhum produto serviu → a rotina
// atual dela não muda (o servidor não aplica rotina vazia) e a tela diz isso. Abrir
// marca o lote como visto (some o aviso).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Easing } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Line, Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { invalidateCache } from '../../lib/cache';
import { getUserId } from '../../lib/currentUser';
import { diasDoPasso } from '../../lib/frequencia';
import { ROTULO_TIPO, tipoPorTexto, type TipoPasso } from '../../lib/tipoPasso';
import { buscarLote, fotosDoLote, marcarVisto, type Lote, type ProdutoResultado } from '../../lib/rotinaLotes';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const MUTED = '#8A8387';
const SOFT = '#6E6468';
const BODY = '#3D3A3C';
// Fundo do quadradinho de cada produto (por índice), na ordem do design.
const TINT = ['#E2F1EF', '#E3EEF8', '#FFF1D6', '#EEE5F6', '#E3EEF8', '#FDE4EE', '#FFEFD9'];
const BG = {
  am: ['#FFE3EF', '#FFD3E5', '#FDDFEB', '#FBEEF3', '#F9F3F6'],
  pm: ['#EADCF4', '#F0D9EE', '#F6DDEA', '#FBEFF4', '#F9F3F6'],
};
const BG_STOPS = [0, 0.22, 0.45, 0.7, 1];
const ORDEM: Record<TipoPasso, number> = { limpeza: 0, tonico: 1, serum: 2, olhos: 3, hidratante: 4, protetor: 5 };

const NAO_IDENTIFICADO = 'Desculpa, não consegui identificar esse produto. Tenta escanear de novo pela sua estante, com uma foto mais nítida do rótulo.';

type Passo = {
  miss: boolean; kicker: string; title: string; text: string; note: string | null;
  dias: string[] | null; low: boolean; indice: number | null; tipo: TipoPasso | null;
};

function nomeProduto(p?: ProdutoResultado | null): string {
  if (!p) return 'Produto';
  return [p.marca, p.nome].filter(Boolean).join(' · ') || `Produto ${p.indice}`;
}

export default function LoteResultado() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lote, setLote] = useState<Lote | null>(null);
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const [per, setPer] = useState<'am' | 'pm'>('am');
  const perV = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!id) return;
    (async () => {
      const l = await buscarLote(id);
      setLote(l);
      if (!l) return;
      if (l.resultado && !l.resultado.rotina.am.length && l.resultado.rotina.pm.length) setPer('pm');
      void marcarVisto(l.id);
      // A Minha rotina mudou no servidor: a Rotina precisa reler.
      const uid = await getUserId();
      if (uid) { invalidateCache(`minharotina:${uid}`); invalidateCache(`lotehoje:${uid}`); }
      setFotos(await fotosDoLote(l).catch(() => ({})));
    })();
  }, [id]);

  // Fundo do período (.3s).
  useEffect(() => {
    Animated.timing(perV, { toValue: per === 'pm' ? 1 : 0, duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true }).start();
  }, [per, perV]);

  const r = lote?.resultado ?? null;
  const porIndice = useMemo(() => new Map((r?.produtos ?? []).map((p) => [p.indice, p])), [r]);
  const totalNaRotina = new Set([...(r?.rotina.am ?? []), ...(r?.rotina.pm ?? [])].map((s) => s.produto_indice)).size;
  const total = lote?.caminhos.length ?? 0;

  // Passos do período: os dela + os que faltam, cada um no lugar certo.
  const passos = useMemo<Passo[]>(() => {
    if (!r) return [];
    const lista: Passo[] = r.rotina[per].map((s) => {
      const p = porIndice.get(s.produto_indice);
      return {
        miss: false,
        kicker: s.passo,
        title: nomeProduto(p),
        text: s.instrucao,
        note: p?.veredito === 'com_ressalva' && p.motivo ? p.motivo : null,
        dias: diasDoPasso(s.dias),
        low: p?.precisao === 'baixa',
        indice: s.produto_indice,
        tipo: tipoPorTexto(s.passo) ?? tipoPorTexto(p?.categoria ?? ''),
      };
    });
    r.faltam.filter((f) => f.periodo === per).forEach((f) => {
      const tipo = tipoPorTexto(f.passo_ideal);
      const novo: Passo = {
        miss: true, kicker: `Para completar · ${tipo ? ROTULO_TIPO[tipo] : 'Passo'}`, title: f.passo_ideal, text: f.por_que,
        note: null, dias: null, low: false, indice: null, tipo,
      };
      const k = tipo === null ? -1 : lista.findIndex((x) => x.tipo !== null && ORDEM[x.tipo] > ORDEM[tipo]);
      if (k < 0) lista.push(novo); else lista.splice(k, 0, novo);
    });
    return lista;
  }, [r, per, porIndice]);
  const nh = passos.filter((s) => !s.miss).length;
  const nm = passos.length - nh;

  // Ficaram de fora (+ não identificados, com o selo deles).
  const fora = useMemo(() => {
    if (!r) return [];
    const vistos = new Set<number>();
    const out: { indice: number; brand: string; name: string; chip: string | null; chipBg: string; chipInk: string; why: string; low: boolean }[] = [];
    r.fora_da_rotina.forEach((f) => {
      const p = porIndice.get(f.produto_indice);
      vistos.add(f.produto_indice);
      const naoId = p && !p.identificado;
      out.push({
        indice: f.produto_indice,
        brand: naoId ? '' : (p?.marca ?? ''),
        name: naoId ? `Produto ${f.produto_indice}` : (p?.nome || nomeProduto(p)),
        chip: naoId ? 'Não identificado' : p?.veredito === 'evitaria' ? 'Não indicado pra você' : null,
        chipBg: naoId ? '#F1ECEF' : '#FDE8E8',
        chipInk: naoId ? SOFT : '#B3261E',
        why: naoId ? NAO_IDENTIFICADO : (f.motivo || p?.motivo || ''),
        low: !naoId && p?.precisao === 'baixa',
      });
    });
    (r.produtos ?? []).filter((p) => !p.identificado && !vistos.has(p.indice)).forEach((p) => {
      out.push({ indice: p.indice, brand: '', name: `Produto ${p.indice}`, chip: 'Não identificado', chipBg: '#F1ECEF', chipInk: SOFT, why: NAO_IDENTIFICADO, low: false });
    });
    return out;
  }, [r, porIndice]);

  const sair = () => router.replace('/(app)/protocolo' as any);

  if (!lote || !r) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9F3F6', alignItems: 'center', justifyContent: 'center' }}>
        {lote && !r
          ? <Text style={{ fontSize: 16, color: SOFT }}>Essa rotina ainda não está pronta.</Text>
          : <ActivityIndicator color={PINK} />}
      </View>
    );
  }

  const segOn = { backgroundColor: '#FFFFFF', shadowColor: '#783C48', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5 };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <LinearGradient colors={BG.am as any} locations={BG_STOPS as any} style={st.fill} />
      <Animated.View pointerEvents="none" style={[st.fill, { opacity: perV }]}>
        <LinearGradient colors={BG.pm as any} locations={BG_STOPS as any} style={st.fill} />
      </Animated.View>

      <ScrollView contentContainerStyle={{ paddingTop: 54, paddingBottom: 124 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 44 }} />
        <View style={{ marginTop: 12, paddingHorizontal: 20, gap: 6 }}>
          <Text style={st.titulo}>{totalNaRotina ? 'Sua rotina está pronta' : 'Não deu para montar uma rotina'}</Text>
          <Text style={st.sub}>
            {totalNaRotina
              ? `Montei com ${totalNaRotina} dos seus ${total} produtos. Ela já é a sua rotina, e você pode mudar quando quiser.`
              : 'Nenhum dos produtos serviu para a sua pele agora, então sua rotina continua como estava. Veja o motivo de cada um abaixo.'}
          </Text>
        </View>

        {/* Manhã | Noite */}
        <View style={st.seg}>
          {(['am', 'pm'] as const).map((p) => {
            const on = per === p;
            return (
              <TouchableOpacity key={p} activeOpacity={0.85} onPress={() => { haptics.select(); setPer(p); }} style={[st.segBtn, on && segOn]}>
                <Text style={[st.segTxt, on ? { fontWeight: '600', color: INK } : { fontWeight: '500', color: SOFT }]}>{p === 'am' ? 'Manhã' : 'Noite'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: 26, paddingHorizontal: 18, gap: 3 }}>
          <Text style={st.secao}>{`${per === 'am' ? 'Manhã' : 'Noite'} · ${passos.length} ${passos.length === 1 ? 'passo' : 'passos'}`}</Text>
          <Text style={st.secaoSub}>
            {nm === 0
              ? (nh ? 'Todos os passos com os seus produtos.' : 'Nenhum passo neste período.')
              : nh === 0
                ? `${nm} ${nm === 1 ? 'sugestão' : 'sugestões'} pra chegar na sua rotina ideal.`
                : `${nh} com seus produtos e ${nm} ${nm === 1 ? 'sugestão' : 'sugestões'} pra chegar na sua rotina ideal.`}
          </Text>
        </View>

        {/* Linha do tempo */}
        <View style={{ marginTop: 14, paddingLeft: 14, paddingRight: 18 }}>
          {passos.map((s, i) => {
            const ultimo = i === passos.length - 1;
            return (
              <View key={`${per}-${i}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                <View style={{ width: 30, alignItems: 'center' }}>
                  <View style={[st.num, s.miss ? st.numMiss : i === 0 ? st.numOn : st.numOff]}>
                    <Text style={st.numTxt}>{i + 1}</Text>
                  </View>
                  {/* Pontilhado até o próximo passo (absoluto: não dita a altura da linha) */}
                  <View style={{ position: 'absolute', top: 14 + 30 + 4, bottom: 0, left: 14, width: 2, overflow: 'hidden', opacity: ultimo ? 0 : 1 }}>
                    <Svg width={2} height={1200}><Line x1={1} y1={0} x2={1} y2={1200} stroke="rgba(192,32,106,0.28)" strokeWidth={2} strokeDasharray="2 2" /></Svg>
                  </View>
                </View>
                <View style={[st.card, s.miss ? st.cardMiss : st.cardHave]}>
                  <View style={[st.tile, s.miss ? st.tileMiss : { backgroundColor: TINT[((s.indice ?? 1) - 1) % TINT.length] }]}>
                    {s.miss
                      ? <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke={PINK_TEXT} strokeWidth={2.2} strokeLinecap="round" /></Svg>
                      : !!fotos[s.indice!] && <ExpoImage source={{ uri: fotos[s.indice!] }} style={{ width: 42, height: 42 }} contentFit="contain" />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={[st.kicker, { color: s.miss ? PINK_TEXT : MUTED }]}>{s.kicker}</Text>
                    <Text style={st.passoTitulo}>{s.title}</Text>
                    {!!s.text && <Text style={st.passoTexto}>{s.text}</Text>}
                    {!!s.dias && <Text style={st.dias}>{`${s.dias.length}x por semana · ${s.dias.join(', ')}`}</Text>}
                    {s.low && <Baixa />}
                    {!!s.note && (
                      <View style={st.nota}>
                        <Text style={st.notaTitulo}>BOM SABER</Text>
                        <Text style={st.notaTexto}>{s.note}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Ficaram de fora */}
        {fora.length > 0 && (
          <>
            <View style={{ marginTop: 22, paddingHorizontal: 18, gap: 3 }}>
              <Text style={st.secao}>Ficaram de fora</Text>
              <Text style={st.secaoSub}>Eles continuam na sua estante.</Text>
            </View>
            <View style={{ marginTop: 12, paddingHorizontal: 18, gap: 10 }}>
              {fora.map((o) => (
                <View key={o.indice} style={st.foraCard}>
                  <View style={st.foraTile}>
                    {!!fotos[o.indice] && <ExpoImage source={{ uri: fotos[o.indice] }} style={{ width: 42, height: 42, opacity: 0.75 }} contentFit="contain" />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    {!!o.brand && <Text style={st.foraMarca}>{o.brand}</Text>}
                    <Text style={st.foraNome}>{o.name}</Text>
                    {!!o.chip && (
                      <View style={[st.chip, { backgroundColor: o.chipBg }]}><Text style={[st.chipTxt, { color: o.chipInk }]}>{o.chip}</Text></View>
                    )}
                    {!!o.why && <Text style={st.foraPorque}>{o.why}</Text>}
                    {o.low && <Baixa />}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <TouchableOpacity onPress={() => { haptics.tap(); sair(); }} activeOpacity={0.85} accessibilityLabel="Fechar" style={st.fechar}>
        <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" /></Svg>
      </TouchableOpacity>
      <LinearGradient pointerEvents="none" colors={['rgba(249,243,246,0)', '#F9F3F6']} locations={[0, 0.38]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 124 }} />
      <TouchableOpacity onPress={() => { haptics.action(); sair(); }} activeOpacity={0.85} style={st.ir}>
        <Text style={st.irTxt}>Ir para minha rotina</Text>
      </TouchableOpacity>
    </View>
  );
}

// "Sem a foto do rótulo, essa análise é menos exata." (precisão baixa).
function Baixa() {
  return (
    <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <View style={{ width: 6, height: 6, marginTop: 5, borderRadius: 3, backgroundColor: '#F0A43A' }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: '#9A5300' }}>Sem a foto do rótulo, essa análise é menos exata.</Text>
    </View>
  );
}

const st = {
  fill: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  titulo: { fontSize: 28, fontWeight: '700' as const, lineHeight: 33, letterSpacing: -0.8, color: INK },
  sub: { fontSize: 15, lineHeight: 21, letterSpacing: -0.25, color: SOFT },
  seg: { marginTop: 22, alignSelf: 'center' as const, flexDirection: 'row' as const, gap: 2, padding: 3, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.55)' },
  segBtn: { height: 36, justifyContent: 'center' as const, paddingHorizontal: 20, borderRadius: 100 },
  segTxt: { fontSize: 15, letterSpacing: -0.2 },
  secao: { fontSize: 20, fontWeight: '600' as const, lineHeight: 24, letterSpacing: -0.5, color: INK },
  secaoSub: { fontSize: 14, lineHeight: 19, letterSpacing: -0.2, color: SOFT },
  num: { marginTop: 14, width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
  numOn: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: PINK },
  numOff: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#F4C2D7' },
  numMiss: { backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: '#F4B5CF' },
  numTxt: { fontSize: 15, fontWeight: '600' as const, color: PINK_TEXT },
  card: { flex: 1, minWidth: 0, marginBottom: 10, borderRadius: 14, padding: 12, flexDirection: 'row' as const, gap: 12, alignItems: 'flex-start' as const },
  cardHave: {
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1,
  },
  cardMiss: { backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: '#F4C2D7' },
  tile: { width: 52, height: 52, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  tileMiss: { backgroundColor: '#FFF5F9', borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: '#F4B5CF' },
  kicker: { fontSize: 13, fontWeight: '500' as const },
  passoTitulo: { fontSize: 17, fontWeight: '600' as const, lineHeight: 21, letterSpacing: -0.4, color: INK },
  passoTexto: { marginTop: 2, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: BODY },
  dias: { marginTop: 4, fontSize: 13, fontWeight: '600' as const, color: PINK_DEEP },
  nota: { marginTop: 8, borderRadius: 10, backgroundColor: '#FDF3F7', paddingVertical: 9, paddingHorizontal: 10, gap: 2 },
  notaTitulo: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.3, color: PINK_DEEP },
  notaTexto: { fontSize: 14, lineHeight: 19, letterSpacing: -0.2, color: '#6B3A50' },
  foraCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, flexDirection: 'row' as const, gap: 12, alignItems: 'flex-start' as const,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1,
  },
  foraTile: { width: 52, height: 52, borderRadius: 11, backgroundColor: '#F3EEF0', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  foraMarca: { fontSize: 13, fontWeight: '500' as const, color: MUTED },
  foraNome: { fontSize: 16, fontWeight: '600' as const, lineHeight: 20, letterSpacing: -0.35, color: INK },
  chip: { marginTop: 3, alignSelf: 'flex-start' as const, height: 22, justifyContent: 'center' as const, paddingHorizontal: 9, borderRadius: 100 },
  chipTxt: { fontSize: 12, fontWeight: '600' as const },
  foraPorque: { marginTop: 3, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: BODY },
  fechar: {
    position: 'absolute' as const, right: 18, top: 58, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', zIndex: 5,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  ir: {
    position: 'absolute' as const, left: 20, right: 20, bottom: 34, height: 52, borderRadius: 100, backgroundColor: PINK,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  irTxt: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.3, color: '#FFFFFF' },
};
