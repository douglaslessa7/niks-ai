import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getUserId } from '../../lib/currentUser';
import { invalidateCache } from '../../lib/cache';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { OB_STEPS, obStep, useOnMount } from '../../components/onboarding/kit';
import { ScanLoadingView, useDemandNotice } from '../../components/scan/ScanLoadingView';
import { awaitSkinReport } from '../../lib/onboardingPrefetch';

// Loading do SCAN DE ROSTO do ONBOARDING — entre a câmera (7) e o resultado (8).
// Visual = tela 50a do Claude Design (`components/scan/ScanLoadingView`), a MESMA do
// scan de rosto de dentro do app e (50b) do scan de produto: regra do produto — todo
// scan de rosto ou de produto passa por esta tela de carregamento.
//
// A LÓGICA é a do onboarding: a análise (`analyze-skin`) foi disparada pela própria
// câmera (`lib/onboardingPrefetch.ts`); aqui só aguardamos — e o módulo dispara de
// novo se o job de fundo falhou. A % sobe devagar até 99 e, com o relatório pronto,
// corre até 100 em ≤ FINISH_MS. Erro → "Tentar novamente" abre a câmera em modo
// retake, que volta direto para cá. Sem voltar.
const FINISH_MS = 1200;

export default function AnalisandoFoto() {
  const router = useRouter();
  const { track } = useMixpanel();
  const [pct, setPct] = useState(0);
  const [failed, setFailed] = useState(false);
  const pctRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const demand = useDemandNotice(pct, failed);

  useOnMount(() => track('onboarding_step_viewed', obStep(OB_STEPS.analisando, 'Analisando Foto')));

  const set = (v: number) => { pctRef.current = v; setPct(v); };

  const run = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setFailed(false);
    set(0);

    // Mesmo ritmo do loading de dentro do app: rápido no começo, devagar perto de 99.
    const tick = () => {
      const c = pctRef.current;
      if (c >= 99) return;
      const delay = c < 60 ? 90 : c < 75 ? 220 : c < 85 ? 500 : c < 92 ? 1200 : c < 96 ? 3500 : 8000;
      timer.current = setTimeout(() => { set(c + 1); tick(); }, delay);
    };
    tick();

    const finish = () => new Promise<void>((resolve) => {
      if (timer.current) clearTimeout(timer.current);
      const step = () => {
        const next = Math.min(100, pctRef.current + 1);
        set(next);
        if (next >= 100) resolve();
        else timer.current = setTimeout(step, FINISH_MS / 100);
      };
      step();
    });

    (async () => {
      const { result, error } = await awaitSkinReport();
      if (!result) {
        if (timer.current) clearTimeout(timer.current);
        track('scan_failed', { error });
        runningRef.current = false;
        setFailed(true);
        return;
      }
      const { skinImageUri, setScanResult, setSelectedScan } = useAppStore.getState();
      setSelectedScan(null);
      setScanResult(result, skinImageUri ?? '');
      track('scan_completed', { skin_score: result.skin_score, skin_type: result.skin_type_detected });
      await finish();
      saveScanIfLoggedIn(result);
      track('onboarding_step_completed', obStep(OB_STEPS.analisando, 'Analisando Foto'));
      // `replace`: o voltar/fechar do resultado não deve cair neste loading.
      setTimeout(() => router.replace('/(scan)/resultado-scan' as any), 500);
    })();
  };

  useEffect(() => {
    run();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScanLoadingView
        kind="face"
        percentage={pct}
        showDemandNotice={demand.showDemandNotice}
        countdown={demand.countdown}
        countdownPaused={demand.countdownPaused}
        showError={failed}
        onRetry={() => router.replace('/(scan)/camera?retake=1' as any)}
      />
    </View>
  );
}

// Quem refaz o onboarding JÁ LOGADA (ex.: conta sem assinatura) ganha o scan salvo
// agora — mesmo comportamento do loading antigo (tela 18). Sem sessão, quem salva é o
// signup (`saveToSupabase`). Falha aqui não trava nada.
async function saveScanIfLoggedIn(data: NonNullable<ReturnType<typeof useAppStore.getState>['scanResult']>) {
  try {
    const userId = await getUserId();
    if (!userId) return;
    const { skinImageBase64: b64 } = useAppStore.getState();
    let fotoUrl = '';
    if (b64) {
      const path = `${userId}/${Date.now()}.jpg`;
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { error: upErr } = await supabase.storage
        .from('scans').upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
      if (!upErr) {
        const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
        fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
      }
    }
    await supabase.from('skin_scans').insert({
      user_id: userId,
      foto_url: fotoUrl,
      skin_score: data.skin_score,
      tipo_pele: data.skin_type_detected,
      metricas: { acne: data.acne, skin_age: data.skin_age },
      areas_atencao: data.pontos_fracos,
      resumo: data.headline,
      full_result: data,
    });
    invalidateCache(`home:${userId}`);
  } catch (e) {
    console.warn('Failed to save scan to DB:', e);
  }
}
