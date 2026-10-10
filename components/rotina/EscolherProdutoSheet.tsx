// ─────────────────────────────────────────────────────────────────────────────
// Folha "Escolher produto" (plano da Rotina, Fase 2 — decisão 5). Abre de baixo na
// Rotina, para UM passo da Minha rotina: passo vazio ("Escolher produto") ou "Trocar".
// As três seções são FILEIRAS horizontais com "Ver todos" (lista completa na aba
// Produtos, em modo escolha — `escolhaParaPasso`):
//   · Da sua estante  — todos os produtos dela (colecao_produtos), com filtros de categoria
//   · Seus escaneados — o que ela já escaneou, um card por produto (lib/productMatch),
//     SEM o que já está na estante (não aparece duas vezes)
//   · Recomendados pra você — com filtros de categoria; TODOS os que a IA recomendou (recomendacoes_produtos), numa
//     fileira; passo vindo da ideal → os recomendados DAQUELE passo primeiro. "Ver todos"
//     abre a lista completa da aba Produtos em modo escolha
//   · Escanear produto — vai à câmera; o resultado (product-result) põe o produto na
//     estante e neste passo (`rotinaPassoAlvo` no store)
// Tocar num produto põe no passo e fecha; o (i) abre os detalhes. Quem decide é ela:
// nada de aviso de "passo errado". Aviso FORTE (risco real) pede confirmação — "Escolher
// outro / Usar mesmo assim"; o LEVE só fica gravado no passo (lib/avisoProduto).
// Casca da folha = a do Alarme (Modal transparente + véu + translateY).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Animated, Easing, StyleSheet, ActivityIndicator, Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { getUserId } from '../../lib/currentUser';
import { listColecao } from '../../lib/colecao';
import { listarEscaneados } from '../../lib/escaneados';
import { dedupeByProduct, sameProduct } from '../../lib/productMatch';
import { CAT_ORDER, catOf } from '../../lib/productCategory';
import { normStepKey } from '../../lib/savedProducts';
import { avaliarProduto, type PeleParaAviso, type ProdutoAvaliavel } from '../../lib/avisoProduto';
import { definirProdutoDoPasso, nomeDoPasso, type PassoRotina, type RefProduto } from '../../lib/minhaRotina';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const MUTED = '#8A8385';
const SOFT = '#6E6468';

// Um produto candidato, de qualquer origem, no formato que a folha mostra.
type Candidato = {
  key: string;
  ref: RefProduto;
  nome: string | null;
  marca: string | null;
  img: string | null;          // recorte sem fundo, senão a foto
  cut: boolean;
  cat: string | null;
  compat: number | null;
  avaliavel: ProdutoAvaliavel;
  texto: string | null;        // texto do detalhe (o que a análise/recomendação disse)
};

type Dados = { pele: PeleParaAviso; estante: Candidato[]; escaneados: Candidato[]; recomendados: Candidato[] };

async function carregar(passo: PassoRotina): Promise<Dados> {
  const uid = await getUserId();
  if (!uid) throw new Error('sem sessão');
  const [userRes, colecao, scans, recRes] = await Promise.all([
    supabase.from('users').select('pregnancy_status, tipo_pele').eq('id', uid).maybeSingle(),
    listColecao(uid).catch(() => []),
    listarEscaneados(uid).catch(() => []),
    supabase.from('recomendacoes_produtos').select('recomendacao').eq('user_id', uid).maybeSingle(),
  ]);
  const pele: PeleParaAviso = {
    pregnancyStatus: userRes.data?.pregnancy_status ?? null,
    tipoPele: userRes.data?.tipo_pele ?? null,
  };

  // Recomendados: TODOS os da IA (cada produto uma vez). Passo vindo da rotina ideal →
  // os do passo correspondente (mesmo nome do passo atual ou do passo da ideal, mesmo
  // período) vêm primeiro; passo criado por ela → na ordem da recomendação.
  const passosRec: any[] = Array.isArray(recRes.data?.recomendacao) ? recRes.data!.recomendacao : [];
  const copyPorId = new Map<string, string>();
  const todosIds: string[] = [];
  for (const r of passosRec) {
    if (r?.sem_produto) continue;
    for (const x of r?.produtos ?? []) {
      if (!x?.produto_id || copyPorId.has(x.produto_id)) continue;
      copyPorId.set(x.produto_id, (x?.copy ?? '').trim());
      todosIds.push(x.produto_id);
    }
  }
  let primeiros: string[] = [];
  if (passo.origem === 'ideal') {
    const nomes = new Set([passo.nome ? normStepKey(passo.nome) : '', passo.passoIdealNome ? normStepKey(passo.passoIdealNome) : ''].filter(Boolean));
    const doPasso = passosRec.find((r) => !r?.sem_produto && nomes.has(normStepKey(r?.passo ?? ''))
      && String(r?.periodo ?? '').includes(passo.periodo))
      ?? passosRec.find((r) => !r?.sem_produto && nomes.has(normStepKey(r?.passo ?? '')));
    primeiros = (doPasso?.produtos ?? []).map((x: any) => x?.produto_id).filter(Boolean);
  }
  const recIds = [...primeiros, ...todosIds.filter((id) => !primeiros.includes(id))];

  // Catálogo: os recomendados + os itens da estante que vieram do catálogo (para os avisos).
  const catIds = [...new Set([...recIds, ...colecao.map((c) => c.produtoId).filter((x): x is string => !!x)])];
  const { data: prods } = catIds.length
    ? await supabase.from('produtos')
      .select('id, marca, nome, categoria, imagem_url, imagem_recorte_url, imagem_recorte_status, ativos_principais, seguro_gestante, tipos_pele, porque_e_especial')
      .in('id', catIds)
    : { data: [] as any[] };
  const prodPorId = new Map((prods ?? []).map((p: any) => [p.id as string, p]));
  const scanPorId = new Map(scans.map((s) => [s.id, s]));

  const avaliavelCatalogo = (p: any): ProdutoAvaliavel => ({
    nome: p?.nome ?? null, categoria: p?.categoria ?? null,
    ativos: Array.isArray(p?.ativos_principais) ? p.ativos_principais : null,
    seguroGestante: typeof p?.seguro_gestante === 'boolean' ? p.seguro_gestante : null,
    tiposPele: Array.isArray(p?.tipos_pele) ? p.tipos_pele : null,
  });
  const avaliavelScan = (r: any, nome: string | null): ProdutoAvaliavel => ({
    nome, categoria: r?.produto?.categoria ?? null,
    ativos: Array.isArray(r?.produto?.ativos_detectados) ? r.produto.ativos_detectados : null,
    veredito: r?.veredito ?? null,
    compat: typeof r?.compatibilidade === 'number' ? r.compatibilidade : null,
    avisosAnalise: Array.isArray(r?.avisos) ? r.avisos : null,
  });
  const textoScan = (r: any) => [r?.resumo, r?.explicacao].filter(Boolean).join(' ') || null;

  const estante: Candidato[] = colecao.map((c) => {
    const p = c.produtoId ? prodPorId.get(c.produtoId) : undefined;
    const sc = c.productScanId ? scanPorId.get(c.productScanId) : undefined;
    return {
      key: `e:${c.id}`, ref: { origem: 'estante', id: c.id },
      nome: c.nome, marca: c.marca,
      img: (c.cutoutStatus === 'ok' ? c.cutoutUrl : null) ?? c.photoUrl, cut: c.cutoutStatus === 'ok' && !!c.cutoutUrl,
      cat: catOf(c.categoria), compat: c.compat,
      avaliavel: sc ? avaliavelScan(sc.result, c.nome) : p ? avaliavelCatalogo(p) : { nome: c.nome, categoria: c.categoria, compat: c.compat, veredito: c.verdict },
      texto: sc ? textoScan(sc.result) : (p?.porque_e_especial ?? null),
    };
  });
  // Escaneados SEM o que já está na estante — pelo mesmo critério do "um card por
  // produto": o mesmo scan, ou o mesmo produto pela marca + nome (lib/productMatch).
  const naEstante = (sc: { id: string; brand: string | null; name: string | null }) => colecao.some((c) =>
    c.productScanId === sc.id || sameProduct({ marca: c.marca, nome: c.nome }, { marca: sc.brand, nome: sc.name }));
  const escaneados: Candidato[] = dedupeByProduct(scans.filter((s) => s.result?.status === 'ok' && !naEstante(s)), (s) => ({ marca: s.brand, nome: s.name }))
    .map((s) => ({
      key: `s:${s.id}`, ref: { origem: 'escaneado', id: s.id },
      nome: s.name, marca: s.brand,
      img: s.cutoutUrl ?? s.photoUrl, cut: !!s.cutoutUrl,
      cat: s.cat, compat: s.match,
      avaliavel: avaliavelScan(s.result, s.name),
      texto: textoScan(s.result),
    }));
  const recomendados: Candidato[] = recIds.map((id) => prodPorId.get(id)).filter(Boolean).map((p: any) => {
    const recorte = p.imagem_recorte_status === 'ok' ? p.imagem_recorte_url : null;
    return {
      key: `c:${p.id}`, ref: { origem: 'catalogo', id: p.id },
      nome: p.nome, marca: p.marca,
      img: recorte ?? p.imagem_url ?? null, cut: !!recorte,
      cat: catOf(p.categoria), compat: null,
      avaliavel: avaliavelCatalogo(p),
      texto: copyPorId.get(p.id) || p.porque_e_especial || null,
    };
  });
  return { pele, estante, escaneados, recomendados };
}

export default function EscolherProdutoSheet({ passo, onClose, onEscolhido }: {
  passo: PassoRotina | null;          // null = folha fechada
  onClose: () => void;
  onEscolhido: () => void;            // gravou: a Rotina recarrega
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();
  const setRotinaPassoAlvo = useAppStore((s) => s.setRotinaPassoAlvo);
  const setEscolhaParaPasso = useAppStore((s) => s.setEscolhaParaPasso);

  // Casca: monta, sobe; ao fechar, desce e desmonta (padrão da folha do Alarme).
  const anim = useRef(new Animated.Value(0)).current;
  const [montada, setMontada] = useState(false);
  const [atual, setAtual] = useState<PassoRotina | null>(null); // passo da folha aberta
  useEffect(() => {
    if (passo) {
      setAtual(passo);
      setMontada(true);
      Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => { setMontada(false); setAtual(null); });
    }
  }, [passo, anim]);

  const [dados, setDados] = useState<Dados | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [cat, setCat] = useState('Todos');    // filtro da estante
  const [catRec, setCatRec] = useState('Todos'); // filtro dos recomendados
  const [detalhe, setDetalhe] = useState<Candidato | null>(null);
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(() => {
    if (!passo) return;
    setEstado('carregando');
    carregar(passo).then((d) => { setDados(d); setEstado('pronto'); }).catch(() => setEstado('erro'));
  }, [passo]);
  useEffect(() => {
    if (!passo) return;
    setDados(null); setCat('Todos'); setCatRec('Todos'); setDetalhe(null);
    recarregar();
  }, [passo, recarregar]);

  const atualKey = atual?.produto ? `${atual.produto.origem === 'estante' ? 'e' : atual.produto.origem === 'escaneado' ? 's' : 'c'}:${atual.produto.id}` : null;

  const escolher = (c: Candidato) => {
    if (!atual || !dados || salvando) return;
    const aviso = avaliarProduto(c.avaliavel, dados.pele);
    const salvar = async () => {
      setSalvando(true);
      try {
        await definirProdutoDoPasso(atual.id, c.ref, aviso);
        haptics.success();
        onEscolhido();
        onClose();
      } catch (e) {
        console.warn('[escolher produto] falhou:', e);
        haptics.error();
        Alert.alert('Não deu pra salvar no passo', 'Tente de novo em instantes.');
      } finally {
        setSalvando(false);
      }
    };
    if (aviso.nivel === 'forte') {
      haptics.warning();
      Alert.alert('Atenção', aviso.texto ?? 'Esse produto pede cuidado na sua pele.', [
        { text: 'Escolher outro', style: 'cancel' },
        { text: 'Usar mesmo assim', style: 'destructive', onPress: () => { void salvar(); } },
      ]);
      return;
    }
    haptics.tap();
    void salvar();
  };

  const escanear = () => {
    if (!atual) return;
    haptics.action();
    setRotinaPassoAlvo({ passoId: atual.id, nome: nomeDoPasso(atual), periodo: atual.periodo, em: Date.now() });
    onClose();
    router.push('/(scan)/product-camera' as any);
  };

  // "Ver todos": a lista completa da aba Produtos (estante, escaneados ou recomendados),
  // em modo escolha para este passo — tocar num produto lá põe no passo e volta à Rotina.
  const verTodos = (lista: 'estante' | 'escaneados' | 'recomendados') => {
    if (!atual) return;
    haptics.tap();
    setEscolhaParaPasso({ passoId: atual.id, nome: nomeDoPasso(atual), periodo: atual.periodo, lista });
    onClose();
    router.navigate('/recomendacao-produtos' as any);
  };

  // Cards de largura fixa (3 por tela) em fileira horizontal — funções que DEVOLVEM
  // elementos (não componentes): não remontam a cada render.
  const CARD = Math.floor((W - 40 - 20) / 3);
  const fileira = (itens: Candidato[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -20, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
      {itens.map((c) => card(c))}
    </ScrollView>
  );
  // Filtros de categoria em cima de uma fileira (só com 2+ categorias presentes).
  const filtros = (lista: string[], atualCat: string, setAtual: (t: string) => void) => (lista.length > 2 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -20, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
      {lista.map((t) => {
        const on = t === atualCat;
        return (
          <TouchableOpacity key={t} activeOpacity={0.85} onPress={() => { haptics.select(); setAtual(t); }} style={[s.chip, on ? s.chipOn : s.chipOff]}>
            <Text style={[s.chipTxt, { fontWeight: on ? '600' : '500', color: on ? INK : SOFT }]}>{t}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  ) : null);
  const cabecalho = (titulo: string, lista: 'estante' | 'escaneados' | 'recomendados', top: number) => (
    <View style={[s.secRow, { marginTop: top }]}>
      <Text style={[s.secTitle, { marginTop: 0 }]}>{titulo}</Text>
      <TouchableOpacity onPress={() => verTodos(lista)} hitSlop={10} accessibilityLabel={`Ver todos: ${titulo}`}>
        <Text style={s.verTodos}>Ver todos</Text>
      </TouchableOpacity>
    </View>
  );
  const card = (c: Candidato) => {
    const on = c.key === atualKey;
    return (
      <TouchableOpacity key={c.key} activeOpacity={0.85} onPress={() => escolher(c)} style={{ width: CARD, gap: 6 }} accessibilityLabel={`Usar ${c.nome ?? 'produto'} neste passo`}>
        <View style={[s.cardImg, { height: CARD }, on && s.cardOn]}>
          {c.img
            ? <ExpoImage source={{ uri: c.img }} style={{ width: CARD - 18, height: CARD - 18 }} contentFit={c.cut ? 'contain' : 'cover'} />
            : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3ECEF' }} />}
          <TouchableOpacity onPress={() => { haptics.tap(); setDetalhe(c); }} hitSlop={8} style={s.info} accessibilityLabel={`Detalhes de ${c.nome ?? 'produto'}`}>
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={SOFT} strokeWidth={2.4} strokeLinecap="round"><Path d="M12 11v6M12 7.5v.01" /></Svg>
          </TouchableOpacity>
          {on && (
            <View style={s.check}>
              <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
            </View>
          )}
        </View>
        <Text style={s.cardNome} numberOfLines={2}>{c.nome || 'Produto'}</Text>
        {c.compat != null && <Text style={s.cardCompat}>{`${c.compat}% compatível`}</Text>}
      </TouchableOpacity>
    );
  };

  const estanteFiltrada = useMemo(() => (dados?.estante ?? []).filter((c) => cat === 'Todos' || c.cat === cat), [dados, cat]);
  const tags = useMemo(() => ['Todos', ...CAT_ORDER.filter((t) => (dados?.estante ?? []).some((c) => c.cat === t))], [dados]);
  const recFiltrados = useMemo(() => (dados?.recomendados ?? []).filter((c) => catRec === 'Todos' || c.cat === catRec), [dados, catRec]);
  const tagsRec = useMemo(() => ['Todos', ...CAT_ORDER.filter((t) => (dados?.recomendados ?? []).some((c) => c.cat === t))], [dados]);

  if (!montada) return null;
  const aviso = detalhe && dados ? avaliarProduto(detalhe.avaliavel, dados.pele) : null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.35)', opacity: anim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, {
        height: H * 0.86,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [H, 0] }) }],
      }]}>
        <View style={s.handle} />
        <View style={s.head}>
          {detalhe ? (
            <TouchableOpacity onPress={() => { haptics.tap(); setDetalhe(null); }} hitSlop={10} style={s.headBtn} accessibilityLabel="Voltar">
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>
            </TouchableOpacity>
          ) : <View style={s.headBtn} />}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.title}>{detalhe ? 'Detalhes do produto' : 'Escolher produto'}</Text>
            {!!atual && <Text style={s.subtitle} numberOfLines={1}>{nomeDoPasso(atual)}</Text>}
          </View>
          <TouchableOpacity onPress={() => { haptics.tap(); onClose(); }} hitSlop={10} style={s.headBtn} accessibilityLabel="Fechar">
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
          </TouchableOpacity>
        </View>

        {detalhe ? (
          // ── Detalhe (i): foto, marca, nome, compatibilidade, aviso e o que a análise disse.
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <View style={s.detImg}>
              {detalhe.img ? <ExpoImage source={{ uri: detalhe.img }} style={{ width: 150, height: 170 }} contentFit={detalhe.cut ? 'contain' : 'cover'} /> : null}
            </View>
            {!!detalhe.marca && <Text style={s.detMarca}>{detalhe.marca}</Text>}
            <Text style={s.detNome}>{detalhe.nome || 'Produto'}</Text>
            {detalhe.compat != null && <Text style={[s.cardCompat, { marginTop: 8, fontSize: 14 }]}>{`${detalhe.compat}% compatível com sua pele`}</Text>}
            {!!aviso && aviso.nivel !== 'nenhum' && (
              <View style={[s.aviso, aviso.nivel === 'forte' ? s.avisoForte : s.avisoLeve]}>
                <Text style={[s.avisoTxt, { color: aviso.nivel === 'forte' ? '#B42318' : PINK_DEEP }]}>{aviso.texto}</Text>
              </View>
            )}
            {!!detalhe.texto && <Text style={s.detTexto}>{detalhe.texto}</Text>}
          </ScrollView>
        ) : estado === 'carregando' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={PINK} /></View>
        ) : estado === 'erro' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 15, color: SOFT }}>Não deu pra carregar seus produtos agora.</Text>
            <TouchableOpacity onPress={() => { haptics.tap(); recarregar(); }} style={s.retry}><Text style={{ fontSize: 15, fontWeight: '600', color: INK }}>Tentar de novo</Text></TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {/* Da sua estante — filtros em cima da fileira */}
            {(dados?.estante.length ?? 0) === 0 ? (
              <>
                <Text style={s.secTitle}>Da sua estante</Text>
                <Text style={s.vazio}>Sua estante está vazia. Escaneie um produto que você tem em casa.</Text>
              </>
            ) : (
              <>
                {cabecalho('Da sua estante', 'estante', 8)}
                {filtros(tags, cat, setCat)}
                {fileira(estanteFiltrada)}
              </>
            )}

            {/* Seus escaneados */}
            {(dados?.escaneados.length ?? 0) > 0 && (
              <>
                {cabecalho('Seus escaneados', 'escaneados', 26)}
                {fileira(dados!.escaneados)}
              </>
            )}

            {/* Recomendados pra você */}
            {(dados?.recomendados.length ?? 0) > 0 && (
              <>
                {cabecalho('Recomendados pra você', 'recomendados', 26)}
                {filtros(tagsRec, catRec, setCatRec)}
                {fileira(recFiltrados)}
              </>
            )}
          </ScrollView>
        )}

        {/* Rodapé fixo: no detalhe, "Usar neste passo"; na lista, "Escanear produto". */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
          {detalhe ? (
            <TouchableOpacity activeOpacity={0.85} disabled={salvando} onPress={() => escolher(detalhe)} style={[s.bigBtn, salvando && { opacity: 0.6 }]}>
              <Text style={s.bigBtnTxt}>Usar neste passo</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={escanear} style={s.scanBtn} accessibilityLabel="Escanear produto">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={PINK_TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
              </Svg>
              <Text style={[s.bigBtnTxt, { color: PINK_TEXT }]}>Escanear produto</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 14,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#E3DCDF', alignSelf: 'center', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  subtitle: { marginTop: 1, fontSize: 14, letterSpacing: -0.2, color: MUTED },
  secTitle: { marginTop: 8, fontSize: 18, fontWeight: '600', letterSpacing: -0.4, color: INK },
  secRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  verTodos: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: PINK_TEXT },
  vazio: { marginTop: 8, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: SOFT },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: 100, justifyContent: 'center' },
  chipOn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EADDE3' },
  chipOff: { backgroundColor: '#F7F1F4' },
  chipTxt: { fontSize: 14, letterSpacing: -0.2 },
  cardImg: {
    borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F0E6EA',
  },
  cardOn: { borderWidth: 2, borderColor: PINK },
  info: {
    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#F7F1F4', alignItems: 'center', justifyContent: 'center',
  },
  check: {
    position: 'absolute', top: 5, left: 5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
  },
  cardNome: { fontSize: 13, fontWeight: '500', lineHeight: 17, letterSpacing: -0.2, color: INK },
  cardCompat: { fontSize: 12, fontWeight: '600', color: PINK_DEEP },
  detImg: { height: 210, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E6EA', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  detMarca: { marginTop: 16, fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: MUTED },
  detNome: { marginTop: 4, fontSize: 24, fontWeight: '700', lineHeight: 29, letterSpacing: -0.5, color: INK },
  detTexto: { marginTop: 14, fontSize: 16, lineHeight: 22, letterSpacing: -0.2, color: '#3D3639' },
  aviso: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  avisoLeve: { backgroundColor: '#FFF0F6' },
  avisoForte: { backgroundColor: '#FEF3F2' },
  avisoTxt: { fontSize: 14, lineHeight: 19, fontWeight: '500', letterSpacing: -0.2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.96)' },
  bigBtn: {
    height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  bigBtnTxt: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },
  scanBtn: {
    height: 50, borderRadius: 100, backgroundColor: '#FFF0F6', flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  retry: { height: 36, paddingHorizontal: 16, borderRadius: 100, backgroundColor: '#F7F1F4', justifyContent: 'center' },
});
