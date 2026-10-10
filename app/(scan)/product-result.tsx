import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { requestAppReview } from '../../lib/storeReview';
import { clearShareResume } from '../../lib/shareResume';
import { useColecaoToggle } from '../../hooks/useColecaoToggle';
import { waitScanCutout } from '../../lib/scanCutouts';
import { supabase } from '../../lib/supabase';
import { getUserId } from '../../lib/currentUser';
import { addToColecao } from '../../lib/colecao';
import { avaliarProduto } from '../../lib/avisoProduto';
import { definirProdutoDoPasso, garantirMinhaRotina } from '../../lib/minhaRotina';
import { adicionarDoScan, desfazerAdicao, type Desfazer } from '../../lib/adicionarDoScan';
import { invalidateCache } from '../../lib/cache';
import { haptics } from '../../lib/haptics';

// Tela de RESULTADO do scan de produto (fluxo da câmera → loading → aqui).
// O layout inteiro vive em `components/product/ProductAnalysis` — o MESMO componente que o
// detalhe da aba "Escaneados" (`recomendacao-produtos.tsx`) usa, pra que as duas telas nunca
// mais divirjam. Aqui só ligamos a fonte dos dados (store) e a navegação.

export default function ProductResult() {
  const router = useRouter();

  // Chegar aqui encerra o fluxo do "Compartilhar com o NIKS": descarta a retomada
  // guardada em `lib/shareResume` (que existe só para a tela de carregamento
  // sobreviver a um remount). Inofensivo no fluxo da câmera, que não usa retomada.
  useEffect(() => { clearShareResume(); }, []);
  const { productScanResult, productImageBase64, productImageMimeType } = useAppStore();

  const photoUri = productImageBase64
    ? `data:${productImageMimeType ?? 'image/jpeg'};base64,${productImageBase64}`
    : null;

  // "Tenho em casa" — só para análise ok que foi salva (tem scan_id).
  const r = productScanResult as any;
  const colecaoSrc = useMemo(() => (r?.status === 'ok' && r?.scan_id ? {
    origem: 'scan' as const, productScanId: r.scan_id,
    nome: r.produto?.nome ?? null, marca: r.produto?.marca ?? null,
    categoria: r.produto?.categoria ?? null, compat: r.compatibilidade ?? null,
  } : null), [r]);
  const col = useColecaoToggle(colecaoSrc);

  // ── "Escanear produto" da folha "Escolher produto" (Rotina, Fase 2) ──────────
  // Se a usuária veio da folha (`rotinaPassoAlvo`, válido por 15 min), o produto
  // analisado entra na ESTANTE e no PASSO que pediu. Aviso forte (risco real) pede
  // confirmação; escolher outro deixa o produto só na estante. Uma vez por resultado.
  const alvo = useAppStore((st) => st.rotinaPassoAlvo);
  const setRotinaPassoAlvo = useAppStore((st) => st.setRotinaPassoAlvo);
  const aplicouRef = useRef(false);
  const [veioDaRotina, setVeioDaRotina] = useState(false);
  useEffect(() => {
    if (aplicouRef.current || !alvo || r?.status !== 'ok' || !r?.scan_id || !colecaoSrc) return;
    if (Date.now() - alvo.em > 15 * 60_000) { setRotinaPassoAlvo(null); return; }
    aplicouRef.current = true;
    setVeioDaRotina(true);
    setRotinaPassoAlvo(null);
    (async () => {
      const uid = await getUserId();
      if (!uid) return;
      const colecaoId = await addToColecao(uid, colecaoSrc);
      col.recheck();
      if (!colecaoId) return;
      const { data: u } = await supabase.from('users').select('pregnancy_status, tipo_pele').eq('id', uid).maybeSingle();
      const aviso = avaliarProduto({
        nome: r.produto?.nome ?? null, categoria: r.produto?.categoria ?? null,
        ativos: Array.isArray(r.produto?.ativos_detectados) ? r.produto.ativos_detectados : null,
        veredito: r.veredito ?? null, compat: typeof r.compatibilidade === 'number' ? r.compatibilidade : null,
        avisosAnalise: Array.isArray(r.avisos) ? r.avisos : null,
      }, { pregnancyStatus: u?.pregnancy_status ?? null, tipoPele: u?.tipo_pele ?? null });
      const usar = async () => {
        await definirProdutoDoPasso(alvo.passoId, { origem: 'estante', id: colecaoId }, aviso);
        invalidateCache(`minharotina:${uid}`);
        haptics.success();
        Alert.alert('Adicionado à sua rotina', `Entrou no passo "${alvo.nome}" e na sua estante.`, [
          { text: 'OK', style: 'cancel' },
          { text: 'Ver rotina', onPress: () => router.replace('/(app)/protocolo' as any) },
        ]);
      };
      if (aviso.nivel === 'forte') {
        haptics.warning();
        Alert.alert('Atenção', `${aviso.texto ?? 'Esse produto pede cuidado na sua pele.'}\n\nEle já está na sua estante.`, [
          { text: 'Escolher outro', style: 'cancel' },
          { text: 'Usar mesmo assim', style: 'destructive', onPress: () => { void usar().catch(() => {}); } },
        ]);
      } else {
        await usar();
      }
    })().catch((e) => {
      console.warn('[rotina] produto escaneado não entrou no passo:', e);
      haptics.error();
      Alert.alert('Não deu pra pôr no passo', 'Abra a Rotina e escolha o produto de novo.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo, r?.status, r?.scan_id, colecaoSrc]);

  // ── "Adicionar à minha rotina" (Rotina, Fase 8 — decisão 9) ──────────────────
  // Entra onde a análise sugeriu (decisao_rotina: período, depois de qual passo, dias)
  // e na estante. Aviso no rodapé com "Desfazer". Não aparece quando o scan veio da
  // folha "Escolher produto" (aí o produto já foi para o passo pedido).
  const insets = useSafeAreaInsets();
  const [rotinaEstado, setRotinaEstado] = useState<'livre' | 'fazendo' | 'feito'>('livre');
  const [aviso, setAviso] = useState<{ texto: string; desfazer: Desfazer } | null>(null);
  const avisoAnim = useRef(new Animated.Value(0)).current;
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrarAviso = (a: { texto: string; desfazer: Desfazer } | null) => {
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    setAviso(a);
    Animated.timing(avisoAnim, { toValue: a ? 1 : 0, duration: a ? 320 : 200, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    if (a) avisoTimer.current = setTimeout(() => mostrarAviso(null), 8000);
  };
  useEffect(() => () => { if (avisoTimer.current) clearTimeout(avisoTimer.current); }, []);

  const adicionarNaRotina = async () => {
    const decisao = r?.decisao_rotina;
    if (!r?.scan_id || !decisao || rotinaEstado !== 'livre') return;
    const uid = await getUserId();
    if (!uid) return;
    const fazer = async () => {
      setRotinaEstado('fazendo');
      try {
        // Sem Minha rotina ainda (nunca abriu a Rotina na build nova): cria a cópia antes.
        await garantirMinhaRotina(uid);
        const res = await adicionarDoScan(uid, r.scan_id, decisao);
        invalidateCache(`minharotina:${uid}`);
        col.recheck();
        haptics.success();
        setRotinaEstado('feito');
        mostrarAviso({ texto: res.aviso, desfazer: res.desfazer });
      } catch (e) {
        console.warn('[rotina] adicionar do scan falhou:', e);
        haptics.error();
        setRotinaEstado('livre');
        Alert.alert('Não deu para adicionar', 'Verifique sua conexão e tente de novo.');
      }
    };
    // Aviso forte (risco real, ex.: retinoide na gravidez) pede confirmação, como na folha.
    const { data: u } = await supabase.from('users').select('pregnancy_status, tipo_pele').eq('id', uid).maybeSingle();
    const av = avaliarProduto({
      nome: r.produto?.nome ?? null, categoria: r.produto?.categoria ?? null,
      ativos: Array.isArray(r.produto?.ativos_detectados) ? r.produto.ativos_detectados : null,
      veredito: r.veredito ?? null, compat: typeof r.compatibilidade === 'number' ? r.compatibilidade : null,
      avisosAnalise: Array.isArray(r.avisos) ? r.avisos : null,
    }, { pregnancyStatus: u?.pregnancy_status ?? null, tipoPele: u?.tipo_pele ?? null });
    if (av.nivel === 'forte') {
      haptics.warning();
      Alert.alert('Atenção', av.texto ?? 'Esse produto pede cuidado na sua pele.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Adicionar mesmo assim', style: 'destructive', onPress: () => { void fazer(); } },
      ]);
    } else {
      await fazer();
    }
  };

  const desfazer = async () => {
    if (!aviso) return;
    const d = aviso.desfazer;
    haptics.tap();
    mostrarAviso(null);
    try {
      const uid = await getUserId();
      if (!uid) return;
      await desfazerAdicao(uid, d);
      invalidateCache(`minharotina:${uid}`);
      col.recheck();
      setRotinaEstado('livre');
    } catch {
      Alert.alert('Não deu para desfazer', 'Abra a Rotina e remova o passo por lá.');
    }
  };

  // Recorte sem fundo (Fase 3): o servidor faz em segundo plano depois da análise. A foto
  // original aparece na hora; quando o recorte fica pronto, troca por ele. Espera até 90 s:
  // o normal é ~5 s, mas com a fila do Replicate cheia (429) o servidor tenta de novo por
  // até ~3 min — com 20 s a tela desistia e ficava com a foto de fundo até ser reaberta.
  // Se falhar, fica a original.
  const [cutoutUri, setCutoutUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setCutoutUri(null);
    if (r?.status === 'ok' && r?.scan_id) {
      waitScanCutout(r.scan_id, 90_000).then((url) => { if (alive && url) setCutoutUri(url); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [r?.scan_id, r?.status]);

  return (
    <View style={{ flex: 1 }}>
    <ProductAnalysis
      result={productScanResult}
      photoUri={photoUri}
      cutoutUri={cutoutUri}
      // Veio da folha "Escolher produto" → fecha de volta na Rotina.
      onClose={() => { requestAppReview(); router.replace((veioDaRotina ? '/(app)/protocolo' : '/(app)/recomendacao-produtos') as any); }}
      onRescan={() => router.replace('/(scan)/product-camera' as any)}
      rescanLabel={productScanResult?.status === 'precisa_foto' ? 'Escanear os ingredientes' : 'Escanear outro produto'}
      colecao={colecaoSrc && col.owned !== null ? { owned: col.owned, busy: col.busy, onToggle: col.toggle } : undefined}
      rotina={!veioDaRotina && !alvo && r?.status === 'ok' && r?.scan_id ? { estado: rotinaEstado, onAdd: () => { void adicionarNaRotina(); } } : undefined}
    />
    {/* "Adicionado à sua rotina da manhã, depois do sérum · Desfazer" */}
    {!!aviso && (
      <Animated.View
        style={{
          position: 'absolute', left: 14, right: 14, bottom: insets.bottom + 88, // acima do botão fixo da estante
          opacity: avisoAnim, transform: [{ translateY: avisoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16,
          backgroundColor: '#1F1A1C', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12,
        }}
      >
        <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: '#FFFFFF' }}>{aviso.texto}</Text>
        <TouchableOpacity onPress={desfazer} hitSlop={10}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF8AC0' }}>Desfazer</Text>
        </TouchableOpacity>
      </Animated.View>
    )}
    </View>
  );
}
