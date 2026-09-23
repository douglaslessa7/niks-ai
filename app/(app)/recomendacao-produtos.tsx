import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, Modal, Pressable, TouchableOpacity,
  useWindowDimensions, ActivityIndicator, Alert,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
  Nunito_500Medium, Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { concernLabel } from '../../lib/concernLabels';
import { normStepKey } from '../../lib/savedProducts';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { haptics } from '../../lib/haptics';
import { getScoreTheme } from '../../lib/scoreTheme';
import {
  listarColecao, removerItens, entraNaRotina, motivoIncompativel, type ColecaoItem,
} from '../../lib/colecao';
import { fixarProdutoNoPasso } from '../../lib/rotinaFixados';
import { getUserId } from '../../lib/currentUser';
import { recomendarProdutos } from '../../lib/recomendarProdutos';
import { invalidateCache } from '../../lib/cache';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

// ── "Produtos para você" — identidade do app (novo design) ────────────────────
// Reformada para a linguagem visual do app (home / protocolo / niks-chat): fundo
// branco, cards brancos com a borda-assinatura #E3E3E6 + sombra suave, Nunito,
// header com logo + título centralizado. Escala proporcional S = width/393.
//
// DADOS REAIS: as seções AM/PM vêm da recomendação salva da usuária logada
// (tabela `recomendacoes_produtos`, gerada 1x pela Edge Function `recomendar-produtos`).
// Os campos de exibição (marca/nome/imagem/concerns) são resolvidos por produto_id
// contra a tabela `produtos`. A tela só EXIBE — ordem e conteúdo vêm do JSON.

const WHITE = '#ffffff';
const INK = '#121212';
const INK_BODY = '#3d3d3d';
const INK_MUTE = '#818181';
const INK_FAINT = '#b5b5b5';
const CORAL = '#f86b79';
const ROTINA_PINK = '#ff9d9d';                 // rosa da tela de Rotina (protocolo BRAND)
const ROTINA_WASH = 'rgba(255,157,157,0.16)';  // wash do rosa da Rotina — fundo das tags
const CARD_BORDER = '#e3e3e6';   // hairline-assinatura do app
const PHOTO_BG = '#f4f4f4';      // fundo neutro claro da foto (sunken)

const LOGO = require('../../assets/home/niks-logo.png');

type Alt = {
  brand: string; name: string; sub: string; img: any; praLong?: string; targets?: string[];
  // id do produto no catálogo — o detalhe da alternativa também tem o botão
  // "Adicionar à minha rotina", e sem o id não haveria o que fixar.
  productId?: string;
  compatibilidade?: number | null;
};
type Item = {
  id: string; num: string; step: string; brand?: string; name?: string; img?: any;
  pra?: string; praLong?: string; targets?: string[]; alts?: Alt[];
  empty?: boolean; note?: string; emptyTitulo?: string; productId?: string; // id do produto principal (deep-link da home)
  // Passo preenchido por um produto da MINHA COLEÇÃO (o que ela já tem em casa).
  // Quando existe, o catálogo não entra nesse passo — nem como alternativa.
  emCasa?: { colecaoId: string; compatibilidade: number | null };
  /** Nota 0–100 do produto principal deste card. `null` = ainda não pontuado. */
  compatibilidade?: number | null;
  /** Este passo está com um produto FIXADO pela usuária (escolha dela, não da IA). */
  fixado?: boolean;
  /** Este card É o produto fixado do passo → o botão nasce em "Na sua rotina". */
  jaNaRotina?: boolean;
};

// ── Formato do JSON salvo em recomendacoes_produtos.recomendacao ──────────────
type RecProduto = {
  produto_id: string; principal?: boolean; copy?: string;
  // Nota clínica 0–100, gravada pela `recomendar-produtos` (mesma régua da Coleção).
  // Chega DEPOIS da recomendação (pontuação assíncrona) → pode não existir ainda.
  compatibilidade?: number; veredito?: string;
};
type RecEmCasa = {
  colecao_id: string; nome?: string | null; marca?: string | null;
  image_path?: string | null; produto_id?: string | null;
  compatibilidade?: number | null; veredito?: string | null; copy?: string | null;
};
type RecPasso = {
  categoria?: string; passo?: string; periodo?: string;
  ingrediente_alvo?: string; produtos?: RecProduto[];
  sem_produto?: boolean; motivo?: string;
  // Estado vazio CLÍNICO (nenhum produto da categoria é seguro pra ela agora), com
  // título próprio. Diferente da lacuna de catálogo — ver `titulo`/`motivo_clinico`.
  motivo_clinico?: boolean; titulo?: string;
  em_casa?: RecEmCasa | null;
  // Passo com produto FIXADO pela usuária ("Adicionar à minha rotina"). O principal
  // da lista é a escolha dela — a IA não reescolhe esse passo.
  fixado?: boolean;
};
// Linha resolvida da tabela `produtos` (só os campos de exibição).
type Prod = { id: string; marca: string; nome: string; imagem_url: string; concerns: string[] };

// 'generating' = usuária legada (tem scan + protocolo, mas nunca teve recomendação
// gerada, porque se cadastrou antes da feature existir). Ver `generateOnDemand`.
type LoadState = 'loading' | 'generating' | 'empty' | 'error' | 'ready';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI';

// ── Aba "Escaneados": produtos que a usuária escaneou (tabela product_scans) ──
// A foto fica no bucket PRIVADO `product-scans` → precisa de URL assinada p/ exibir.
type ScanItem = {
  id: string;
  photoUrl: string | null;
  brand: string | null;
  name: string | null;
  createdAt: string;
  result: any;            // objeto `resultado` (resposta da analisar-produto)
};

// Veredito → rótulo + cores (mesma família do app / product-result).
const VEREDITO: Record<string, { label: string; fg: string; bg: string }> = {
  pode_usar:    { label: 'Pode usar',        fg: '#1E9E63', bg: 'rgba(30,158,99,0.12)' },
  com_ressalva: { label: 'Use com ressalva', fg: '#C67C1E', bg: 'rgba(232,161,60,0.15)' },
  evitaria:     { label: 'Eu evitaria',      fg: '#D8483F', bg: 'rgba(216,72,63,0.12)' },
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtScanDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]}`;
};

// Rótulos PT dos concerns reais de um produto (omite códigos desconhecidos).
const targetsOf = (p: Prod): string[] =>
  (p.concerns ?? []).map(concernLabel).filter((l): l is string => !!l);

// Constrói um Item (card) a partir de um passo do JSON + mapa de produtos.
// `prefix`/`index` definem o id (Manhã/Noite) e a numeração por seção.
// Retorna null quando o passo tem produto mas NENHUM id resolveu (produto removido).
function buildItem(
  passo: RecPasso,
  prodMap: Map<string, Prod>,
  prefix: string,
  index: number,
  fotosEmCasa: Map<string, string>,
): Item | null {
  const num = String(index + 1).padStart(2, '0');
  const step = (passo.passo || passo.categoria || '').trim();

  // Passo que ELA já resolve com o que tem em casa — vem antes de tudo.
  if (passo.em_casa?.colecao_id) {
    const ec = passo.em_casa;
    const uri = fotosEmCasa.get(ec.colecao_id) ?? null;
    return {
      id: `${prefix}${index}`, num, step,
      brand: ec.marca ?? 'Você já tem',
      name: ec.nome ?? 'Produto seu',
      img: uri ? { uri } : undefined,
      pra: (ec.copy || '').trim(),
      praLong: (ec.copy || '').trim(),
      // Mesmo campo do produto de catálogo: é a comparação lado a lado que a
      // feature existe para permitir — mesma régua, mesma barra, mesmas cores.
      compatibilidade: typeof ec.compatibilidade === 'number' ? ec.compatibilidade : null,
      targets: [],
      alts: [],
      emCasa: {
        colecaoId: ec.colecao_id,
        compatibilidade: typeof ec.compatibilidade === 'number' ? ec.compatibilidade : null,
      },
    };
  }

  if (passo.sem_produto) {
    return {
      id: `${prefix}${index}`, num, step, empty: true,
      // Título vem do backend só no caso CLÍNICO; a lacuna de catálogo mantém o
      // título de sempre. Copy num lugar só (a Edge Function), não dividida.
      emptyTitulo: passo.motivo_clinico ? passo.titulo : undefined,
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
    brand: main.marca, name: main.nome, img: { uri: main.imagem_url },
    pra: (principal.x.copy || '').trim(),
    praLong: (principal.x.copy || '').trim(),
    compatibilidade: typeof principal.x.compatibilidade === 'number' ? principal.x.compatibilidade : null,
    targets: targetsOf(main),
    fixado: passo.fixado === true,
    // O principal de um passo fixado É a escolha dela → botão já em "Na sua rotina".
    jaNaRotina: passo.fixado === true,
    alts: others.map((r) => ({
      brand: r.p.marca, name: r.p.nome, sub: (r.x.copy || '').trim(),
      img: { uri: r.p.imagem_url }, productId: r.p.id,
      compatibilidade: typeof r.x.compatibilidade === 'number' ? r.x.compatibilidade : null,
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
  const [savedNow, setSavedNow] = useState(false);   // feedback do "Adicionar à minha rotina"
  // Espera entre o toque e a navegação para a Rotina (a recomendação está sendo
  // reescrita). Sem isto o botão ficaria 1–3 s parado, sem dizer nada.
  const [indoParaRotina, setIndoParaRotina] = useState(false);
  const [state, setState] = useState<LoadState>('loading');
  // Trava de uma tentativa de geração por montagem da tela (ver `load`).
  const triedGenerate = useRef(false);
  const [am, setAm] = useState<Item[]>([]);
  const [pm, setPm] = useState<Item[]>([]);
  const [count, setCount] = useState(0);

  // Deep-link da home ("Para você"): produto_id cujo detalhe deve abrir ao entrar aqui.
  const productDetailTarget = useAppStore((s) => s.productDetailTarget);
  const setProductDetailTarget = useAppStore((s) => s.setProductDetailTarget);
  // Deep-link da Rotina ("Ver produto recomendado"): passo + período, porque a tela de
  // Rotina conhece o NOME do passo, não o produto_id.
  const productDetailStep = useAppStore((s) => s.productDetailStep);
  const setProductDetailStep = useAppStore((s) => s.setProductDetailStep);
  // Item da Coleção que está sendo refotografado (ver `refazerFoto`).
  const setColecaoRetakeId = useAppStore((s) => s.setColecaoRetakeId);

  // Abas: "Recomendados" (recomendação salva) | "Minha Coleção" (o que ela tem em
  // casa) | "Escaneados" (histórico de scans).
  const [tab, setTab] = useState<'recomendados' | 'colecao' | 'escaneados'>('recomendados');
  const [scanState, setScanState] = useState<LoadState>('loading');
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [scanDetail, setScanDetail] = useState<ScanItem | null>(null);

  // ── Aba "Minha Coleção" ────────────────────────────────────────────────────
  const [colecaoState, setColecaoState] = useState<LoadState>('loading');
  const [colecao, setColecao] = useState<ColecaoItem[]>([]);
  const [colecaoDetail, setColecaoDetail] = useState<ColecaoItem | null>(null);
  // Modo de edição: ela seleciona um ou mais itens e toca em "Remover". Não há
  // "marcar como acabou" nem edição de dados — só remover (decisão de produto).
  const [editando, setEditando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [emCasaCount, setEmCasaCount] = useState(0);
  // Há produto recomendado ainda SEM nota de compatibilidade? A pontuação roda em
  // background na Edge Function (a recomendação é salva e respondida antes), então
  // a tela aparece na hora e as notas entram depois — ver o refetch mais abaixo.
  const [notasPendentes, setNotasPendentes] = useState(false);
  const { track } = useMixpanel();

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
    Nunito_500Medium, Nunito_400Regular,
  });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const f6 = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const f5 = fontsLoaded ? 'Nunito_500Medium' : undefined;
  const f4 = fontsLoaded ? 'Nunito_400Regular' : undefined;

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
          .select('id, marca, nome, imagem_url, concerns')
          .in('id', ids);
        (prods ?? []).forEach((p: any) => prodMap.set(p.id, p));
      }

      // Fotos dos passos preenchidos pela Coleção. Duas origens: a foto que ELA
      // tirou (bucket privado → URL assinada, nunca cacheada) e, no caminho do
      // catálogo, a imagem pública do produto.
      const fotosEmCasa = new Map<string, string>();
      const emCasaPaths = new Map<string, string>();   // image_path → colecao_id
      const emCasaProdutos = new Map<string, string>(); // produto_id  → colecao_id
      for (const p of passos) {
        const ec = p.em_casa;
        if (!ec?.colecao_id) continue;
        if (ec.image_path) emCasaPaths.set(ec.image_path, ec.colecao_id);
        else if (ec.produto_id) emCasaProdutos.set(ec.produto_id, ec.colecao_id);
      }
      if (emCasaPaths.size) {
        const { data: signed } = await supabase.storage
          .from('product-scans')
          .createSignedUrls([...emCasaPaths.keys()], 3600);
        (signed ?? []).forEach((s: any) => {
          const cid = s?.path ? emCasaPaths.get(s.path) : null;
          if (cid && s?.signedUrl && !s.error) fotosEmCasa.set(cid, s.signedUrl);
        });
      }
      if (emCasaProdutos.size) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('id, imagem_url')
          .in('id', [...emCasaProdutos.keys()]);
        (prods ?? []).forEach((p: any) => {
          const cid = emCasaProdutos.get(p.id);
          if (cid && p?.imagem_url) fotosEmCasa.set(cid, p.imagem_url);
        });
      }

      const amItems: Item[] = [];
      const pmItems: Item[] = [];
      for (const passo of passos) {
        const periodo = passo.periodo ?? '';
        if (periodo.includes('am')) {
          const it = buildItem(passo, prodMap, 'am', amItems.length, fotosEmCasa);
          if (it) amItems.push(it);
        }
        if (periodo.includes('pm')) {
          const it = buildItem(passo, prodMap, 'pm', pmItems.length, fotosEmCasa);
          if (it) pmItems.push(it);
        }
      }

      if (amItems.length === 0 && pmItems.length === 0) { setState('empty'); return; }

      // Nº de passos (únicos) resolvidos — do catálogo OU com o que ela já tem.
      const withProduct = passos.filter(
        (p) => !p.sem_produto && (
          !!p.em_casa?.colecao_id || (p.produtos ?? []).some((x) => prodMap.has(x.produto_id))
        ),
      ).length;
      // Só conta como pendente o que a pontuação AINDA pode preencher: produto de
      // catálogo sem nota. `em_casa` e `sem_produto` nunca entram nessa conta,
      // senão a tela ficaria repescando para sempre.
      setNotasPendentes(passos.some((p) => !p.em_casa && !p.sem_produto
        && (p.produtos ?? []).some((x) => prodMap.has(x.produto_id) && typeof x.compatibilidade !== 'number')));

      const comProdutoDela = passos.filter((p) => !!p.em_casa?.colecao_id).length;
      setEmCasaCount(comProdutoDela);
      // Métrica central da feature: quantos passos da rotina acabaram preenchidos
      // com produto que ela já tinha em casa, em vez de indicação de compra.
      track('colecao_rotina_carregada', {
        passos_total: passos.length,
        passos_com_produto_dela: comProdutoDela,
      });

      setAm(amItems);
      setPm(pmItems);
      setCount(withProduct);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [fetchPassos, generateOnDemand, track]);

  useEffect(() => {
    let active = true;
    // Só aplica o resultado se a tela ainda estiver montada.
    (async () => { if (active) await load(); })();
    return () => { active = false; };
  }, [load]);

  // Enquanto faltarem notas, refaz a busca a cada 5 s (no máximo ~30 s). É leitura
  // de banco, não chamada de IA — a pontuação já está rodando do lado do servidor;
  // aqui só se espera ela pousar. Para sozinho quando as notas chegam (o `load`
  // zera `notasPendentes` → o efeito limpa) ou quando ela sai da aba.
  // ⚠️ Teto de tentativas: se a pontuação falhar no servidor, a tela não pode ficar
  // repescando para sempre — ela simplesmente segue sem barra, que é um estado válido.
  useEffect(() => {
    if (!notasPendentes || tab !== 'recomendados') return;
    let tentativas = 0;
    const id = setInterval(() => {
      tentativas += 1;
      if (tentativas > 6) { clearInterval(id); return; }
      void load();
    }, 5000);
    return () => clearInterval(id);
  }, [notasPendentes, tab, load]);

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
        .select('id, image_path, produto_nome, produto_marca, resultado, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) { setScanState('error'); return; }
      if (!rows || rows.length === 0) { setScanState('empty'); return; }

      const paths = rows.map((r: any) => r.image_path).filter(Boolean) as string[];
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
      }));
      setScans(items);
      setScanState('ready');
    } catch {
      setScanState('error');
    }
  }, []);

  // Recarrega o histórico toda vez que a aba "Escaneados" é aberta (sempre fresco,
  // inclui scans feitos desde a última visita).
  useEffect(() => {
    if (tab === 'escaneados') loadScans();
  }, [tab, loadScans]);

  // ── Minha Coleção ─────────────────────────────────────────────────────────
  // Sem cache, pelo mesmo motivo da aba "Escaneados": as fotos são URLs assinadas
  // que expiram em 1h. Recarrega a cada abertura da aba.
  const loadColecao = useCallback(async () => {
    setColecaoState('loading');
    try {
      const userId = await getUserId();
      if (!userId) { setColecaoState('empty'); return; }
      const itens = await listarColecao(userId);
      setColecao(itens);
      setColecaoState(itens.length === 0 ? 'empty' : 'ready');
    } catch (e) {
      console.warn('[produtos] Coleção falhou:', e);
      setColecaoState('error');
    }
  }, []);

  useEffect(() => {
    if (tab === 'colecao') loadColecao();
  }, [tab, loadColecao]);

  // Sair do modo de edição sempre que a aba muda ou a lista recarrega — seleção
  // pendurada em cima de uma lista nova removeria o item errado.
  useEffect(() => { setEditando(false); setSelecionados(new Set()); }, [tab, colecaoState]);

  const alternarSelecao = (id: string) => {
    haptics.select();
    setSelecionados((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Remover: confirma antes (é destrutivo e não tem desfazer) e só apaga os ids
  // explicitamente selecionados. Depois recarrega a Coleção E a recomendação —
  // um produto removido que ocupava um passo faz o passo voltar ao catálogo.
  const removerSelecionados = () => {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    haptics.warning();
    Alert.alert(
      ids.length === 1 ? 'Remover produto?' : `Remover ${ids.length} produtos?`,
      'Eles saem da sua coleção e dos passos da sua rotina que estavam usando eles. O histórico de scans continua em "Escaneados".',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = await getUserId();
              if (!userId) return;
              await removerItens(userId, ids);
              track('colecao_itens_removidos', { total: ids.length });
              setEditando(false);
              setSelecionados(new Set());
              await loadColecao();
              // O passo que usava o produto removido precisa voltar ao catálogo.
              await recomendarProdutos({ userId, regenerate: true, preservarCatalogo: true });
              triedGenerate.current = true; // a recomendação existe; não gerar de novo
              await load();
            } catch (e) {
              console.warn('[produtos] remoção falhou:', e);
              haptics.error();
              Alert.alert('Não deu pra remover', 'Tente de novo em instantes.');
            }
          },
        },
      ],
    );
  };

  // "Tirar nova foto" de um item não identificado: manda para a câmera de produto
  // marcando QUAL item deve ser atualizado quando a análise voltar (o
  // `product-result` fecha o ciclo chamando `identificarItem`). Sem isso, refazer
  // a foto criaria um item novo e deixaria o antigo como lixo na Coleção.
  const refazerFoto = (item: ColecaoItem) => {
    haptics.action();
    setColecaoDetail(null);
    setColecaoRetakeId(item.id);
    router.push('/(scan)/product-camera' as any);
  };

  // Abre a página de detalhe de um produto ALTERNATIVO (mesmo layout, dados da alt).
  // Herda o período do passo pai (id am*/pm*) p/ o rótulo "Manhã/Noite · passo".
  const openAlt = (alt: Alt, parent: Item) => setDetail({
    id: parent.id + '-alt', num: parent.num, step: parent.step,
    brand: alt.brand, name: alt.name, img: alt.img,
    // O id do produto é o que permite FIXAR a alternativa no passo — antes o
    // detalhe da alternativa não tinha botão nenhum.
    productId: alt.productId,
    compatibilidade: alt.compatibilidade ?? null,
    pra: alt.sub, praLong: alt.praLong ?? alt.sub,
    targets: alt.targets ?? [], alts: [],
    // Uma alternativa nunca é a escolha atual do passo (se fosse, seria o principal).
    fixado: parent.fixado, jaNaRotina: false,
  });

  // Reseta o feedback do botão sempre que abre/troca o detalhe. O estado inicial
  // vem do próprio JSON da recomendação (`jaNaRotina`), sem ida extra à rede: um
  // passo `fixado` já diz que o principal dele é a escolha dela.
  useEffect(() => { setSavedNow(detail?.jaNaRotina === true); }, [detail]);

  // "Adicionar à minha rotina" — FIXA este produto do catálogo neste passo.
  //
  // ⚠️ NÃO é a Minha Coleção, e os dois botões não se misturam de propósito:
  //   • aqui (produto RECOMENDADO, do catálogo)      → "Adicionar à minha rotina"
  //     = "quero ESTE produto neste passo". Ela não necessariamente tem em casa.
  //   • no resultado de um SCAN (câmera ou share)    → "Tenho esse produto em casa"
  //     = entra na Coleção, com a foto dela e a compatibilidade medida.
  // Afirmar que ela TEM um produto que ela só escolheu seria mentira — e a Coleção
  // alimenta o chat ("o que eu faço agora?" responde com o que ela tem em mãos).
  //
  // ⚠️ A escolha dela GANHA da IA: `recomendar-produtos` resolve o passo na ordem
  // fixado → Coleção → catálogo. Se depois aparecer um produto de casa compatível
  // para o mesmo passo, este aqui PERMANECE.
  const handleAdicionarNaRotina = async () => {
    if (!detail?.productId || !detail.step) return;
    try {
      const userId = await getUserId();
      if (!userId) return;
      await fixarProdutoNoPasso(userId, detail.step, detail.productId);
      // O pulso de sucesso só vale se a escrita REALMENTE aconteceu — confirmar no
      // tato antes do await faria o app dizer "salvo" para um salvamento que falhou.
      haptics.success();
      setSavedNow(true);
      setIndoParaRotina(true);
      track('rotina_produto_fixado', { origem: detail.id.endsWith('-alt') ? 'alternativa' : 'principal' });

      // ⚠️ ESPERAR a recomendação ser reescrita ANTES de navegar. É ela que diz à
      // Rotina qual produto ocupa o passo (`lib/rotinaProdutos`); navegar antes
      // abriria a Rotina com o produto ANTIGO — e o `useFocusEffect` de lá já teria
      // rodado, então nada corrigiria a tela. O botão fica em "Na sua rotina" com
      // spinner durante a espera (e `disabled`, o que já barra o toque duplo).
      // Só o produto DESTE passo muda: `preservarCatalogo` impede que a IA
      // re-sorteie os recomendados dos outros passos por tabela.
      await recomendarProdutos({ userId, regenerate: true, preservarCatalogo: true });

      // Regra do projeto: escreveu no banco, invalide o cache. A Rotina lê
      // `protocolo:${uid}` (stale-while-revalidate) — invalidar garante que ela
      // não pinte a partir de uma cópia velha ao ganhar foco.
      invalidateCache(`protocolo:${userId}`);

      // A aba de Produtos continua montada atrás (é um `Tabs`) e o `load` dela só
      // roda na montagem — sem isto, voltar para cá mostraria o passo sem o produto
      // que ela acabou de escolher. Não bloqueia a navegação.
      void load();

      // Fecha o detalhe e leva para a Rotina, onde o passo já aparece com o produto.
      // ⚠️ O push espera o modal terminar de fechar (~250 ms, o mesmo respiro
      // documentado no ScanModal): empilhar navegação sobre um `<Modal>` nativo em
      // dismiss é a receita de tela presa no iOS.
      setDetail(null);
      setTimeout(() => {
        setIndoParaRotina(false);
        router.push('/protocolo' as any);
      }, 250);
    } catch (e) {
      console.warn('[produtos] falha ao fixar o produto no passo:', e);
      setIndoParaRotina(false);
      haptics.error();
      Alert.alert('Não deu pra salvar', 'Tente de novo em instantes.');
    }
  };

  // Escanear produto — abre a réplica da tela de câmera (product-camera), o
  // equivalente à câmera do scan de comida, dedicada ao scan de produto.
  const handleEscanearProduto = () => {
    haptics.action();
    router.push('/(scan)/product-camera' as any);
  };

  // Botão "Escanear produto" — MESMO tamanho e cor do botão "Escanear" da home:
  // pill sólida #FF9D9D (ROTINA_PINK) com sombra rosa, altura 48, raio 42, texto
  // 16px branco (home.tsx: scanBtn/scanText). Ícone de scan do Figma (node
  // 128:106: moldura tracejada + frasco). FIXO acima da tab bar (absolute,
  // bottom 108 = navbar 80px + respiro, mesma posição da home), fora do ScrollView.
  const ScanProdutoButton = () => (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 108, alignItems: 'center' }}>
      <TouchableOpacity activeOpacity={0.9} onPress={handleEscanearProduto}>
        <LinearGradient
          colors={[ROTINA_PINK, ROTINA_PINK]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, paddingHorizontal: 22, borderRadius: 42, shadowColor: ROTINA_PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 6 }}
        >
          <Svg width={20} height={20} viewBox="-1 -1 18 18" fill="none">
            <Rect x={0} y={0} width={16} height={16} rx={3} stroke="#fff" strokeWidth={1.5} strokeDasharray="2.6 2.2" />
            <Rect x={5} y={4} width={6} height={8} rx={3} stroke="#fff" strokeWidth={1.5} />
            <Line x1={3} y1={8} x2={13} y2={8} stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
          </Svg>
          <Text style={{ fontFamily: f7, fontSize: 16, color: '#fff' }}>Escanear produto</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // Card branco padrão do app (borda-assinatura + sombra suave) — home/niks-chat.
  const appCard = {
    backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: s(20),
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  } as const;

  // ── Ícones ──────────────────────────────────────────────────────────────
  const IconClose = ({ size = 16 }: { size?: number }) => (
    <Svg width={s(size)} height={s(size)} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M18 6L6 18M6 6l12 12" /></Svg>
  );
  const IconChevronRight = () => (
    <Svg width={s(14)} height={s(14)} viewBox="0 0 24 24" fill="none" stroke={INK_MUTE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 18l6-6-6-6" /></Svg>
  );
  const IconSun = () => (
    <Svg width={s(17)} height={s(17)} viewBox="0 0 24 24" fill="none" stroke={ROTINA_PINK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
  const IconMoon = () => (
    <Svg width={s(16)} height={s(16)} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>
  );
  const IconHerb = () => (
    <Svg width={s(22)} height={s(22)} viewBox="0 0 24 24" fill="none" stroke={INK_FAINT} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 20h10" />
      <Path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <Path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
      <Path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    </Svg>
  );

  // ── Linha de alternativa (sunken dentro do card) — toca p/ abrir o detalhe da alt ──
  const renderAlt = (alt: Alt, i: number, parent: Item, big = false) => (
    <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => { haptics.tap(); openAlt(alt, parent); }} style={{
      flexDirection: 'row', alignItems: 'center', gap: s(10),
      padding: s(big ? 11 : 10), borderRadius: s(12), backgroundColor: PHOTO_BG, marginBottom: s(8),
    }}>
      <View style={{ width: s(big ? 46 : 42), height: s(big ? 46 : 42), borderRadius: s(10), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE }}>
        <ExpoImage source={alt.img} style={{ height: s(big ? 38 : 34), width: '78%' }} contentFit="contain" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f7, fontSize: s(9.5), letterSpacing: s(9.5) * 0.1, textTransform: 'uppercase', color: INK_MUTE }}>{alt.brand}</Text>
        <Text style={{ fontFamily: f7, fontSize: s(big ? 13.5 : 13), color: INK, lineHeight: s(big ? 13.5 : 13) * 1.2 }}>{alt.name}</Text>
        <Text style={{ fontFamily: f4, fontSize: s(11.5), color: INK_MUTE, lineHeight: s(11.5) * 1.3, marginTop: s(1) }}>{alt.sub}</Text>
      </View>
      {!big && <IconChevronRight />}
    </TouchableOpacity>
  );

  // Chips de concern (rótulos reais do produto). `max` limita no card; detalhe usa todos.
  const renderChips = (targets: string[] | undefined, max?: number) => {
    if (!targets || targets.length === 0) return null;
    const list = typeof max === 'number' ? targets.slice(0, max) : targets;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6), marginTop: s(10) }}>
        {list.map((t) => (
          <Text key={t} style={{ fontFamily: f6, fontSize: s(10.5), paddingVertical: s(4), paddingHorizontal: s(10), borderRadius: s(100), backgroundColor: ROTINA_WASH, color: ROTINA_PINK, overflow: 'hidden' }}>{t}</Text>
        ))}
      </View>
    );
  };

  // ── Card de produto (card branco do app) — Manhã e Noite ──────────────────
  const renderProduct = (item: Item) => (
    <View key={item.id} style={{ ...appCard, marginHorizontal: s(16), marginBottom: s(14), padding: s(14) }}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => { haptics.tap(); setDetail(item); }}>
        {/* rótulo do passo */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(12) }}>
          <Text style={{ fontFamily: f8, fontSize: s(14), color: INK }}>{item.num}</Text>
          <Text style={{ fontFamily: f7, fontSize: s(11), letterSpacing: s(11) * 0.1, textTransform: 'uppercase', color: INK_MUTE }}>{item.step}</Text>
        </View>
        {/* foto do produto — fundo branco (o catálogo usa fotos com fundo branco) */}
        <View style={{ height: s(172), borderRadius: s(16), backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ExpoImage source={item.img} style={{ height: s(138), width: '66%' }} contentFit="contain" />
          <View style={{ position: 'absolute', bottom: s(10), right: s(10), width: s(30), height: s(30), borderRadius: s(15), backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BORDER, alignItems: 'center', justifyContent: 'center' }}>
            <IconChevronRight />
          </View>
        </View>
        {/* textos */}
        <Text style={{ fontFamily: f7, fontSize: s(10.5), letterSpacing: s(10.5) * 0.12, textTransform: 'uppercase', color: INK_MUTE, marginTop: s(14), marginBottom: s(3) }}>{item.brand}</Text>
        <Text style={{ fontFamily: f8, fontSize: s(18), lineHeight: s(18) * 1.18, letterSpacing: s(18) * -0.02, color: INK }}>{item.name}</Text>
        <Text style={{ fontFamily: f4, fontSize: s(13.5), lineHeight: s(13.5) * 1.5, color: INK_BODY, marginTop: s(8) }}>{item.pra}</Text>
        {renderChips(item.targets, 3)}
      </TouchableOpacity>
      {!!(item.alts && item.alts.length) && (
        <View style={{ marginTop: s(14) }}>
          <View style={{ height: 1, backgroundColor: CARD_BORDER, marginBottom: s(12) }} />
          <Text style={{ fontFamily: f7, fontSize: s(10), letterSpacing: s(10) * 0.14, textTransform: 'uppercase', color: INK_FAINT, marginBottom: s(9) }}>Alternativas</Text>
          {item.alts!.map((alt, i) => renderAlt(alt, i, item, false))}
        </View>
      )}
    </View>
  );

  // ── Card de estado vazio (sem_produto) ────────────────────────────────────
  const renderEmpty = (item: Item) => (
    <View key={item.id} style={{ ...appCard, marginHorizontal: s(16), marginBottom: s(14), padding: s(14) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(12) }}>
        <Text style={{ fontFamily: f8, fontSize: s(14), color: INK_FAINT }}>{item.num}</Text>
        <Text style={{ fontFamily: f7, fontSize: s(11), letterSpacing: s(11) * 0.1, textTransform: 'uppercase', color: INK_MUTE }}>{item.step}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: s(12), alignItems: 'flex-start', padding: s(16), borderRadius: s(14), backgroundColor: PHOTO_BG }}>
        <View style={{ marginTop: s(1) }}><IconHerb /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: f8, fontSize: s(15), color: INK, lineHeight: s(15) * 1.25 }}>{item.emptyTitulo || 'Ainda sem um produto ideal'}</Text>
          <Text style={{ fontFamily: f4, fontSize: s(12.5), lineHeight: s(12.5) * 1.5, color: INK_MUTE, marginTop: s(5) }}>{item.note}</Text>
        </View>
      </View>
    </View>
  );

  // ── Card de produto ESCANEADO (mesmo visual do card de recomendação) ──────
  // Foto real que a usuária tirou (cover) + marca/nome + veredito + resumo.
  const renderScanCard = (item: ScanItem) => {
    const r = item.result ?? {};
    const ver = VEREDITO[r.veredito] ?? null;
    const summary = r.resumo || r.o_que_faz || r.mensagem || '';
    return (
      <View key={item.id} style={{ ...appCard, marginHorizontal: s(16), marginBottom: s(14), padding: s(14) }}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => { haptics.tap(); setScanDetail(item); }}>
          {/* data do scan */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(12) }}>
            <Text style={{ fontFamily: f7, fontSize: s(11), letterSpacing: s(11) * 0.1, textTransform: 'uppercase', color: INK_MUTE }}>{fmtScanDate(item.createdAt)}</Text>
          </View>
          {/* foto real da usuária (cover) */}
          <View style={{ height: s(172), borderRadius: s(16), backgroundColor: PHOTO_BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {item.photoUrl
              ? <ExpoImage source={{ uri: item.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              : <IconHerb />}
            <View style={{ position: 'absolute', bottom: s(10), right: s(10), width: s(30), height: s(30), borderRadius: s(15), backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BORDER, alignItems: 'center', justifyContent: 'center' }}>
              <IconChevronRight />
            </View>
          </View>
          {/* marca + nome */}
          {!!item.brand && (
            <Text style={{ fontFamily: f7, fontSize: s(10.5), letterSpacing: s(10.5) * 0.12, textTransform: 'uppercase', color: INK_MUTE, marginTop: s(14), marginBottom: s(3) }}>{item.brand}</Text>
          )}
          <Text style={{ fontFamily: f8, fontSize: s(18), lineHeight: s(18) * 1.18, letterSpacing: s(18) * -0.02, color: INK, marginTop: item.brand ? 0 : s(14) }}>{item.name || 'Produto escaneado'}</Text>
          {/* veredito */}
          {!!ver && (
            <View style={{ flexDirection: 'row', marginTop: s(10) }}>
              <Text style={{ fontFamily: f6, fontSize: s(11), paddingVertical: s(4), paddingHorizontal: s(11), borderRadius: s(100), backgroundColor: ver.bg, color: ver.fg, overflow: 'hidden' }}>{ver.label}</Text>
            </View>
          )}
          {!!summary && (
            <Text style={{ fontFamily: f4, fontSize: s(13.5), lineHeight: s(13.5) * 1.5, color: INK_BODY, marginTop: s(8) }}>{summary}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ── Card da grade "Minha Coleção" ─────────────────────────────────────────
  // Quadrado: foto + nome + BARRA HORIZONTAL de compatibilidade (0–100%), colorida
  // pela FAIXA do score — `getScoreTheme`, a mesma régua do Niks score e da tela de
  // resultado de produto (0–25 vermelho · 26–50 laranja · 51–75 amarelo · 76–100
  // rosa). ⚠️ Não criar régua nova aqui.
  //
  // Três estados de card:
  //  • normal          → barra com a %;
  //  • incompatível    → faixa "Não recomendado pra sua pele" + motivo (continua
  //                      visível na Coleção, mas fica fora da rotina);
  //  • não identificado→ "Não identificado" + atalho para tirar nova foto.
  const COL_GAP = s(12);
  const COL_W = (width - s(32) - COL_GAP) / 2;

  const renderColecaoCard = (item: ColecaoItem) => {
    const naoIdentificado = item.status === 'nao_identificado';
    const incompativel = !naoIdentificado && !entraNaRotina(item);
    const compat = item.compatibilidade;
    const theme = getScoreTheme(compat);
    const selecionado = selecionados.has(item.id);

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.9}
        onPress={() => {
          if (editando) { alternarSelecao(item.id); return; }
          haptics.tap();
          if (naoIdentificado) { setColecaoDetail(item); return; }
          setColecaoDetail(item);
        }}
        style={{
          ...appCard, width: COL_W, marginBottom: COL_GAP, padding: s(10),
          borderColor: selecionado ? ROTINA_PINK : CARD_BORDER,
          borderWidth: selecionado ? 2 : 1,
        }}
      >
        {/* foto */}
        <View style={{ height: COL_W * 0.78, borderRadius: s(12), backgroundColor: PHOTO_BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {item.photoUrl
            ? <ExpoImage source={{ uri: item.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            : <IconHerb />}
          {editando && (
            <View style={{
              position: 'absolute', top: s(6), left: s(6), width: s(22), height: s(22), borderRadius: s(11),
              backgroundColor: selecionado ? ROTINA_PINK : 'rgba(255,255,255,0.92)',
              borderWidth: 1.5, borderColor: selecionado ? ROTINA_PINK : CARD_BORDER,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {selecionado && (
                <Svg width={s(12)} height={s(12)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 6L9 17l-5-5" /></Svg>
              )}
            </View>
          )}
        </View>

        {/* marca + nome */}
        {!!item.marca && (
          <Text numberOfLines={1} style={{ fontFamily: f7, fontSize: s(9.5), letterSpacing: s(9.5) * 0.1, textTransform: 'uppercase', color: INK_MUTE, marginTop: s(9) }}>{item.marca}</Text>
        )}
        <Text numberOfLines={2} style={{ fontFamily: f8, fontSize: s(13), lineHeight: s(13) * 1.2, color: INK, marginTop: item.marca ? s(1) : s(9) }}>
          {naoIdentificado ? 'Produto não identificado' : (item.nome || 'Produto')}
        </Text>

        {/* barra de compatibilidade / estados especiais */}
        <View style={{ marginTop: s(9) }}>
          {naoIdentificado ? (
            <Text style={{ fontFamily: f6, fontSize: s(10.5), color: INK_MUTE, lineHeight: s(10.5) * 1.35 }}>
              Não consegui ler esse. Toque para tirar outra foto.
            </Text>
          ) : incompativel ? (
            <>
              <Text style={{ fontFamily: f7, fontSize: s(10.5), color: VEREDITO.evitaria.fg, lineHeight: s(10.5) * 1.35 }}>
                Não recomendado pra sua pele
              </Text>
              {/* O motivo vem da própria análise — sem ele o card só acusa, e ela
                  não tem como entender por que o produto dela ficou de fora. */}
              <Text numberOfLines={3} style={{ fontFamily: f4, fontSize: s(10), color: INK_MUTE, lineHeight: s(10) * 1.4, marginTop: s(3) }}>
                {motivoIncompativel(item)}
              </Text>
            </>
          ) : compat == null ? (
            // Scan ANTIGO, anterior ao campo `compatibilidade` (ver a Edge Function
            // `analisar-produto`). Sem número, o app não inventa um — diz o que sabe.
            // O produto continua elegível para a rotina: quem decide isso é o veredito.
            <Text style={{ fontFamily: f6, fontSize: s(10.5), color: INK_MUTE }}>Sem nota de compatibilidade</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(5) }}>
                <Text style={{ fontFamily: f6, fontSize: s(9.5), letterSpacing: s(9.5) * 0.08, textTransform: 'uppercase', color: INK_MUTE }}>Compatibilidade</Text>
                <Text style={{ fontFamily: f8, fontSize: s(12), color: theme.score }}>{compat}%</Text>
              </View>
              <View style={{ height: s(5), borderRadius: s(3), backgroundColor: '#F3F3F4', overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(0, Math.min(100, compat))}%`, height: '100%', borderRadius: s(3), backgroundColor: theme.score }} />
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Barra de compatibilidade do DETALHE — mesma régua e mesmas cores da aba Minha
  // Coleção (`getScoreTheme`: 0–25 vermelho · 26–50 laranja · 51–75 amarelo ·
  // 76–100 rosa). ⚠️ Não criar régua nova: os dois números (o do produto que ela
  // tem em casa e o do recomendado) aparecem lado a lado e ela decide comparando.
  // ⚠️ Sem nota → NÃO desenha nada. A pontuação é assíncrona (chega depois da
  // recomendação) e scan antigo pode não ter o campo; um "0%" ou uma barra vazia
  // seriam mentira. A tela refaz a busca sozinha quando as notas chegam.
  const BarraCompatibilidade = ({ valor }: { valor: number }) => {
    const theme = getScoreTheme(valor);
    return (
      <View style={{ marginTop: s(12) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(6) }}>
          <Text style={{ fontFamily: f6, fontSize: s(11), letterSpacing: s(11) * 0.08, textTransform: 'uppercase', color: INK_MUTE }}>
            Compatibilidade com a sua pele
          </Text>
          <Text style={{ fontFamily: f8, fontSize: s(15), color: theme.score }}>{valor}%</Text>
        </View>
        <View style={{ height: s(6), borderRadius: s(3), backgroundColor: '#F3F3F4', overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(0, Math.min(100, valor))}%`, height: '100%', borderRadius: s(3), backgroundColor: theme.score }} />
        </View>
      </View>
    );
  };

  const SectionHeader = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginHorizontal: s(16), marginTop: s(26), marginBottom: s(12) }}>
      {icon}
      <Text style={{ fontFamily: f8, fontSize: s(20), letterSpacing: s(20) * -0.03, color: INK }}>{label}</Text>
    </View>
  );

  // Card de mensagem central (loading / vazio / erro) — visual do appCard + IconHerb.
  const CenterCard = ({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) => (
    <View style={{ ...appCard, marginHorizontal: s(16), marginTop: s(24), padding: s(20) }}>
      <View style={{ flexDirection: 'row', gap: s(12), alignItems: 'flex-start' }}>
        <View style={{ marginTop: s(1) }}><IconHerb /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: f8, fontSize: s(16), color: INK, lineHeight: s(16) * 1.25 }}>{title}</Text>
          <Text style={{ fontFamily: f4, fontSize: s(13), lineHeight: s(13) * 1.5, color: INK_MUTE, marginTop: s(6) }}>{body}</Text>
          {action}
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      {/* Título da tela (réplica do Figma node 92:19): logo + "Produtos" centralizado.
          Texto: Nunito Medium 24px, #121212, letter-spacing -0.24px; logo 24×24. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: WHITE }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(20), paddingTop: s(6), paddingBottom: s(14), borderBottomWidth: 0.5, borderBottomColor: 'rgba(18,18,18,0.06)' }}>
          <Image source={LOGO} style={{ width: s(24), height: s(24), marginRight: s(10), tintColor: ROTINA_PINK }} resizeMode="contain" />
          <Text style={{ fontFamily: f5, fontSize: s(24), color: INK, letterSpacing: s(-0.24) }}>Produtos</Text>
        </View>
      </SafeAreaView>

      {/* Abas: Recomendados | Escaneados (lógica da tela de protocolo manhã/noite) */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: s(20), paddingTop: s(14), paddingBottom: s(8), backgroundColor: WHITE }}>
        {(['recomendados', 'colecao', 'escaneados'] as const).map((id) => {
          const active = tab === id;
          const label = id === 'recomendados' ? 'Recomendados' : id === 'colecao' ? 'Minha Coleção' : 'Escaneados';
          return (
            <TouchableOpacity key={id} onPress={() => { haptics.select(); setTab(id); }} activeOpacity={0.8} style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: active ? f8 : f6, fontSize: s(14), color: active ? INK : INK_FAINT }}>{label}</Text>
              <View style={{ height: s(2.5), width: s(24), borderRadius: s(2), marginTop: s(7), backgroundColor: active ? ROTINA_PINK : 'transparent' }} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ═══ ABA RECOMENDADOS ═══ */}
      {tab === 'recomendados' && (<>
      {state === 'loading' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: s(120) }}>
          <ActivityIndicator size="large" color={ROTINA_PINK} />
        </View>
      )}

      {/* Usuária legada: a recomendação está sendo gerada agora, sob demanda (chamada de
          IA — leva alguns segundos). Só acontece uma vez na vida da conta. */}
      {state === 'generating' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
          <CenterCard
            title="Montando sua recomendação"
            body="Estamos escolhendo os produtos ideais para cada passo da sua rotina. Leva alguns segundos."
            action={
              <View style={{ alignSelf: 'flex-start', marginTop: s(14) }}>
                <ActivityIndicator color={ROTINA_PINK} />
              </View>
            }
          />
        </ScrollView>
      )}

      {state === 'error' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
          <CenterCard
            title="Não deu pra carregar agora"
            body="Tivemos um problema ao buscar sua recomendação. Tente de novo em instantes."
            action={
              <TouchableOpacity activeOpacity={0.9} onPress={() => { haptics.tap(); load(); }} style={{ alignSelf: 'flex-start', marginTop: s(14), height: s(44), paddingHorizontal: s(20), borderRadius: s(100), backgroundColor: ROTINA_PINK, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: f7, fontSize: s(14), color: WHITE }}>Tentar de novo</Text>
              </TouchableOpacity>
            }
          />
        </ScrollView>
      )}

      {state === 'empty' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
          <CenterCard
            title="Sua recomendação está a caminho"
            body="Assim que você fizer seu primeiro scan de pele, montamos aqui os produtos ideais pra cada passo da sua rotina."
          />
        </ScrollView>
      )}

      {state === 'ready' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
          {/* título + subtítulo (contexto da recomendação) */}
          <View style={{ marginHorizontal: s(16), marginTop: s(18) }}>
            <Text style={{ fontFamily: f8, fontSize: s(24), lineHeight: s(24) * 1.15, letterSpacing: s(-0.5), color: INK }}>Os produtos certos pra você</Text>
            <Text style={{ fontFamily: f4, fontSize: s(14), lineHeight: s(14) * 1.5, color: INK_MUTE, marginTop: s(7) }}>Com base na rotina de skincare que montamos pra você, estes são os produtos ideais pra cada passo.</Text>
          </View>

          {/* MANHÃ */}
          {am.length > 0 && (
            <>
              <SectionHeader icon={<IconSun />} label="Pela manhã" />
              {am.map((item) => (item.empty ? renderEmpty(item) : renderProduct(item)))}
            </>
          )}

          {/* NOITE */}
          {pm.length > 0 && (
            <>
              <SectionHeader icon={<IconMoon />} label="À noite" />
              {pm.map((item) => (item.empty ? renderEmpty(item) : renderProduct(item)))}
            </>
          )}

          {count > 0 && (
            <Text style={{ fontFamily: f4, fontSize: s(12), color: INK_MUTE, lineHeight: s(12) * 1.5, textAlign: 'center', marginTop: s(18), marginHorizontal: s(24) }}>
              {count === 1 ? '1 produto escolhido pra sua rotina.' : `${count} produtos escolhidos pra sua rotina.`}
            </Text>
          )}
        </ScrollView>
      )}
      </>)}

      {/* ═══ ABA MINHA COLEÇÃO ═══ */}
      {tab === 'colecao' && (<>
        {colecaoState === 'loading' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: s(120) }}>
            <ActivityIndicator size="large" color={ROTINA_PINK} />
          </View>
        )}

        {colecaoState === 'error' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
            <CenterCard
              title="Não deu pra carregar agora"
              body="Tivemos um problema ao buscar os seus produtos. Tente de novo em instantes."
              action={
                <TouchableOpacity activeOpacity={0.9} onPress={() => { haptics.tap(); loadColecao(); }} style={{ alignSelf: 'flex-start', marginTop: s(14), height: s(44), paddingHorizontal: s(20), borderRadius: s(100), backgroundColor: ROTINA_PINK, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: f7, fontSize: s(14), color: WHITE }}>Tentar de novo</Text>
                </TouchableOpacity>
              }
            />
          </ScrollView>
        )}

        {colecaoState === 'empty' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
            <CenterCard
              title="Sua coleção está vazia"
              body="Escaneie um produto que você tem em casa e responda “sim” quando eu perguntar se ele é seu. Eu passo a montar sua rotina com o que você já tem."
            />
          </ScrollView>
        )}

        {colecaoState === 'ready' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
            <View style={{ marginHorizontal: s(16), marginTop: s(18) }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s(12) }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: f8, fontSize: s(24), lineHeight: s(24) * 1.15, letterSpacing: s(-0.5), color: INK }}>O que você tem em casa</Text>
                  <Text style={{ fontFamily: f4, fontSize: s(14), lineHeight: s(14) * 1.5, color: INK_MUTE, marginTop: s(7) }}>
                    {emCasaCount > 0
                      ? `${emCasaCount === 1 ? '1 passo da sua rotina usa' : `${emCasaCount} passos da sua rotina usam`} um produto seu.`
                      : 'Produtos seus, com o quanto cada um combina com a sua pele.'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    haptics.tap();
                    setEditando((v) => !v);
                    setSelecionados(new Set());
                  }}
                  style={{ paddingTop: s(4) }}
                >
                  <Text style={{ fontFamily: f7, fontSize: s(14), color: ROTINA_PINK }}>{editando ? 'Concluir' : 'Editar'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* grade de quadrados */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: s(16), marginTop: s(18) }}>
              {colecao.map(renderColecaoCard)}
            </View>
          </ScrollView>
        )}

        {/* Barra de remoção — só no modo de edição e com algo selecionado. Fica
            acima do botão "Escanear produto" para não brigar com ele. */}
        {editando && selecionados.size > 0 && (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: s(170), alignItems: 'center' }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={removerSelecionados}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: s(8), height: s(48),
                paddingHorizontal: s(24), borderRadius: s(100), backgroundColor: '#D4183D',
                shadowColor: '#D4183D', shadowOffset: { width: 0, height: s(6) }, shadowOpacity: 0.35, shadowRadius: s(12), elevation: 6,
              }}
            >
              <Svg width={s(17)} height={s(17)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </Svg>
              <Text style={{ fontFamily: f7, fontSize: s(15), color: WHITE }}>
                Remover {selecionados.size > 1 ? `(${selecionados.size})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>)}

      {/* ═══ ABA ESCANEADOS ═══ */}
      {tab === 'escaneados' && (<>
        {scanState === 'loading' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: s(120) }}>
            <ActivityIndicator size="large" color={ROTINA_PINK} />
          </View>
        )}

        {scanState === 'error' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
            <CenterCard
              title="Não deu pra carregar agora"
              body="Tivemos um problema ao buscar seus produtos escaneados. Tente de novo em instantes."
              action={
                <TouchableOpacity activeOpacity={0.9} onPress={() => { haptics.tap(); loadScans(); }} style={{ alignSelf: 'flex-start', marginTop: s(14), height: s(44), paddingHorizontal: s(20), borderRadius: s(100), backgroundColor: ROTINA_PINK, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: f7, fontSize: s(14), color: WHITE }}>Tentar de novo</Text>
                </TouchableOpacity>
              }
            />
          </ScrollView>
        )}

        {scanState === 'empty' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
            <CenterCard
              title="Você ainda não escaneou nenhum produto"
              body="Toque em “Escanear produto” pra analisar um produto — o veredito da NIKS e o histórico aparecem aqui."
            />
          </ScrollView>
        )}

        {scanState === 'ready' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(160) }} showsVerticalScrollIndicator={false}>
            <View style={{ marginHorizontal: s(16), marginTop: s(18), marginBottom: s(6) }}>
              <Text style={{ fontFamily: f8, fontSize: s(24), lineHeight: s(24) * 1.15, letterSpacing: s(-0.5), color: INK }}>Seus produtos escaneados</Text>
              <Text style={{ fontFamily: f4, fontSize: s(14), lineHeight: s(14) * 1.5, color: INK_MUTE, marginTop: s(7) }}>Todos os produtos que você escaneou, com o veredito da NIKS pra cada um.</Text>
            </View>
            <View style={{ marginTop: s(12) }}>
              {scans.map(renderScanCard)}
            </View>
          </ScrollView>
        )}
      </>)}

      {/* Botão "Escanear produto" (Figma node 128:106) — fixo acima da tab bar */}
      <ScanProdutoButton />

      {/* ── Detalhe (overlay full-screen) ──────────────────────────────────── */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)} transparent={false}>
        <View style={{ flex: 1, backgroundColor: WHITE }}>
          {detail && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(40) }} showsVerticalScrollIndicator={false}>
              {/* hero em fundo neutro */}
              <View style={{ height: s(360) + insets.top, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE }}>
                <Pressable onPress={() => { haptics.tap(); setDetail(null); }} style={{ position: 'absolute', top: insets.top + s(12), right: s(20), width: s(40), height: s(40), borderRadius: s(20), backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BORDER, alignItems: 'center', justifyContent: 'center' }}>
                  <IconClose size={17} />
                </Pressable>
                <ExpoImage source={detail.img} style={{ height: s(240), width: '62%' }} contentFit="contain" />
              </View>

              {/* body */}
              <View style={{ paddingTop: s(22), paddingHorizontal: s(20) }}>
                <Text style={{ fontFamily: f7, fontSize: s(11), letterSpacing: s(11) * 0.14, textTransform: 'uppercase', color: INK_MUTE, marginBottom: s(4) }}>{detail.brand}</Text>
                <Text style={{ fontFamily: f8, fontSize: s(24), lineHeight: s(24) * 1.15, letterSpacing: s(24) * -0.02, color: INK }}>{detail.name}</Text>
                {typeof detail.compatibilidade === 'number' && <BarraCompatibilidade valor={detail.compatibilidade} />}
                {renderChips(detail.targets, undefined)}
                <Text style={{ fontFamily: f4, fontSize: s(14.5), lineHeight: s(14.5) * 1.6, color: INK_BODY, marginTop: s(18) }}>{detail.praLong}</Text>
                {!!(detail.alts && detail.alts.length) && (
                  <View style={{ marginTop: s(22) }}>
                    <Text style={{ fontFamily: f7, fontSize: s(10), letterSpacing: s(10) * 0.14, textTransform: 'uppercase', color: INK_FAINT, marginBottom: s(10) }}>Alternativas</Text>
                    {detail.alts!.map((alt, i) => renderAlt(alt, i, detail, true))}
                  </View>
                )}
                {/* Só para produto do CATÁLOGO (tem produto_id) — inclui o detalhe
                    de uma ALTERNATIVA. Passo já preenchido pelo que ela tem em casa
                    não mostra botão: o produto dela já está na rotina e na Coleção. */}
                {!!detail.productId && (
                  <Pressable onPress={handleAdicionarNaRotina} disabled={savedNow} style={{ marginTop: s(24), height: s(52), borderRadius: s(16), backgroundColor: ROTINA_PINK, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s(8), opacity: savedNow ? 0.9 : 1, shadowColor: ROTINA_PINK, shadowOffset: { width: 0, height: s(6) }, shadowOpacity: 0.35, shadowRadius: s(12), elevation: 6 }}>
                    {savedNow && !indoParaRotina && (
                      <Svg width={s(18)} height={s(18)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 6L9 17l-5-5" /></Svg>
                    )}
                    {indoParaRotina && <ActivityIndicator color={WHITE} size="small" />}
                    <Text style={{ fontFamily: f7, fontSize: s(16), color: WHITE }}>{savedNow ? 'Na sua rotina' : 'Adicionar à minha rotina'}</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          )}
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
            onClose={() => setScanDetail(null)}
            onRescan={() => {
              setScanDetail(null);
              router.push('/(scan)/product-camera' as any);
            }}
          />
        )}
      </Modal>

      {/* ── Detalhe de um item da MINHA COLEÇÃO ──────────────────────────────
          Item identificado → a MESMA `ProductAnalysis` do resultado do scan e do
          histórico (fonte única do layout; não duplicar). Item não identificado
          não tem análise para mostrar: vira um cartão curto com o caminho de
          recuperação (nova foto, inclusive do rótulo de ingredientes). */}
      <Modal visible={!!colecaoDetail} animationType="slide" onRequestClose={() => setColecaoDetail(null)} transparent={false}>
        {colecaoDetail && (
          colecaoDetail.status === 'nao_identificado' || !colecaoDetail.resultado ? (
            <View style={{ flex: 1, backgroundColor: WHITE, paddingTop: insets.top + s(20), paddingHorizontal: s(24) }}>
              <Pressable
                onPress={() => { haptics.tap(); setColecaoDetail(null); }}
                style={{ alignSelf: 'flex-end', width: s(40), height: s(40), borderRadius: s(20), backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BORDER, alignItems: 'center', justifyContent: 'center' }}
              >
                <IconClose size={17} />
              </Pressable>

              <View style={{ alignItems: 'center', marginTop: s(20) }}>
                <View style={{ width: s(180), height: s(180), borderRadius: s(20), backgroundColor: PHOTO_BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {colecaoDetail.photoUrl
                    ? <ExpoImage source={{ uri: colecaoDetail.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <IconHerb />}
                </View>
              </View>

              <Text style={{ fontFamily: f8, fontSize: s(24), lineHeight: s(24) * 1.2, color: INK, textAlign: 'center', marginTop: s(24) }}>
                Não consegui identificar esse produto
              </Text>
              <Text style={{ fontFamily: f4, fontSize: s(14), lineHeight: s(14) * 1.55, color: INK_MUTE, textAlign: 'center', marginTop: s(10) }}>
                Pode ser a luz, o reflexo da embalagem ou a marca pequena demais. Tire outra foto — se der, fotografe também o rótulo de ingredientes, que é o que me diz mais sobre a fórmula.
              </Text>
              <Text style={{ fontFamily: f6, fontSize: s(12.5), lineHeight: s(12.5) * 1.5, color: INK_FAINT, textAlign: 'center', marginTop: s(12) }}>
                Enquanto ele não for identificado, não entra na sua rotina — não dá pra avaliar o que eu não consegui ler.
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => refazerFoto(colecaoDetail)}
                style={{ height: s(54), borderRadius: s(100), backgroundColor: ROTINA_PINK, alignItems: 'center', justifyContent: 'center', marginTop: s(28), shadowColor: ROTINA_PINK, shadowOffset: { width: 0, height: s(6) }, shadowOpacity: 0.35, shadowRadius: s(12), elevation: 6 }}
              >
                <Text style={{ fontFamily: f8, fontSize: s(16), color: WHITE }}>Tirar nova foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ProductAnalysis
              result={colecaoDetail.resultado}
              photoUri={colecaoDetail.photoUrl}
              onClose={() => setColecaoDetail(null)}
              onRescan={() => refazerFoto(colecaoDetail)}
              rescanLabel="Tirar nova foto desse produto"
            />
          )
        )}
      </Modal>
    </View>
  );
}
