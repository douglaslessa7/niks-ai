import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, Modal, TouchableOpacity, TextInput, Keyboard,
  useWindowDimensions, ActivityIndicator, StyleSheet, BackHandler, Alert, Animated,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { concernLabel } from '../../lib/concernLabels';
import { normStepKey, type SavedProduct } from '../../lib/savedProducts';
import { produtosDaRotinaPorNome, definirProdutoDoPasso, avisoDoProduto, type RefProduto } from '../../lib/minhaRotina';
import { invalidateCache } from '../../lib/cache';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { listColecao, removeFromColecao, requestMissingColecaoCutouts, type ColecaoItem } from '../../lib/colecao';
import { getScanCutouts, requestMissingScanCutouts } from '../../lib/scanCutouts';
import { useColecaoToggle } from '../../hooks/useColecaoToggle';
import Shelf, { type ShelfHandle } from '../../components/product/Shelf';
import { ShelfAddButton, ShelfRemoveLink, confirmShelfRemove } from '../../components/product/ShelfStatus';
import { getUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';
import { CAT_ORDER, catOf } from '../../lib/productCategory';
import { listarEscaneados, type ScanItem } from '../../lib/escaneados';
import { dedupeByProduct, sameProduct } from '../../lib/productMatch';

// ── "Produtos para você" — identidade do app (novo design) ────────────────────
// Reformada para a linguagem visual do app (home / protocolo / niks-chat): fundo
// branco, cards brancos com a borda-assinatura #E3E3E6 + sombra suave, Nunito,
// header com logo + título centralizado. Escala proporcional S = width/393.
//
// DADOS REAIS: as seções AM/PM vêm da recomendação salva da usuária logada
// (tabela `recomendacoes_produtos`, gerada 1x pela Edge Function `recomendar-produtos`).
// Os campos de exibição (marca/nome/imagem/concerns) são resolvidos por produto_id
// contra a tabela `produtos`. A tela só EXIBE — ordem e conteúdo vêm do JSON.

const INK = '#121212';
const INK_FAINT = '#b5b5b5';
// Carrosséis da estante: quantos produtos mostram (o resto fica no "Ver todos") e a
// largura do card (o da grade, com largura fixa).
const CAROUSEL_MAX = 10;
const CARD_W = 150;
// 🧪 TESTE (out/2026) — pílula "Escanear produto" no rosa do app (#FF5EA8, o mesmo do
// "Adicionar à estante") com texto e ícone brancos. Para DESFAZER (pílula branca com
// texto escuro), troque para `false`.
const PILL_PINK = false;
const PILL_FG = PILL_PINK ? '#FFFFFF' : INK;

type Alt = { brand: string; name: string; sub: string; img: any; praLong?: string; targets?: string[] };
type Item = {
  // `img` = foto ORIGINAL do catálogo (é o que "Salvar na minha rotina" grava — a Rotina
  // acha o recorte por ela). `cutout` = recorte sem fundo, só para EXIBIR.
  id: string; num: string; step: string; brand?: string; name?: string; img?: any; cutout?: string | null;
  pra?: string; praLong?: string; targets?: string[]; alts?: Alt[];
  empty?: boolean; note?: string; productId?: string; // id do produto principal (deep-link da home)
  categoria?: string | null; compat?: number | null;   // vão junto para a coleção ("Tenho em casa")
};

// ── Formato do JSON salvo em recomendacoes_produtos.recomendacao ──────────────
type RecProduto = { produto_id: string; principal?: boolean; copy?: string; compatibilidade?: number };
type RecPasso = {
  categoria?: string; passo?: string; periodo?: string;
  ingrediente_alvo?: string; produtos?: RecProduto[];
  sem_produto?: boolean; motivo?: string;
};
// Linha resolvida da tabela `produtos` (só os campos de exibição).
type Prod = {
  id: string; marca: string; nome: string; imagem_url: string; concerns: string[]; categoria?: string | null;
  imagem_recorte_url?: string | null; imagem_recorte_status?: string | null;
};

// Recorte sem fundo do catálogo (Fase 2), quando pronto. Algumas fotos originais têm
// fundo cinza embutido (ex.: as da Creamy, #F2F2F2) — o recorte some com ele.
function cutoutOf(p: Prod): string | null {
  return p.imagem_recorte_status === 'ok' && p.imagem_recorte_url ? p.imagem_recorte_url : null;
}

// 'generating' = usuária legada (tem scan + protocolo, mas nunca teve recomendação
// gerada, porque se cadastrou antes da feature existir). Ver `generateOnDemand`.
type LoadState = 'loading' | 'generating' | 'empty' | 'error' | 'ready';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI';

// ── Aba "Minha coleção" (design 47a): produtos que a usuária escaneou (product_scans) ──
// A foto fica no bucket PRIVADO `product-scans` → precisa de URL assinada p/ exibir.
// Card da grade do 47a (coleção, recomendados e escaneados usam a mesma grade).
// cutoutUrl: recorte sem fundo (catálogo/scan) — quando existe, a grade mostra ele no lugar da foto.
// verdict: veredito do scan — a tag mostra ele quando não há porcentagem (scans antigos).
type GridItem = { id: string; photoUrl: string | null; cutoutUrl?: string | null; name: string | null; cat: string | null; match: number | null; verdict?: string | null };

// Aba "Recomendados" (design 47a): cada produto que a IA recomendou, com o passo de
// origem — a tela mostra os que NÃO estão escolhidos na rotina.
type RecEntry = GridItem & { prod: Prod; step: string; copy: string };

// (ScanItem e a lista de escaneados moram em lib/escaneados — a folha "Escolher produto" da Rotina usa a mesma.)

// Tag no lugar do "% compatível" quando o scan é antigo e não tem o número.
const VEREDITO_TAG: Record<string, string> = { pode_usar: 'Pode usar', com_ressalva: 'Com ressalva', evitaria: 'Evitaria' };
// "Alternativa ao seu protetor" etc. — linha de baixo dos cards da aba Recomendados.
const ALT: Record<string, string> = {
  'Limpeza': 'à sua limpeza', 'Tônico': 'ao seu tônico', 'Sérum': 'ao seu sérum',
  'Hidratante': 'ao seu hidratante', 'Protetor solar': 'ao seu protetor',
};

// Busca sem diferenciar maiúscula nem acento ("serum" acha "Sérum").
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Quando foi o scan, no formato do 47a: "Hoje, 14:32" · "Ontem, 19:48" · "22 set".
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Hoje, ${hm}`;
  if (diff === 1) return `Ontem, ${hm}`;
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

// Rótulos PT dos concerns reais de um produto (omite códigos desconhecidos).
const targetsOf = (p: Prod): string[] =>
  (p.concerns ?? []).map(concernLabel).filter((l): l is string => !!l);

// Constrói um Item (card) a partir de um passo do JSON + mapa de produtos.
// `prefix`/`index` definem o id (Manhã/Noite) e a numeração por seção.
// Retorna null quando o passo tem produto mas NENHUM id resolveu (produto removido).
function buildItem(passo: RecPasso, prodMap: Map<string, Prod>, prefix: string, index: number): Item | null {
  const num = String(index + 1).padStart(2, '0');
  const step = (passo.passo || passo.categoria || '').trim();

  if (passo.sem_produto) {
    return {
      id: `${prefix}${index}`, num, step, empty: true,
      note: passo.motivo || 'Ainda não temos um produto no catálogo para este passo.',
    };
  }

  const resolved = (passo.produtos ?? [])
    .map((x) => ({ x, p: prodMap.get(x.produto_id) }))
    .filter((r): r is { x: RecProduto; p: Prod } => !!r.p);
  if (resolved.length === 0) return null;

  const principal = resolved.find((r) => r.x.principal === true) ?? resolved[0];
  const others = resolved.filter((r) => r !== principal);
  const main = principal.p;

  return {
    id: `${prefix}${index}`, num, step, productId: main.id,
    compat: typeof principal.x.compatibilidade === 'number' ? Math.round(principal.x.compatibilidade) : null,
    brand: main.marca, name: main.nome, img: { uri: main.imagem_url }, cutout: cutoutOf(main),
    pra: (principal.x.copy || '').trim(),
    praLong: (principal.x.copy || '').trim(),
    targets: targetsOf(main),
    alts: others.map((r) => ({
      brand: r.p.marca, name: r.p.nome, sub: (r.x.copy || '').trim(),
      img: { uri: r.p.imagem_url },
      praLong: (r.x.copy || '').trim(), targets: targetsOf(r.p),
    })),
  };
}

export default function RecomendacaoProdutos() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const S = width / 393;
  const s = (n: number) => n * S;

  const [detail, setDetail] = useState<Item | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  // Trava de uma tentativa de geração por montagem da tela (ver `load`).
  const triedGenerate = useRef(false);
  const [am, setAm] = useState<Item[]>([]);
  const [pm, setPm] = useState<Item[]>([]);
  const [recList, setRecList] = useState<RecEntry[]>([]);
  const [catR, setCatR] = useState<string>('Todos'); // filtro dos recomendados
  // Produtos escolhidos na rotina (por passo) — os recomendados que estão aqui saem da aba.
  const [saved, setSaved] = useState<Record<string, SavedProduct>>({});

  // Deep-link da home ("Para você"): produto_id cujo detalhe deve abrir ao entrar aqui.
  const productDetailTarget = useAppStore((s) => s.productDetailTarget);
  const setProductDetailTarget = useAppStore((s) => s.setProductDetailTarget);

  // Visões da aba (out/2026 — as abas "Minha coleção | Recomendados | Escaneados" saíram):
  // 'main' = a ESTANTE no topo (estante = coleção da usuária) + carrosséis
  // "Recomendados pra você" e "Escaneados recentemente". Cada carrossel tem "Ver todos",
  // que abre a lista completa dele (a grade com filtros de categoria do 47a).
  // 'estante' = a ESTANTE (prateleiras) sozinha, em modo escolha — o "Ver todos" da estante
  // na folha "Escolher produto": sem carrosséis, sem Editar/compartilhar/pílula, só toque.
  const [view, setView] = useState<'main' | 'recomendados' | 'escaneados' | 'estante'>('main');
  const [scrollOn, setScrollOn] = useState(true); // falso enquanto arrasta na estante
  // Modo Editar da estante (padrão da tela inicial do iPhone): produtos tremem com um x;
  // tocar num produto pede para removê-lo. "OK" sai.
  const [editing, setEditing] = useState(false);
  // Pílula "Escanear produto": encolhe só para o ícone ao rolar para BAIXO (não cobre os
  // cards) e volta com o texto ao rolar para cima ou perto do topo. 0 = aberta, 1 = ícone.
  const pillT = useRef(new Animated.Value(0)).current;
  const pillCompact = useRef(false);
  const lastY = useRef(0);
  const setPill = (compact: boolean) => {
    if (pillCompact.current === compact) return;
    pillCompact.current = compact;
    Animated.timing(pillT, { toValue: compact ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  };
  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    if (y < 40) setPill(false);
    else if (dy > 6) setPill(true);
    else if (dy < -6) setPill(false);
    if (Math.abs(dy) > 6 || y < 40) lastY.current = y;
  };
  const shelfRef = useRef<ShelfHandle>(null);
  const openList = (v: 'recomendados' | 'escaneados') => { haptics.tap(); setQuery(''); setView(v); };
  // MODO ESCOLHA ("Ver todos" da folha "Escolher produto" da Rotina): a lista completa de
  // Recomendados escolhe o produto de um passo. Voltar leva de volta à Rotina.
  const escolha = useAppStore((st) => st.escolhaParaPasso);
  const setEscolhaParaPasso = useAppStore((st) => st.setEscolhaParaPasso);
  const voltarParaRotina = () => { setEscolhaParaPasso(null); router.navigate('/protocolo' as any); };
  const backToMain = () => {
    haptics.tap(); setQuery('');
    if (useAppStore.getState().escolhaParaPasso) { voltarParaRotina(); return; }
    setView('main');
  };
  const [scanState, setScanState] = useState<LoadState>('loading');
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [scanDetail, setScanDetail] = useState<ScanItem | null>(null);
  const [catS, setCatS] = useState<string>('Todos'); // filtro dos escaneados
  // Busca (lupa do cabeçalho): filtra os produtos da aba aberta pelo nome/marca.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kbH, setKbH] = useState(0); // altura do teclado — a barra de busca sobe junto
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const closeSearch = () => { Keyboard.dismiss(); setSearchOpen(false); setQuery(''); };

  // Ao sair da aba, volta para a estante: tocar em "Produtos" sempre abre nela. Chegou em
  // modo escolha → abre direto na lista completa de Recomendados.
  useFocusEffect(useCallback(() => {
    const esc = useAppStore.getState().escolhaParaPasso;
    if (esc) setView(esc.lista);
    return () => {
      setView('main'); setSearchOpen(false); setQuery(''); setScrollOn(true); setEditing(false);
      useAppStore.getState().setEscolhaParaPasso(null);
    };
  }, []));
  // Trocou de visão (estante ↔ "Ver todos"): a lista nova começa no topo → pílula aberta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { lastY.current = 0; setPill(false); }, [view]);
  // Android: o "voltar" do sistema numa lista do "Ver todos" volta para a estante.
  useEffect(() => {
    if (view === 'main') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setQuery('');
      if (useAppStore.getState().escolhaParaPasso) voltarParaRotina();
      else setView('main');
      return true;
    });
    return () => sub.remove();
  }, [view]);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null); // foto do cabeçalho (mesma da home)


  // Lê a linha da usuária em `recomendacoes_produtos`. null = erro de rede/RLS.
  const fetchPassos = useCallback(async (userId: string): Promise<RecPasso[] | null> => {
    const { data: row, error } = await supabase
      .from('recomendacoes_produtos')
      .select('recomendacao')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return Array.isArray(row?.recomendacao) ? (row!.recomendacao as RecPasso[]) : [];
  }, []);

  // Geração SOB DEMANDA — para quem já tem scan + protocolo mas nunca teve a linha em
  // `recomendacoes_produtos` (cadastro anterior à feature). A Edge Function só é chamada
  // se a usuária CHEGAR nesta tela e ela estiver vazia — nunca em background, para não
  // gastar IA com quem não abrir a tela. Chamar é seguro em qualquer cenário: a função é
  // auto-guardada (UNIQUE em user_id) — se a linha já existir, devolve a existente sem
  // regenerar nem cobrar IA.
  //
  // Desfechos: 'sem-protocolo' = nunca escaneou, não há de onde gerar (a função deriva as
  // categorias dos passos da rotina salva) → 'empty'. 'ok' → refetch. 'falhou' = rede ou
  // função caiu → 'error' com "Tentar de novo", NUNCA 'empty': dizer "faça seu primeiro
  // scan" para quem já escaneou seria mentira.
  const generateOnDemand = useCallback(async (userId: string): Promise<'ok' | 'sem-protocolo' | 'falhou'> => {
    const { data: proto } = await supabase
      .from('protocolos')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!proto) return 'sem-protocolo';

    const { data: scan } = await supabase
      .from('skin_scans')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    try {
      const res = await fetch(
        'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/recomendar-produtos',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({ user_id: userId, scan_id: scan?.id ?? null }),
        },
      );
      return res.ok ? 'ok' : 'falhou';
    } catch {
      return 'falhou';
    }
  }, []);

  // ── Busca + resolução dos dados reais ─────────────────────────────────────
  // 1) usuária logada → 2) linha em recomendacoes_produtos (gerando sob demanda se
  // faltar) → 3) resolve TODOS os produto_id de uma vez contra `produtos` → 4) monta
  // as seções AM/PM.
  const load = useCallback(async () => {
    setState('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) { setState('empty'); return; }

      let passos = await fetchPassos(user.id);
      if (passos === null) { setState('error'); return; }

      // Vazio + nunca tentamos gerar nesta montagem → tenta uma única vez. O ref evita
      // laço infinito se a função responder ok mas a linha continuar vazia.
      if (passos.length === 0 && !triedGenerate.current) {
        triedGenerate.current = true;
        setState('generating');
        const gen = await generateOnDemand(user.id);
        // Falha de rede/função: deixa "Tentar de novo" rearmar a trava e chamar de novo.
        if (gen === 'falhou') { triedGenerate.current = false; setState('error'); return; }
        if (gen === 'ok') passos = (await fetchPassos(user.id)) ?? [];
      }
      if (passos.length === 0) { setState('empty'); return; }

      const ids = [...new Set(
        passos.flatMap((p) => (p.produtos ?? []).map((x) => x.produto_id)).filter(Boolean),
      )];
      const prodMap = new Map<string, Prod>();
      if (ids.length) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('id, marca, nome, imagem_url, concerns, categoria, imagem_recorte_url, imagem_recorte_status')
          .in('id', ids);
        (prods ?? []).forEach((p: any) => prodMap.set(p.id, p));
      }

      const amItems: Item[] = [];
      const pmItems: Item[] = [];
      for (const passo of passos) {
        const periodo = passo.periodo ?? '';
        if (periodo.includes('am')) {
          const it = buildItem(passo, prodMap, 'am', amItems.length);
          if (it) amItems.push(it);
        }
        if (periodo.includes('pm')) {
          const it = buildItem(passo, prodMap, 'pm', pmItems.length);
          if (it) pmItems.push(it);
        }
      }

      // Lista plana da aba Recomendados: todo produto recomendado, uma vez só, na ordem
      // dos passos. Categoria: a do catálogo; senão, o nome do passo ("Protetor Solar").
      const seen = new Set<string>();
      const flat: RecEntry[] = [];
      for (const passo of passos) {
        if (passo.sem_produto) continue;
        const step = (passo.passo || passo.categoria || '').trim();
        for (const x of passo.produtos ?? []) {
          const prod = prodMap.get(x.produto_id);
          if (!prod || seen.has(prod.id)) continue;
          seen.add(prod.id);
          flat.push({
            id: prod.id, photoUrl: prod.imagem_url || null, cutoutUrl: cutoutOf(prod), name: prod.nome,
            cat: catOf(prod.categoria) ?? catOf(step) ?? catOf(passo.categoria),
            match: typeof x.compatibilidade === 'number' ? Math.round(x.compatibilidade) : null,
            prod, step, copy: (x.copy || '').trim(),
          });
        }
      }

      if (amItems.length === 0 && pmItems.length === 0 && flat.length === 0) { setState('empty'); return; }

      setAm(amItems);
      setPm(pmItems);
      setRecList(flat);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [fetchPassos, generateOnDemand]);

  useEffect(() => {
    let active = true;
    // Só aplica o resultado se a tela ainda estiver montada.
    (async () => { if (active) await load(); })();
    return () => { active = false; };
  }, [load]);

  // Deep-link da home: quando os dados estão prontos e há um produto-alvo, abre o
  // detalhe dele (na aba Recomendados) e limpa o alvo.
  useEffect(() => {
    if (!productDetailTarget || state !== 'ready') return;
    const hit = [...am, ...pm].find((it) => !it.empty && it.productId === productDetailTarget);
    if (hit) setDetail(hit);
    setProductDetailTarget(null);
  }, [productDetailTarget, state, am, pm, setProductDetailTarget]);

  // ── Histórico "Escaneados" (tabela product_scans, RLS = só as próprias linhas) ──
  // A foto está no bucket privado `product-scans`; gera URLs assinadas em lote.
  const loadScans = useCallback(async () => {
    setScanState('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) { setScanState('empty'); return; }

      const items = await listarEscaneados(user.id);
      if (!items.length) { setScanState('empty'); return; }
      setScans(items);
      setScanState('ready');
    } catch {
      setScanState('error');
    }
  }, []);

  // Um card por produto: o mesmo produto escaneado várias vezes vira UM card, o do scan
  // mais recente (`scans` já vem do mais recente pro mais antigo). Só exibição — o banco
  // continua com todos os scans. Critério (marca + nome lidos) em lib/productMatch.
  const scansShown = useMemo(
    () => dedupeByProduct(scans, (p) => ({ marca: p.brand, nome: p.name })),
    [scans],
  );

  // Scans antigos (de antes do recorte automático) ainda sem recorte: pede um por vez,
  // dentro da cota da sessão (40, dividida com coleção/estante — lib/scanCutouts), e
  // atualiza a grade conforme ficam prontos. Na estante só os do carrossel (os
  // primeiros); a lista completa pede o resto.
  useEffect(() => {
    if (view === 'recomendados') return;
    const ok = scansShown.filter((s) => s.result?.status === 'ok');
    void requestMissingScanCutouts(
      (view === 'main' ? ok.slice(0, CAROUSEL_MAX) : ok).map((s) => ({ id: s.id, status: s.cutoutStatus })),
      async (id, st) => {
        const c = (await getScanCutouts([id]))[id];
        setScans((list) => list.map((x) => (x.id === id ? { ...x, cutoutStatus: c?.status ?? st, cutoutUrl: c?.url ?? null } : x)));
      },
    );
  }, [view, scansShown]);

  // Recarrega os escaneados ao voltar para a tela (ex.: depois de escanear um produto
  // no balão da câmera) — sempre frescos.
  useFocusEffect(useCallback(() => { loadScans(); }, [loadScans]));

  // Produtos escolhidos na rotina — recarrega ao focar (a usuária pode ter trocado na Rotina).
  // (Minha rotina no servidor, por nome do passo — antes era o savedProducts do celular.)
  const reloadSaved = useCallback(() => {
    getUserId().then((uid) => (uid ? produtosDaRotinaPorNome(uid) : {})).then(setSaved).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { reloadSaved(); }, [reloadSaved]));

  // ── Minha coleção (colecao_produtos): o que a usuária marcou "Tenho em casa" ──
  const [colecao, setColecao] = useState<ColecaoItem[]>([]);
  const [colState, setColState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loadColecao = useCallback(async () => {
    try {
      const uid = await getUserId();
      if (!uid) { setColecao([]); setColState('ready'); return; }
      const list = await listColecao(uid);
      setColecao(list);
      setColState('ready');
      // Itens vindos de scan antigo sem recorte: pede (cota da sessão) e recarrega a
      // grade a cada um que fica pronto.
      void requestMissingColecaoCutouts(list, () => { listColecao(uid).then(setColecao).catch(() => {}); });
    } catch {
      setColState('error');
    }
  }, []);
  // Recarrega sempre que a tela ganha foco: um "Tenho em casa" marcado no resultado do
  // scan ou em outra tela já aparece na estante na volta.
  useFocusEffect(useCallback(() => { loadColecao(); }, [loadColecao]));
  // Enquanto houver recorte em andamento, recarrega a cada 4s (no máximo 15 vezes) —
  // a miniatura da estante troca a foto pelo recorte quando ele fica pronto.
  const colPolls = useRef(0);
  useEffect(() => {
    if (!colecao.some((c) => c.cutoutStatus === 'pendente') || colPolls.current >= 15) return;
    const t = setTimeout(() => { colPolls.current += 1; void loadColecao(); }, 4000);
    return () => clearTimeout(t);
  }, [colecao, loadColecao]);
  // Estante esvaziou (removeu o último no modo Editar) → sai do modo Editar.
  useEffect(() => { if (colecao.length === 0) setEditing(false); }, [colecao.length]);

  // "Tenho em casa" no detalhe de um recomendado (catálogo) e de um escaneado.
  const detailSrc = useMemo(() => (detail?.productId ? {
    origem: 'catalogo' as const, produtoId: detail.productId, nome: detail.name ?? null, marca: detail.brand ?? null,
    categoria: detail.categoria ?? null, compat: detail.compat ?? null,
    imagemUrl: detail.img && typeof detail.img === 'object' && 'uri' in detail.img ? detail.img.uri : null,
  } : null), [detail]);
  const detailCol = useColecaoToggle(detailSrc, loadColecao);
  const scanSrc = useMemo(() => (scanDetail && scanDetail.result?.status === 'ok' ? {
    origem: 'scan' as const, productScanId: scanDetail.id, nome: scanDetail.name, marca: scanDetail.brand,
    categoria: scanDetail.result?.produto?.categoria ?? null, compat: scanDetail.match,
  } : null), [scanDetail]);
  const scanCol = useColecaoToggle(scanSrc, loadColecao);

  // Tocar num item da coleção: scan → a análise dele; catálogo → o detalhe do produto.
  const openColecaoItem = async (c: ColecaoItem) => {
    if (c.origem === 'scan' && c.productScanId) {
      const { data: r } = await supabase.from('product_scans').select('id, resultado, created_at').eq('id', c.productScanId).maybeSingle();
      if (r) {
        setScanDetail({
          id: r.id, photoUrl: c.photoUrl, brand: c.marca, name: c.nome, createdAt: r.created_at, result: r.resultado,
          cat: catOf(c.categoria), match: c.compat, cutoutUrl: c.cutoutUrl, cutoutStatus: c.cutoutStatus,
        });
        return;
      }
    }
    setDetail({
      id: c.id, num: '', step: '', productId: c.produtoId ?? undefined,
      brand: c.marca ?? undefined, name: c.nome ?? undefined, img: { uri: c.photoUrl ?? c.cutoutUrl ?? '' }, cutout: c.cutoutUrl ?? null,
      pra: '', praLong: '', targets: [], alts: [], categoria: c.categoria, compat: c.compat,
    });
  };

  // Foto do cabeçalho: a mesma da home (escolhida na galeria > foto do último scan).
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      const [{ data: u }, { data: sc }] = await Promise.all([
        supabase.from('users').select('foto_home_url').eq('id', user.id).maybeSingle(),
        supabase.from('skin_scans').select('foto_url').eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setFotoUrl(u?.foto_home_url ?? sc?.foto_url ?? null);
    })().catch(() => {});
  }, []);


  // Escanear produto — abre a réplica da tela de câmera (product-camera), o
  // equivalente à câmera do scan de comida, dedicada ao scan de produto.
  const handleEscanearProduto = () => {
    haptics.action();
    router.push('/(scan)/product-camera' as any);
  };

  // Produto já escolhido em algum passo da rotina? (mesma imagem do catálogo, ou mesmo nome)
  const norm = (x?: string | null) => (x ?? '').trim().toLowerCase();
  const inRoutine = (prod: Prod) => Object.values(saved).some(
    (sp) => (!!sp.imageUrl && sp.imageUrl === prod.imagem_url) || (!!sp.name && norm(sp.name) === norm(prod.nome)),
  );

  // ── Design 47a (Claude Design, NiksProductsFlo) ─────────────────────────────
  // Topo que rola junto com o conteúdo (no design ele está DENTRO da rolagem).
  // Na estante: foto + "Minha estante" · Editar + compartilhar. Nas listas do "Ver
  // todos": voltar + "Meus produtos". (A lupa da busca saiu do topo a pedido do produto,
  // out/2026 — a barra de busca de baixo ficou sem entrada; ver `searchOpen`.)
  const PageTop = () => (
    <>
      <View style={{ height: insets.top + 15 }} />
      <View style={p47.topRow}>
        {view === 'main' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {fotoUrl
              ? <Image source={{ uri: fotoUrl }} style={p47.avatar} />
              : <View style={[p47.avatar, { backgroundColor: '#F6D3E1' }]} />}
            <Text style={p47.topTitle}>Minha estante</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity activeOpacity={0.85} onPress={backToMain} style={p47.circle36} accessibilityLabel="Voltar">
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>
            </TouchableOpacity>
            <Text style={p47.topTitle}>Meus produtos</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Editar/OK da estante: só com produto. No modo Editar, compartilhar e busca
              saem do topo — sobra só o "OK". */}
          {view === 'main' && colecao.length > 0 && (
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.select(); setEditing((e) => !e); }} hitSlop={8} style={p47.editBtn} accessibilityLabel={editing ? 'Concluir edição da estante' : 'Editar estante'}>
              <Text style={[p47.editText, editing && { fontWeight: '700' }]}>{editing ? 'OK' : 'Editar'}</Text>
            </TouchableOpacity>
          )}
          {view === 'main' && colecao.length > 0 && !editing && (
            <TouchableOpacity activeOpacity={0.85} onPress={() => { void shelfRef.current?.share(); }} style={p47.circle36} accessibilityLabel="Compartilhar estante">
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5v6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-6" /></Svg>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );

  // Card de produto do 47a (foto 108 em card branco 150, selo "% compatível", nome e
  // a linha de baixo) — o MESMO na grade das listas e nos carrosséis da estante.
  // `inShelf` = selo "Na estante" no canto da foto (o produto já está na estante dela).
  const ProductCard = <G extends GridItem>(p: G, onPick: (p: G) => void, sub: string | null, style: object, inShelf = false) => (
    <TouchableOpacity key={p.id} activeOpacity={0.85} onPress={() => { haptics.tap(); onPick(p); }} style={[{ gap: 8 }, style]}>
      <View style={p47.imgCard}>
        {inShelf && (
          <View style={p47.shelfTag}>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#C0206A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3.5 3v18M20.5 3v18M3.5 10.5h17M3.5 20h17" />
            </Svg>
            <Text style={p47.shelfTagText}>Na estante</Text>
          </View>
        )}
        {(p.cutoutUrl ?? p.photoUrl)
          ? <ExpoImage source={{ uri: (p.cutoutUrl ?? p.photoUrl)! }} style={{ width: 108, height: 108 }} contentFit="contain" accessibilityLabel={p.name ?? undefined} />
          : <IconHerb />}
      </View>
      <View style={{ gap: 2, paddingHorizontal: 2 }}>
        {(p.match != null || (p.verdict && VEREDITO_TAG[p.verdict])) && (
          <View style={p47.badge}>
            <View style={p47.badgeDot}>
              <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
            </View>
            <Text style={p47.badgeText}>{p.match != null ? `${p.match}% compatível` : VEREDITO_TAG[p.verdict!]}</Text>
          </View>
        )}
        <Text style={p47.name} numberOfLines={3} lineBreakStrategyIOS="push-out">{p.name || 'Produto'}</Text>
        {!!sub && <Text style={p47.sub} numberOfLines={1}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );

  // Grade do 47a (listas do "Ver todos" e resultados da busca): filtros por categoria,
  // título + contagem (+ subtítulo) e a grade de 2 colunas.
  const ProductGrid = <G extends GridItem>(o: {
    items: G[]; cat: string; setCat: (t: string) => void; onPick: (p: G) => void;
    title: string; note?: string; subOf: (p: G) => string | null;
    allTags?: boolean; // true = mostra todas as categorias, mesmo sem produto nelas
    chips?: boolean;   // false = sem os filtros (resultados da busca na estante)
    searchOf?: (p: G) => string; // texto que a busca procura (nome + marca)
    shelfOf?: (p: G) => boolean; // já está na estante? (selo)
  }) => {
    const chips = o.chips !== false;
    const tags = ['Todos', ...CAT_ORDER.filter((c) => o.allTags || o.items.some((p) => p.cat === c))];
    const cur = chips && tags.includes(o.cat) ? o.cat : 'Todos';
    const q = fold(query.trim());
    const shown = o.items.filter((p) => (cur === 'Todos' || p.cat === cur)
      && (!q || fold(o.searchOf ? o.searchOf(p) : (p.name ?? '')).includes(q)));
    // Linhas explícitas de 2 (flexWrap com folga zero quebra no Fabric — README #29).
    const rows: G[][] = [];
    for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));
    return (
      <>
        {chips && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6 }}>
            {tags.map((t) => {
              const on = t === cur;
              return (
                <TouchableOpacity key={t} activeOpacity={0.85} onPress={() => { haptics.select(); o.setCat(t); }} style={[p47.chip, on ? p47.chipOn : p47.chipOff]}>
                  <Text style={[p47.chipText, { fontWeight: on ? '600' : '500', color: on ? INK : '#6E6468' }]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        <View style={p47.titleRow}>
          <Text style={p47.title}>{o.title}</Text>
          <Text style={p47.count}>{shown.length === 1 ? '1 produto' : `${shown.length} produtos`}</Text>
        </View>
        {!!o.note && <Text style={p47.note} lineBreakStrategyIOS="push-out">{o.note}</Text>}
        {!!q && shown.length === 0 && (
          <Text style={[p47.empty, { marginTop: 48, paddingHorizontal: 40 }]} lineBreakStrategyIOS="push-out">
            {`Nenhum produto encontrado para “${query.trim()}”`}
          </Text>
        )}
        <View style={{ marginTop: 12, paddingHorizontal: 18, gap: 18 }}>
          {rows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 9 }}>
              {row.map((p) => ProductCard(p, o.onPick, o.subOf(p), { flex: 1, minWidth: 0 }, !!o.shelfOf?.(p)))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </>
    );
  };

  // Seção da estante: título + "Ver todos" e o carrossel horizontal com os primeiros.
  const Carousel = <G extends GridItem>(o: {
    title: string; items: G[]; onPick: (p: G) => void; subOf: (p: G) => string | null; onAll: () => void;
    shelfOf?: (p: G) => boolean;
  }) => (
    <>
      <View style={p47.sectionRow}>
        <Text style={p47.title}>{o.title}</Text>
        <TouchableOpacity onPress={o.onAll} hitSlop={10} accessibilityLabel={`Ver todos: ${o.title}`}>
          <Text style={p47.seeAll}>Ver todos</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}>
        {o.items.slice(0, CAROUSEL_MAX).map((p) => ProductCard(p, o.onPick, o.subOf(p), { width: CARD_W }, !!o.shelfOf?.(p)))}
      </ScrollView>
    </>
  );

  // Linha de erro com "Tentar de novo" (listas e seções da estante).
  const RetryRow = ({ text, onRetry }: { text: string; onRetry: () => void }) => (
    <View style={{ marginTop: 12, paddingHorizontal: 18, gap: 10, alignItems: 'flex-start' }}>
      <Text style={p47.sub}>{text}</Text>
      <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); onRetry(); }} style={[p47.chip, p47.chipOn]}>
        <Text style={[p47.chipText, { fontWeight: '600', color: INK }]}>Tentar de novo</Text>
      </TouchableOpacity>
    </View>
  );

  // Recomendados = tudo o que a IA indicou e que NÃO está escolhido na rotina.
  const recShown = state === 'ready' ? recList.filter((r) => !inRoutine(r.prod)) : [];
  // Modo escolha: o produto tocado (estante, escaneado ou recomendado) vai para o passo —
  // e para a estante, se ainda não estiver (lib/minhaRotina). Aviso da pele dela; o forte
  // pede confirmação. Depois, volta para a Rotina.
  const escolherParaPasso = async (ref: RefProduto) => {
    const alvo = useAppStore.getState().escolhaParaPasso;
    if (!alvo) return;
    try {
      const uid = await getUserId();
      if (!uid) return;
      const aviso = await avisoDoProduto(uid, ref);
      const salvar = async () => {
        await definirProdutoDoPasso(alvo.passoId, ref, aviso);
        invalidateCache(`minharotina:${uid}`);
        haptics.success();
        voltarParaRotina();
      };
      if (aviso.nivel === 'forte') {
        haptics.warning();
        Alert.alert('Atenção', aviso.texto ?? 'Esse produto pede cuidado na sua pele.', [
          { text: 'Escolher outro', style: 'cancel' },
          { text: 'Usar mesmo assim', style: 'destructive', onPress: () => { void salvar().catch(() => Alert.alert('Não deu pra salvar no passo', 'Tente de novo em instantes.')); } },
        ]);
        return;
      }
      await salvar();
    } catch (e) {
      console.warn('[produtos] escolher para o passo falhou:', e);
      haptics.error();
      Alert.alert('Não deu pra salvar no passo', 'Tente de novo em instantes.');
    }
  };

  const openRec = (r: RecEntry) => setDetail({
    id: r.id, num: '', step: r.step, productId: r.id,
    brand: r.prod.marca, name: r.prod.nome, img: { uri: r.prod.imagem_url }, cutout: r.cutoutUrl ?? null,
    pra: r.copy, praLong: r.copy, targets: targetsOf(r.prod), alts: [],
    categoria: r.prod.categoria ?? null, compat: r.match,
  });
  const recSub = (r: RecEntry) => (r.cat && ALT[r.cat] ? `Alternativa ${ALT[r.cat]}` : 'Alternativa pra sua rotina');
  // Selo "Na estante": o mesmo id (produto do catálogo / scan) OU o mesmo produto pela
  // marca + nome (lib/productMatch — o critério do "um card por produto"). Assim o card
  // do scan mais recente ganha o selo mesmo que a estante guarde um scan anterior, e um
  // recomendado ganha o selo se ela pôs o mesmo produto na estante por um scan.
  const shelfProdIds = new Set(colecao.map((c) => c.produtoId).filter(Boolean));
  const shelfScanIds = new Set(colecao.map((c) => c.productScanId).filter(Boolean));
  const shelfByName = (marca: string | null | undefined, nome: string | null | undefined) =>
    colecao.some((c) => sameProduct({ marca: c.marca, nome: c.nome }, { marca, nome }));
  const recInShelf = (r: RecEntry) => shelfProdIds.has(r.prod.id) || shelfByName(r.prod.marca, r.prod.nome);
  const scanInShelf = (p: ScanItem) => shelfScanIds.has(p.id) || shelfByName(p.brand, p.name);

  // Remover da estante — a MESMA confirmação no modo Editar e na página do produto.
  const confirmRemove = (c: { id: string; nome: string | null }) => {
    confirmShelfRemove(c.nome, async () => {
      try {
        await removeFromColecao(c.id);
        haptics.success();
        setColecao((l) => l.filter((x) => x.id !== c.id));
        void loadColecao();
      } catch (e) {
        console.warn('[estante] falha ao remover', e);
        haptics.error();
        Alert.alert('Não deu pra remover da sua estante', 'Tente de novo em instantes.');
      }
    });
  };

  const colecaoGrid = colecao.map((c) => ({
    id: c.id, photoUrl: c.cutoutUrl ?? c.photoUrl, name: c.nome, cat: catOf(c.categoria), match: c.compat, verdict: c.verdict, c,
  }));
  const searching = searchOpen && !!query.trim();

  // Pílula "Escanear produto" no lugar do balão da câmera do design: CENTRALIZADA,
  // 18pt acima da navbar (design: bottom 105 no frame de 852 = navbar 87 + 18). Ícone de
  // scan (moldura com os 4 cantos). Ao encolher, vira um círculo de 50 no mesmo centro.
  // A ação é a mesma (câmera de produto).
  const Bubbles = () => (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 53 + insets.bottom + 18, alignItems: 'center' }}>
    <TouchableOpacity activeOpacity={0.85} onPress={handleEscanearProduto} accessibilityRole="button" accessibilityLabel="Escanear produto" style={[p47.pill, PILL_PINK && p47.pillPink]}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={PILL_FG} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
      </Svg>
      <Animated.View style={{
        overflow: 'hidden',
        maxWidth: pillT.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }),
        opacity: pillT.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0, 0] }),
      }}>
        <Text numberOfLines={1} style={[p47.pillText, { color: PILL_FG }]}>Escanear produto</Text>
      </Animated.View>
    </TouchableOpacity>
    </View>
  );

  // ── Ícones ──────────────────────────────────────────────────────────────
  const IconHerb = () => (
    <Svg width={s(22)} height={s(22)} viewBox="0 0 24 24" fill="none" stroke={INK_FAINT} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 20h10" />
      <Path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <Path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
      <Path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    </Svg>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
      {/* Fundo do 47a: linear 180° #FFE3EF → #FCEAF2 (30%) → #F9F2F5 (60%–100%). */}
      <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />

      {/* ═══ ESTANTE (tela principal da aba) ═══
          Estante (= coleção; todo produto fica numa prateleira) no topo, com "Editar";
          depois os carrosséis "Recomendados pra você" e "Escaneados recentemente".
          Seção sem produto não aparece; Escaneados vazio vira convite. Com texto na
          busca, a estante dá lugar aos resultados das três origens. */}
      {view === 'main' && (
        <ScrollView style={{ flex: 1 }} scrollEnabled={scrollOn} onScroll={onListScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: searchOpen ? 190 : 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {searching ? (() => {
            const q = fold(query.trim());
            const hit = (t: string) => fold(t).includes(q);
            const col = colecaoGrid.filter((p) => hit(`${p.c.nome ?? ''} ${p.c.marca ?? ''}`));
            const rec = recShown.filter((r) => hit(`${r.prod.nome ?? ''} ${r.prod.marca ?? ''}`));
            const sc = scansShown.filter((p) => hit(`${p.name ?? ''} ${p.brand ?? ''}`));
            if (!col.length && !rec.length && !sc.length) {
              return (
                <Text style={[p47.empty, { marginTop: 64, paddingHorizontal: 40 }]} lineBreakStrategyIOS="push-out">
                  {`Nenhum produto encontrado para “${query.trim()}”`}
                </Text>
              );
            }
            return (
              <>
                {col.length > 0 && ProductGrid({ items: col, cat: 'Todos', setCat: () => {}, chips: false, onPick: (p) => { void openColecaoItem(p.c); }, title: 'Na sua estante', subOf: (p) => p.c.marca })}
                {rec.length > 0 && ProductGrid({ items: rec, cat: 'Todos', setCat: () => {}, chips: false, onPick: openRec, title: 'Recomendados pra você', subOf: recSub, shelfOf: recInShelf })}
                {sc.length > 0 && ProductGrid({ items: sc, cat: 'Todos', setCat: () => {}, chips: false, onPick: setScanDetail, title: 'Escaneados', subOf: (p) => fmtWhen(p.createdAt), shelfOf: scanInShelf })}
              </>
            );
          })() : (
            <>
              <View style={{ height: 15 }} />
              <Shelf
                ref={shelfRef}
                items={colecao}
                loaded={colState === 'ready'}
                editing={editing}
                onPick={(c) => { void openColecaoItem(c); }}
                onRemove={(c) => confirmRemove(c)}
                onDragActive={setScrollOn}
                onScan={() => router.push('/(scan)/product-camera' as any)}
              />
              {colState === 'error' && <RetryRow text="Não deu pra carregar sua estante agora." onRetry={loadColecao} />}

              {/* Recomendados pra você */}
              {state === 'generating' && (
                <>
                  <View style={p47.sectionRow}><Text style={p47.title}>Recomendados pra você</Text></View>
                  <View style={{ marginTop: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color="#FF5EA8" />
                    {/* Usuária legada: a recomendação está sendo gerada agora (IA, uma vez na vida da conta). */}
                    <Text style={p47.sub}>Montando sua recomendação…</Text>
                  </View>
                </>
              )}
              {state === 'error' && (
                <>
                  <View style={p47.sectionRow}><Text style={p47.title}>Recomendados pra você</Text></View>
                  <RetryRow text="Não deu pra carregar suas recomendações agora." onRetry={load} />
                </>
              )}
              {recShown.length > 0 && Carousel<RecEntry>({
                title: 'Recomendados pra você', items: recShown, onPick: openRec, subOf: recSub, shelfOf: recInShelf,
                onAll: () => openList('recomendados'),
              })}

              {/* Escaneados recentemente — vazio vira convite para o 1º scan */}
              {scanState === 'ready' && scansShown.length > 0 && Carousel<ScanItem>({
                title: 'Escaneados recentemente', items: scansShown, onPick: setScanDetail, shelfOf: scanInShelf,
                subOf: (p) => fmtWhen(p.createdAt), onAll: () => openList('escaneados'),
              })}
              {scanState === 'empty' && (
                <>
                  <View style={p47.sectionRow}><Text style={p47.title}>Escaneados recentemente</Text></View>
                  <TouchableOpacity activeOpacity={0.85} onPress={handleEscanearProduto} style={p47.invite} accessibilityLabel="Escanear meu primeiro produto">
                    <View style={p47.inviteIcon}>
                      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#FF5EA8" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M14.5 4.5h-5L8 6.5H5A1.5 1.5 0 0 0 3.5 8v10A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 19 6.5h-3z" />
                        <Circle cx={12} cy={12.75} r={3.5} />
                      </Svg>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={p47.inviteTitle}>Escaneie seu primeiro produto</Text>
                      <Text style={p47.sub} lineBreakStrategyIOS="push-out">Descubra se ele combina com a sua pele.</Text>
                    </View>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#B5ABB0" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>
                  </TouchableOpacity>
                </>
              )}
              {scanState === 'error' && (
                <>
                  <View style={p47.sectionRow}><Text style={p47.title}>Escaneados recentemente</Text></View>
                  <RetryRow text="Não deu pra carregar seus escaneados agora." onRetry={loadScans} />
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ═══ LISTA COMPLETA: ESCANEADOS ("Ver todos") ═══ */}
      {view === 'escaneados' && (
        <ScrollView style={{ flex: 1 }} onScroll={onListScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: searchOpen ? 190 : 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {scanState === 'loading' && (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
              <ActivityIndicator size="large" color="#FF5EA8" />
            </View>
          )}
          {scanState === 'error' && <RetryRow text="Não deu pra carregar seus escaneados agora." onRetry={loadScans} />}
          {(scanState === 'ready' || scanState === 'empty') && ProductGrid<ScanItem>({
            // Modo escolha: sem o que já está na estante (como na folha — não aparece duas vezes).
            items: scanState === 'ready' ? (escolha ? scansShown.filter((p) => !scanInShelf(p)) : scansShown) : [],
            cat: catS, setCat: setCatS,
            onPick: escolha ? (p) => { void escolherParaPasso({ origem: 'escaneado', id: p.id }); } : setScanDetail,
            searchOf: (p) => `${p.name ?? ''} ${p.brand ?? ''}`,
            title: 'Escaneados recentemente',
            note: escolha
              ? `Toque num produto para usar no passo “${escolha.nome}”.`
              : 'Seus últimos escaneamentos, do mais recente pro mais antigo.',
            subOf: (p) => fmtWhen(p.createdAt), shelfOf: scanInShelf,
          })}
        </ScrollView>
      )}

      {/* ═══ ESTANTE EM MODO ESCOLHA ("Ver todos" da estante na folha) ═══
          Só as prateleiras: tocar num produto põe no passo e volta para a Rotina. Arrastar
          desligado; sem carrosséis, "Editar", compartilhar e pílula. */}
      {view === 'estante' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {!!escolha && (
            <Text style={[p47.note, { marginTop: 14, marginBottom: 12 }]} lineBreakStrategyIOS="push-out">
              {`Toque num produto para usar no passo “${escolha.nome}”.`}
            </Text>
          )}
          {colState === 'error' ? (
            <RetryRow text="Não deu pra carregar sua estante agora." onRetry={loadColecao} />
          ) : (
            <Shelf
              items={colecao}
              loaded={colState === 'ready'}
              editing={false}
              semArraste
              onPick={(c) => { if (escolha) void escolherParaPasso({ origem: 'estante', id: c.id }); }}
              onRemove={() => {}}
              onDragActive={() => {}}
              onScan={() => {}}
            />
          )}
        </ScrollView>
      )}

      {/* ═══ LISTA COMPLETA: RECOMENDADOS ("Ver todos") ═══
          Tudo o que a IA recomendou e que NÃO está escolhido na rotina (a rotina só tem um
          produto por passo — o resto das recomendações fica aqui). Tocar abre o detalhe,
          com "Salvar na minha rotina". */}
      {view === 'recomendados' && (
        <ScrollView style={{ flex: 1 }} onScroll={onListScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: searchOpen ? 190 : 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {(state === 'loading' || state === 'generating') && (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 }}>
              <ActivityIndicator size="large" color="#FF5EA8" />
              {state === 'generating' && <Text style={[p47.note, { textAlign: 'center' }]}>Montando sua recomendação…</Text>}
            </View>
          )}
          {state === 'error' && <RetryRow text="Não deu pra carregar suas recomendações agora." onRetry={load} />}
          {(state === 'ready' || state === 'empty') && ProductGrid<RecEntry>({
            // Modo escolha: TODOS os recomendados (inclusive os que já estão em algum passo).
            items: escolha ? (state === 'ready' ? recList : []) : recShown,
            cat: catR, setCat: setCatR,
            searchOf: (r) => `${r.prod.nome ?? ''} ${r.prod.marca ?? ''}`,
            onPick: escolha ? (r) => { void escolherParaPasso({ origem: 'catalogo', id: r.id }); } : openRec,
            title: 'Recomendados pra você',
            note: escolha
              ? `Toque num produto para usar no passo “${escolha.nome}”.`
              : 'Alternativas que a IA indicou pra sua pele e que ficaram fora da rotina.',
            subOf: recSub, shelfOf: recInShelf,
          })}
        </ScrollView>
      )}

      {/* Balão da câmera — some durante a busca e no modo escolha (um scan dali não iria para o passo) */}
      {!searchOpen && !escolha && Bubbles()}

      {/* Busca: barra colada no teclado (ou acima da navbar, depois do Enter) */}
      {searchOpen && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(249,242,245,0)', 'rgba(249,242,245,0.95)', 'rgba(249,242,245,0.95)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: (kbH > 0 ? kbH + 8 : 53 + insets.bottom + 12) + 46 + 40, zIndex: 39 }}
        />
      )}
      {searchOpen && (
        <View style={[p47.searchWrap, { bottom: kbH > 0 ? kbH + 8 : 53 + insets.bottom + 12 }]}>
          <View style={p47.searchBar}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8A8385" strokeWidth={1.9} strokeLinecap="round">
              <Circle cx={11} cy={11} r={6.5} />
              <Path d="M16 16l4 4" />
            </Svg>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="never"
              placeholder={view === 'main' ? 'Buscar nos seus produtos' : view === 'recomendados' ? 'Buscar nos recomendados' : 'Buscar nos escaneados'}
              placeholderTextColor="#A39A9F"
              style={p47.searchInput}
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Limpar busca">
                <View style={p47.searchClear}>
                  <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
                </View>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => { haptics.tap(); closeSearch(); }} hitSlop={8}>
            <Text style={p47.searchCancel}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Detalhe do produto — réplica do design 47c (NiksProductDetailFlo) ──────
          Foto em card branco, selo de compatibilidade, marca, nome, tags (concerns reais)
          e a descrição; embaixo, fixo sobre um esmaecido, "Adicionar à estante" (ou o selo
          "Na sua estante"). O "Salvar na minha rotina" saiu (Fase 2 do plano da Rotina):
          o produto de um passo agora se escolhe na própria Rotina, na folha "Escolher produto". */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)} transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
          <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
          {detail && (() => {
            const owned = !!detailCol.owned;
            return (
              <>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
                  <View style={[pd.imgCard, { marginTop: insets.top + 63 }]}>
                    <ExpoImage source={detail.cutout ? { uri: detail.cutout } : detail.img} style={{ width: 170, height: 196 }} contentFit="contain" accessibilityLabel={detail.name} />
                  </View>
                  <View style={{ marginTop: 18, paddingHorizontal: 20 }}>
                    {detail.compat != null && (
                      <View style={pd.badge}>
                        <View style={pd.badgeDot}>
                          <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
                        </View>
                        <Text style={pd.badgeText}>{`${detail.compat}% compatível com sua pele`}</Text>
                      </View>
                    )}
                    {!!detail.brand && <Text style={pd.brand}>{detail.brand}</Text>}
                    <Text style={pd.name} lineBreakStrategyIOS="push-out">{detail.name}</Text>
                    {!!(detail.targets && detail.targets.length) && (
                      <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {detail.targets!.map((tg) => (
                          <View key={tg} style={pd.tag}><Text style={pd.tagText}>{tg}</Text></View>
                        ))}
                      </View>
                    )}
                    {!!detail.praLong && <Text style={pd.desc} lineBreakStrategyIOS="push-out">{detail.praLong}</Text>}
                  </View>
                </ScrollView>

                {/* fechar */}
                <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); setDetail(null); }} style={[pd.close, { top: insets.top + 15 }]} accessibilityLabel="Fechar">
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
                </TouchableOpacity>

                {/* esmaecido + botões fixos */}
                <LinearGradient pointerEvents="none" colors={['rgba(249,242,245,0)', 'rgba(249,242,245,0.95)', 'rgba(249,242,245,0.95)']} locations={[0, 0.4, 1]} style={pd.fade} />
                <View style={[pd.actions, { bottom: Math.max(insets.bottom, 20) }]}>
                  {/* Estante: "Adicionar à estante" ou o selo "Na sua estante" (ShelfStatus —
                      o mesmo visual do resultado do scan). Lendo o estado: nada. */}
                  {detailSrc && detailCol.owned !== null && (
                    <ShelfAddButton owned={owned} busy={detailCol.busy} onAdd={() => { void detailCol.toggle(); }} />
                  )}
                  {detailSrc && (
                    <ShelfRemoveLink owned={owned} busy={detailCol.busy} name={detail.name} onRemove={() => { void detailCol.toggle(); }} style={{ marginTop: 2 }} />
                  )}
                </View>
              </>
            );
          })()}
        </View>
      </Modal>

      {/* ── Detalhe de PRODUTO ESCANEADO ────────────────────────────────────────
          MESMA tela do resultado do scan (`app/(scan)/product-result.tsx`): as duas
          renderizam `components/product/ProductAnalysis`. Não duplicar o layout aqui —
          já divergiram uma vez (o modal ficou com o design antigo). */}
      <Modal visible={!!scanDetail} animationType="slide" onRequestClose={() => setScanDetail(null)} transparent={false}>
        {scanDetail && (
          <ProductAnalysis
            result={scanDetail.result}
            photoUri={scanDetail.photoUrl}
            cutoutUri={scanDetail.cutoutUrl ?? null}
            onClose={() => setScanDetail(null)}
            onRescan={() => {
              setScanDetail(null);
              router.push('/(scan)/product-camera' as any);
            }}
            colecao={scanSrc && scanCol.owned !== null ? { owned: scanCol.owned, busy: scanCol.busy, onToggle: scanCol.toggle } : undefined}
          />
        )}
      </Modal>
    </View>
  );
}

// ── Estilos do design 47a (NiksProductsFlo, frame 393×852) ──────────────────────
// SF Pro (fonte do sistema). Sombras CSS → iOS: blur/2 = shadowRadius.
const p47 = StyleSheet.create({
  topRow: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  topTitle: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK },
  circle36: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
  seg: { marginTop: 18, marginHorizontal: 14, flexDirection: 'row', gap: 2, padding: 3, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.55)' },
  segItem: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', height: 36, paddingHorizontal: 12, borderRadius: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  segItemOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5,
  },
  segText: { fontSize: 15, letterSpacing: -0.3 },
  chip: { height: 34, paddingHorizontal: 15, borderRadius: 100, justifyContent: 'center' },
  chipOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5,
  },
  chipOff: { backgroundColor: 'rgba(255,255,255,0.55)' },
  chipText: { fontSize: 15, letterSpacing: -0.2 },
  titleRow: { marginTop: 20, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  // Seções da estante (carrosséis): título + "Ver todos".
  sectionRow: { marginTop: 30, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  seeAll: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: '#E8468F' },
  // Escaneados vazio: convite para o 1º scan (card branco do 47a).
  invite: {
    marginTop: 12, marginHorizontal: 18, padding: 16, borderRadius: 13, backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
  },
  inviteIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFE3EF', alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  title: { fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },
  count: { fontSize: 15, letterSpacing: -0.2, color: '#8A8385' },
  empty: { fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: '#6E6468', textAlign: 'center' },
  note: { marginTop: 4, paddingHorizontal: 18, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: '#6E6468' },
  imgCard: {
    height: 150, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
  },
  badge: {
    alignSelf: 'flex-start', height: 24, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingLeft: 4, paddingRight: 9, marginBottom: 4, borderRadius: 100, backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(192,32,106)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4,
  },
  badgeDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF5EA8', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: '#C0206A' },
  // Selo "Na estante" no canto da foto do card (rosa claro do redesign + rosa escuro).
  shelfTag: {
    position: 'absolute', top: 8, left: 8, zIndex: 2, height: 22, paddingHorizontal: 8, borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFE3EF',
  },
  shelfTagText: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1, color: '#C0206A' },
  // "Editar"/"OK" da estante, no topo: texto rosa (o mesmo do "Ver todos"/"Cancelar").
  editBtn: { height: 36, paddingHorizontal: 6, justifyContent: 'center' },
  editText: { fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: '#E8468F' },
  name: { fontSize: 16, fontWeight: '500', lineHeight: 20, letterSpacing: -0.3, color: INK },
  sub: { fontSize: 15, fontWeight: '400', lineHeight: 20, letterSpacing: -0.2, color: '#8A8385' },
  searchWrap: { position: 'absolute', left: 14, right: 14, zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBar: {
    flex: 1, height: 46, borderRadius: 100, backgroundColor: '#FFFFFF', paddingLeft: 14, paddingRight: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8,
  },
  searchInput: { flex: 1, fontSize: 17, letterSpacing: -0.3, color: INK, paddingVertical: 0 },
  searchClear: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#C9BFC4', alignItems: 'center', justifyContent: 'center' },
  searchCancel: { fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: '#E8468F' },
  // Pílula "Escanear produto" (centralizada; 50 de altura, encolhida = círculo de 50).
  pill: {
    height: 50, minWidth: 50, borderRadius: 25, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
  // Teste PILL_PINK: rosa cheio com a sombra rosa das cápsulas do redesign.
  pillPink: {
    backgroundColor: '#FF5EA8',
    shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  pillText: { paddingLeft: 8, paddingRight: 4, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: INK },
});

// ── Estilos do design 47c (NiksProductDetailFlo) — detalhe do produto ────────────
const pd = StyleSheet.create({
  imgCard: {
    marginHorizontal: 18, height: 236, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
  },
  badge: {
    alignSelf: 'flex-start', height: 26, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 5, paddingRight: 11, borderRadius: 100, backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(192,32,106)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4,
  },
  badgeDot: { width: 17, height: 17, borderRadius: 8.5, backgroundColor: '#FF5EA8', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: '#C0206A' },
  brand: { marginTop: 16, fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: '#8A8385' },
  name: { marginTop: 4, fontSize: 28, fontWeight: '700', lineHeight: 33, letterSpacing: -0.6, color: INK },
  tag: { height: 30, paddingHorizontal: 13, borderRadius: 100, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
  tagText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.2, color: '#6E6468' },
  desc: { marginTop: 16, fontSize: 17, fontWeight: '400', lineHeight: 23, letterSpacing: -0.3, color: '#3D3639' },
  close: {
    position: 'absolute', right: 20, zIndex: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  actions: { position: 'absolute', left: 18, right: 18, gap: 10 },
});
