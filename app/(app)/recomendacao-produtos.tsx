import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, Modal, TouchableOpacity, TextInput, Keyboard,
  useWindowDimensions, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { concernLabel } from '../../lib/concernLabels';
import { saveProductForStep, normStepKey, getSavedProducts, type SavedProduct } from '../../lib/savedProducts';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { listColecao, requestMissingColecaoCutouts, type ColecaoItem } from '../../lib/colecao';
import { getScanCutouts, requestMissingScanCutouts } from '../../lib/scanCutouts';
import { useColecaoToggle } from '../../hooks/useColecaoToggle';
import { getUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';

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

type ScanItem = {
  id: string;
  photoUrl: string | null;
  brand: string | null;
  name: string | null;
  createdAt: string;
  result: any;            // objeto `resultado` (resposta da analisar-produto)
  cat: string | null;     // uma das CAT_ORDER (filtros), ou null se não casar
  match: number | null;   // resultado.compatibilidade (0–100); scans antigos não têm
  cutoutUrl?: string | null;    // recorte sem fundo (Fase 3), quando pronto
  cutoutStatus?: string | null; // null = scan antigo, ainda sem pedido de recorte
  verdict?: string | null;      // veredito da análise (tag quando não há %)
};

// Filtros do 47a, na ordem do design. A categoria da analisar-produto é texto livre
// ("sérum facial", "gel de limpeza", "protetor solar com cor"…) → agrupa por palavra.
const CAT_ORDER = ['Limpeza', 'Tônico', 'Sérum', 'Hidratante', 'Protetor solar'] as const;
// Tag no lugar do "% compatível" quando o scan é antigo e não tem o número.
const VEREDITO_TAG: Record<string, string> = { pode_usar: 'Pode usar', com_ressalva: 'Com ressalva', evitaria: 'Evitaria' };
// "Alternativa ao seu protetor" etc. — linha de baixo dos cards da aba Recomendados.
const ALT: Record<string, string> = {
  'Limpeza': 'à sua limpeza', 'Tônico': 'ao seu tônico', 'Sérum': 'ao seu sérum',
  'Hidratante': 'ao seu hidratante', 'Protetor solar': 'ao seu protetor',
};
function catOf(raw?: string | null): string | null {
  const c = (raw ?? '').toLowerCase();
  if (!c) return null;
  if (/protetor|fps|solar/.test(c)) return 'Protetor solar';
  if (/limp|sabonete|micelar|cleans/.test(c)) return 'Limpeza';
  if (/t[oô]nico|toner|essência|essencia/.test(c)) return 'Tônico';
  if (/s[ée]rum|ampoule|booster/.test(c)) return 'Sérum';
  if (/hidrat|creme|loção|locao|gel/.test(c)) return 'Hidratante';
  return null;
}

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
  const [savedNow, setSavedNow] = useState(false);   // feedback do "Salvar na minha rotina"
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
  // Deep-link da Rotina ("Ver produto recomendado"): passo + período, porque a tela de
  // Rotina conhece o NOME do passo, não o produto_id.
  const productDetailStep = useAppStore((s) => s.productDetailStep);
  const setProductDetailStep = useAppStore((s) => s.setProductDetailStep);

  // Abas (design 47a): "Minha coleção" (o que a usuária tem em casa) | "Recomendados"
  // (recomendação salva) | "Escaneados" (histórico de product_scans). Abre na coleção.
  const [tab, setTab] = useState<'colecao' | 'recomendados' | 'escaneados'>('colecao');
  const [scanState, setScanState] = useState<LoadState>('loading');
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [scanDetail, setScanDetail] = useState<ScanItem | null>(null);
  const [catC, setCatC] = useState<string>('Todos'); // filtro da coleção
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
    if (hit) { setTab('recomendados'); setDetail(hit); }
    setProductDetailTarget(null);
  }, [productDetailTarget, state, am, pm, setProductDetailTarget]);

  // Deep-link da Rotina: abre o detalhe do produto do passo tocado. Casa pelo NOME do
  // passo normalizado (mesma chave de `lib/savedProducts`) dentro do período de origem;
  // se não achar lá, procura no outro período (passos 'am+pm' aparecem nos dois). Passo
  // sem produto (`empty`) ou nome que não casa → só abre a tela no topo, como antes.
  useEffect(() => {
    if (!productDetailStep || state !== 'ready') return;
    const key = normStepKey(productDetailStep.passo);
    const [primary, secondary] = productDetailStep.periodo === 'pm' ? [pm, am] : [am, pm];
    const match = (list: Item[]) => list.find((it) => !it.empty && normStepKey(it.step) === key);
    const hit = match(primary) ?? match(secondary);
    if (hit) { setTab('recomendados'); setDetail(hit); }
    setProductDetailStep(null);
  }, [productDetailStep, state, am, pm, setProductDetailStep]);

  // ── Histórico "Escaneados" (tabela product_scans, RLS = só as próprias linhas) ──
  // A foto está no bucket privado `product-scans`; gera URLs assinadas em lote.
  const loadScans = useCallback(async () => {
    setScanState('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) { setScanState('empty'); return; }

      const { data: rows, error } = await supabase
        .from('product_scans')
        .select('id, image_path, produto_nome, produto_marca, resultado, created_at, recorte_status, recorte_path, recorte_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) { setScanState('error'); return; }
      if (!rows || rows.length === 0) { setScanState('empty'); return; }

      const paths = [
        ...rows.map((r: any) => r.image_path),
        ...rows.filter((r: any) => r.recorte_status === 'ok' && r.recorte_path && !r.recorte_url).map((r: any) => r.recorte_path),
      ].filter(Boolean) as string[];
      const signedMap = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('product-scans').createSignedUrls(paths, 3600);
        (signed ?? []).forEach((sn: any) => {
          if (sn?.path && sn?.signedUrl && !sn.error) signedMap.set(sn.path, sn.signedUrl);
        });
      }

      const items: ScanItem[] = rows.map((r: any) => ({
        id: r.id,
        photoUrl: r.image_path ? (signedMap.get(r.image_path) ?? null) : null,
        brand: r.produto_marca ?? r.resultado?.produto?.marca ?? null,
        name: r.produto_nome ?? r.resultado?.produto?.nome ?? null,
        createdAt: r.created_at,
        result: r.resultado,
        cat: catOf(r.resultado?.produto?.categoria),
        match: typeof r.resultado?.compatibilidade === 'number' ? Math.round(r.resultado.compatibilidade) : null,
        cutoutUrl: r.recorte_status === 'ok' ? (r.recorte_url ?? (r.recorte_path ? signedMap.get(r.recorte_path) ?? null : null)) : null,
        cutoutStatus: r.recorte_status ?? null,
        verdict: typeof r.resultado?.veredito === 'string' ? r.resultado.veredito : null,
      }));
      setScans(items);
      setScanState('ready');
    } catch {
      setScanState('error');
    }
  }, []);

  // Scans antigos (de antes do recorte automático) ainda sem recorte: pede um por vez,
  // dentro da cota da sessão (40, dividida com coleção/estante — lib/scanCutouts), e
  // atualiza a grade conforme ficam prontos.
  useEffect(() => {
    if (tab !== 'escaneados') return;
    void requestMissingScanCutouts(
      scans.filter((s) => s.result?.status === 'ok').map((s) => ({ id: s.id, status: s.cutoutStatus })),
      async (id, st) => {
        const c = (await getScanCutouts([id]))[id];
        setScans((list) => list.map((x) => (x.id === id ? { ...x, cutoutStatus: c?.status ?? st, cutoutUrl: c?.url ?? null } : x)));
      },
    );
  }, [tab, scans]);

  // Recarrega os escaneados ao abrir a aba e ao voltar para a tela (ex.: depois de
  // escanear um produto no balão da câmera) — sempre frescos.
  useFocusEffect(useCallback(() => {
    if (tab === 'escaneados') loadScans();
  }, [tab, loadScans]));

  // Produtos escolhidos na rotina — recarrega ao focar (a usuária pode ter trocado na Rotina).
  useFocusEffect(useCallback(() => { getSavedProducts().then(setSaved).catch(() => {}); }, []));

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
  // Recarrega sempre que a tela ganha foco (e ao trocar de aba): um "Tenho em casa"
  // marcado no resultado do scan ou em outra tela já aparece aqui na volta.
  useFocusEffect(useCallback(() => { loadColecao(); }, [tab, loadColecao]));

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

  // Reseta o feedback do botão sempre que abre/troca o detalhe.
  useEffect(() => { setSavedNow(false); }, [detail]);

  // "Salvar na minha rotina": guarda a foto do produto p/ o passo (detail.step).
  // A tela de Rotina (protocolo) lê isso e troca o ícone do passo pela foto.
  const handleSaveToRoutine = async () => {
    if (!detail) return;
    const img: any = detail.img;
    const imageUrl = img && typeof img === 'object' && 'uri' in img ? img.uri : null;
    if (!imageUrl) return;
    // O pulso de sucesso só vale se a escrita REALMENTE aconteceu — confirmar no
    // tato antes do await faria o app dizer "salvo" para um salvamento que falhou.
    try {
      await saveProductForStep(detail.step, { imageUrl, brand: detail.brand ?? null, name: detail.name ?? null });
      getSavedProducts().then(setSaved).catch(() => {});
      haptics.success();
      setSavedNow(true);
    } catch (e) {
      console.warn('[produtos] falha ao salvar na rotina:', e);
      haptics.error();
    }
  };

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
  // Topo que rola junto com o conteúdo (no design ele está DENTRO da rolagem):
  // foto + "Meus produtos" · busca, e as abas em cápsula "Minha coleção | Recomendados".
  const PageTop = () => (
    <>
      <View style={{ height: insets.top + 15 }} />
      <View style={p47.topRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {fotoUrl
            ? <Image source={{ uri: fotoUrl }} style={p47.avatar} />
            : <View style={[p47.avatar, { backgroundColor: '#F6D3E1' }]} />}
          <Text style={p47.topTitle}>Meus produtos</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); setSearchOpen(true); }} style={p47.circle36} accessibilityLabel="Buscar">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round">
            <Circle cx={11} cy={11} r={6.5} />
            <Path d="M16 16l4 4" />
          </Svg>
        </TouchableOpacity>
      </View>
      <View style={p47.seg}>
        {([['colecao', 'Minha coleção'], ['recomendados', 'Recomendados'], ['escaneados', 'Escaneados']] as const).map(([id, label]) => {
          const on = tab === id;
          return (
            <TouchableOpacity key={id} activeOpacity={0.85} onPress={() => { haptics.select(); setTab(id); }} style={[p47.segItem, on && p47.segItemOn]}>
              <Text numberOfLines={1} style={[p47.segText, { fontWeight: on ? '600' : '500', color: on ? INK : '#6E6468' }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  // Grade do 47a, a mesma nas abas "Minha coleção" e "Escaneados": filtros por
  // categoria, título + contagem (+ subtítulo nos escaneados) e a grade de 2 colunas
  // (foto 108 em card branco 150, selo "% compatível", nome e a linha de baixo).
  const ProductGrid = <G extends GridItem>(o: {
    items: G[]; cat: string; setCat: (t: string) => void; onPick: (p: G) => void;
    title: string; note?: string; subOf: (p: G) => string | null;
    allTags?: boolean; // true = mostra todas as categorias, mesmo sem produto nelas
    searchOf?: (p: G) => string; // texto que a busca procura (nome + marca)
  }) => {
    const tags = ['Todos', ...CAT_ORDER.filter((c) => o.allTags || o.items.some((p) => p.cat === c))];
    const cur = tags.includes(o.cat) ? o.cat : 'Todos';
    const q = fold(query.trim());
    const shown = o.items.filter((p) => (cur === 'Todos' || p.cat === cur)
      && (!q || fold(o.searchOf ? o.searchOf(p) : (p.name ?? '')).includes(q)));
    // Linhas explícitas de 2 (flexWrap com folga zero quebra no Fabric — README #29).
    const rows: G[][] = [];
    for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));
    return (
      <>
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
              {row.map((p) => (
                <TouchableOpacity key={p.id} activeOpacity={0.85} onPress={() => { haptics.tap(); o.onPick(p); }} style={{ flex: 1, minWidth: 0, gap: 8 }}>
                  <View style={p47.imgCard}>
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
                    <Text style={p47.name} lineBreakStrategyIOS="push-out">{p.name || 'Produto'}</Text>
                    {!!o.subOf(p) && <Text style={p47.sub}>{o.subOf(p)}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </>
    );
  };

  // Balões flutuantes do design: estante (esquerda) e câmera (direita), 18pt acima
  // da navbar (design: bottom 105 no frame de 852 = navbar 87 + 18).
  const Bubbles = () => (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); router.push('/estante' as any); }} accessibilityLabel="Minha estante" style={[p47.bubble, { left: 18, bottom: 53 + insets.bottom + 18 }]}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3.5 3v18M20.5 3v18M3.5 10.5h17M3.5 20h17" />
          <Path d="M7 10.5V6.5M10 10.5V5.5M14.5 20v-5M17.5 20v-3.5" />
        </Svg>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.85} onPress={handleEscanearProduto} accessibilityLabel="Fotografar produto" style={[p47.bubble, { right: 18, bottom: 53 + insets.bottom + 18 }]}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14.5 4.5h-5L8 6.5H5A1.5 1.5 0 0 0 3.5 8v10A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 19 6.5h-3z" />
          <Circle cx={12} cy={12.75} r={3.5} />
        </Svg>
      </TouchableOpacity>
    </>
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

      {/* ═══ ABA MINHA COLEÇÃO (design 47a) ═══
          O que a usuária marcou "Tenho em casa" (colecao_produtos). Foto = o recorte sem
          fundo quando já está pronto; senão, a foto original. */}
      {tab === 'colecao' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: searchOpen ? 190 : 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {ProductGrid<GridItem & { c: ColecaoItem }>({
            items: colecao.map((c) => ({
              id: c.id, photoUrl: c.cutoutUrl ?? c.photoUrl, name: c.nome, cat: catOf(c.categoria), match: c.compat, verdict: c.verdict, c,
            })),
            cat: catC, setCat: setCatC, onPick: (p) => { void openColecaoItem(p.c); },
            title: 'Tenho em casa', subOf: (p) => p.c.marca, allTags: true,
            searchOf: (p) => `${p.c.nome ?? ''} ${p.c.marca ?? ''}`,
          })}
          {colState === 'ready' && colecao.length === 0 && !query.trim() && (
            // Coleção vazia: mensagem no centro do espaço que sobra.
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
              <Text style={p47.empty} lineBreakStrategyIOS="push-out">Adicione aqui os produtos que você tem na sua casa</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ═══ ABA ESCANEADOS (design 47a) ═══ */}
      {tab === 'escaneados' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: searchOpen ? 190 : 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {scanState === 'loading' && (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
              <ActivityIndicator size="large" color="#FF5EA8" />
            </View>
          )}
          {scanState === 'error' && (
            <View style={{ marginTop: 20, paddingHorizontal: 18, gap: 10, alignItems: 'flex-start' }}>
              <Text style={p47.sub}>Não deu pra carregar seus escaneados agora.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); loadScans(); }} style={[p47.chip, p47.chipOn]}>
                <Text style={[p47.chipText, { fontWeight: '600', color: INK }]}>Tentar de novo</Text>
              </TouchableOpacity>
            </View>
          )}
          {(scanState === 'ready' || scanState === 'empty') && ProductGrid<ScanItem>({
            items: scanState === 'ready' ? scans : [], cat: catS, setCat: setCatS, onPick: setScanDetail,
            searchOf: (p) => `${p.name ?? ''} ${p.brand ?? ''}`,
            title: 'Escaneados recentemente',
            note: 'Seus últimos escaneamentos, do mais recente pro mais antigo.',
            subOf: (p) => fmtWhen(p.createdAt),
          })}
        </ScrollView>
      )}

      {/* ═══ ABA RECOMENDADOS (design 47a) ═══
          Tudo o que a IA recomendou e que NÃO está escolhido na rotina (a rotina só tem um
          produto por passo — o resto das recomendações fica aqui). Tocar abre o detalhe,
          com "Salvar na minha rotina". */}
      {tab === 'recomendados' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: searchOpen ? 190 : 120 }} showsVerticalScrollIndicator={false}>
          {PageTop()}
          {(state === 'loading' || state === 'generating') && (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 }}>
              <ActivityIndicator size="large" color="#FF5EA8" />
              {/* Usuária legada: a recomendação está sendo gerada agora (IA, uma vez na vida da conta). */}
              {state === 'generating' && <Text style={[p47.note, { textAlign: 'center' }]}>Montando sua recomendação…</Text>}
            </View>
          )}
          {state === 'error' && (
            <View style={{ marginTop: 20, paddingHorizontal: 18, gap: 10, alignItems: 'flex-start' }}>
              <Text style={p47.sub}>Não deu pra carregar suas recomendações agora.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); load(); }} style={[p47.chip, p47.chipOn]}>
                <Text style={[p47.chipText, { fontWeight: '600', color: INK }]}>Tentar de novo</Text>
              </TouchableOpacity>
            </View>
          )}
          {(state === 'ready' || state === 'empty') && ProductGrid<RecEntry>({
            items: state === 'ready' ? recList.filter((r) => !inRoutine(r.prod)) : [],
            cat: catR, setCat: setCatR,
            searchOf: (r) => `${r.prod.nome ?? ''} ${r.prod.marca ?? ''}`,
            onPick: (r) => setDetail({
              id: r.id, num: '', step: r.step, productId: r.id,
              brand: r.prod.marca, name: r.prod.nome, img: { uri: r.prod.imagem_url }, cutout: r.cutoutUrl ?? null,
              pra: r.copy, praLong: r.copy, targets: targetsOf(r.prod), alts: [],
              categoria: r.prod.categoria ?? null, compat: r.match,
            }),
            title: 'Recomendados pra você',
            note: 'Alternativas que a IA indicou pra sua pele e que ficaram fora da rotina.',
            subOf: (r) => (r.cat && ALT[r.cat] ? `Alternativa ${ALT[r.cat]}` : 'Alternativa pra sua rotina'),
          })}
        </ScrollView>
      )}

      {/* Balões do 47a: estante (esquerda) e câmera (direita) — somem durante a busca */}
      {!searchOpen && Bubbles()}

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
              placeholder={tab === 'colecao' ? 'Buscar na sua coleção' : tab === 'recomendados' ? 'Buscar nos recomendados' : 'Buscar nos escaneados'}
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
          e a descrição; embaixo, fixos sobre um esmaecido, "Adicionar à coleção" e
          "Salvar na minha rotina" (este só quando o produto veio de um passo). */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)} transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
          <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
          {detail && (() => {
            const inRot = savedNow || (!!detail.step && !!saved[normStepKey(detail.step)]
              && saved[normStepKey(detail.step)].imageUrl === (detail.img && typeof detail.img === 'object' && 'uri' in detail.img ? detail.img.uri : ''));
            const owned = !!detailCol.owned;
            return (
              <>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 170 }} showsVerticalScrollIndicator={false}>
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
                  {detailSrc && (
                    <TouchableOpacity activeOpacity={0.85} disabled={detailCol.busy || detailCol.owned === null} onPress={() => { haptics.tap(); void detailCol.toggle(); }} style={[pd.btn, pd.btnOwn, detailCol.busy && { opacity: 0.6 }]}>
                      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d={owned ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 5v14M5 12h14'} /></Svg>
                      <Text style={[pd.btnText, { color: '#fff' }]}>{owned ? 'Está na sua coleção' : 'Adicionar à coleção'}</Text>
                    </TouchableOpacity>
                  )}
                  {!!detail.step && (
                    <TouchableOpacity activeOpacity={0.85} disabled={inRot} onPress={handleSaveToRoutine} style={[pd.btn, pd.btnRot]}>
                      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={inRot ? INK : '#E8468F'} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <Path d={inRot ? 'M5 12.5l4.5 4.5L19 7.5' : 'M8 2v4M16 2v4M4.5 5h15A1.5 1.5 0 0 1 21 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5zM3 10h18'} />
                      </Svg>
                      <Text style={[pd.btnText, { color: inRot ? INK : '#E8468F' }]}>{inRot ? 'Está na sua rotina' : 'Salvar na minha rotina'}</Text>
                    </TouchableOpacity>
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
  bubble: {
    position: 'absolute', width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
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
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190 },
  actions: { position: 'absolute', left: 18, right: 18, gap: 10 },
  btn: { height: 50, borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOwn: {
    backgroundColor: '#FF5EA8',
    shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  btnRot: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
  btnText: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
});
