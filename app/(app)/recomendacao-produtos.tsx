import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, Modal, Pressable, TouchableOpacity,
  useWindowDimensions, ActivityIndicator,
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
import { saveProductForStep } from '../../lib/savedProducts';
import ProductAnalysis from '../../components/product/ProductAnalysis';
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

type Alt = { brand: string; name: string; sub: string; img: any; praLong?: string; targets?: string[] };
type Item = {
  id: string; num: string; step: string; brand?: string; name?: string; img?: any;
  pra?: string; praLong?: string; targets?: string[]; alts?: Alt[];
  empty?: boolean; note?: string; productId?: string; // id do produto principal (deep-link da home)
};

// ── Formato do JSON salvo em recomendacoes_produtos.recomendacao ──────────────
type RecProduto = { produto_id: string; principal?: boolean; copy?: string };
type RecPasso = {
  categoria?: string; passo?: string; periodo?: string;
  ingrediente_alvo?: string; produtos?: RecProduto[];
  sem_produto?: boolean; motivo?: string;
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
    brand: main.marca, name: main.nome, img: { uri: main.imagem_url },
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
  const [count, setCount] = useState(0);

  // Deep-link da home ("Para você"): produto_id cujo detalhe deve abrir ao entrar aqui.
  const productDetailTarget = useAppStore((s) => s.productDetailTarget);
  const setProductDetailTarget = useAppStore((s) => s.setProductDetailTarget);

  // Abas: "Recomendados" (recomendação salva) | "Escaneados" (histórico de scans).
  const [tab, setTab] = useState<'recomendados' | 'escaneados'>('recomendados');
  const [scanState, setScanState] = useState<LoadState>('loading');
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [scanDetail, setScanDetail] = useState<ScanItem | null>(null);

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

      if (amItems.length === 0 && pmItems.length === 0) { setState('empty'); return; }

      // Nº de passos (únicos) com produto recomendado — usado no rodapé.
      const withProduct = passos.filter(
        (p) => !p.sem_produto && (p.produtos ?? []).some((x) => prodMap.has(x.produto_id)),
      ).length;

      setAm(amItems);
      setPm(pmItems);
      setCount(withProduct);
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

  // Abre a página de detalhe de um produto ALTERNATIVO (mesmo layout, dados da alt).
  // Herda o período do passo pai (id am*/pm*) p/ o rótulo "Manhã/Noite · passo".
  const openAlt = (alt: Alt, parent: Item) => setDetail({
    id: parent.id + '-alt', num: parent.num, step: parent.step,
    brand: alt.brand, name: alt.name, img: alt.img,
    pra: alt.sub, praLong: alt.praLong ?? alt.sub,
    targets: alt.targets ?? [], alts: [],
  });

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
          <Text style={{ fontFamily: f8, fontSize: s(15), color: INK, lineHeight: s(15) * 1.25 }}>Ainda sem um produto ideal</Text>
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
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: s(32), paddingTop: s(14), paddingBottom: s(8), backgroundColor: WHITE }}>
        {(['recomendados', 'escaneados'] as const).map((id) => {
          const active = tab === id;
          return (
            <TouchableOpacity key={id} onPress={() => { haptics.select(); setTab(id); }} activeOpacity={0.8} style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: active ? f8 : f6, fontSize: s(15), color: active ? INK : INK_FAINT }}>{id === 'recomendados' ? 'Recomendados' : 'Escaneados'}</Text>
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
                {renderChips(detail.targets, undefined)}
                <Text style={{ fontFamily: f4, fontSize: s(14.5), lineHeight: s(14.5) * 1.6, color: INK_BODY, marginTop: s(18) }}>{detail.praLong}</Text>
                {!!(detail.alts && detail.alts.length) && (
                  <View style={{ marginTop: s(22) }}>
                    <Text style={{ fontFamily: f7, fontSize: s(10), letterSpacing: s(10) * 0.14, textTransform: 'uppercase', color: INK_FAINT, marginBottom: s(10) }}>Alternativas</Text>
                    {detail.alts!.map((alt, i) => renderAlt(alt, i, detail, true))}
                  </View>
                )}
                <Pressable onPress={handleSaveToRoutine} disabled={savedNow} style={{ marginTop: s(24), height: s(52), borderRadius: s(16), backgroundColor: ROTINA_PINK, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s(8), opacity: savedNow ? 0.9 : 1, shadowColor: ROTINA_PINK, shadowOffset: { width: 0, height: s(6) }, shadowOpacity: 0.35, shadowRadius: s(12), elevation: 6 }}>
                  {savedNow && (
                    <Svg width={s(18)} height={s(18)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 6L9 17l-5-5" /></Svg>
                  )}
                  <Text style={{ fontFamily: f7, fontSize: s(16), color: WHITE }}>{savedNow ? 'Salvo na sua rotina' : 'Salvar na minha rotina'}</Text>
                </Pressable>
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
    </View>
  );
}
