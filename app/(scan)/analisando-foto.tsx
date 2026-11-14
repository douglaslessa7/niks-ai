import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { OB_STEPS, obStep, useOnMount } from '../../components/onboarding/kit';
import { ScanLoadingView, useDemandNotice } from '../../components/scan/ScanLoadingView';
import PreaquecerCarta from '../../components/cartas/PreaquecerCarta';
import { aguardarAnaliseRapida } from '../../lib/onboardingPrefetch';
import { escolherProblema } from '../../lib/analiseRapida';

// Loading do SCAN DE ROSTO do ONBOARDING — entre a câmera (7) e o resultado (8).
// Visual = tela 50a do Claude Design (`components/scan/ScanLoadingView`), a MESMA do
// scan de rosto de dentro do app e (50b) do scan de produto: regra do produto — todo
// scan de rosto ou de produto passa por esta tela de carregamento.
//
// A LÓGICA é a do onboarding: desde 06/nov/2026 aqui só roda a ANÁLISE RÁPIDA
// (`analise-rapida`, disparada pela própria câmera — `lib/onboardingPrefetch.ts`); a
// completa só depois da compra. Aqui só aguardamos — e o módulo dispara de novo se o job
// de fundo falhou. A % sobe devagar até 99 e, com a análise pronta, corre até 100 em
// ≤ FINISH_MS. Erro ou foto sem rosto nítido → "Tentar novamente" abre a câmera em modo
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
  const doneRef = useRef(false);
  const [sobCarta, setSobCarta] = useState(false);
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
      const { result, error } = await aguardarAnaliseRapida();
      if (!result || !result.foto_valida) {
        if (timer.current) clearTimeout(timer.current);
        track('scan_failed', { error: result ? 'foto_invalida' : error });
        runningRef.current = false;
        setFailed(true);
        return;
      }
      useAppStore.getState().setSelectedScan(null);
      const escolhido = escolherProblema(result, useAppStore.getState().onboarding.concerns);
      track('scan_completed', {
        analise: 'rapida',
        idade_pele: result.idade_pele,
        problema: escolhido?.problema ?? null,
        intensidade: escolhido?.intensidade ?? null,
      });
      await finish();
      track('onboarding_step_completed', obStep(OB_STEPS.analisando, 'Analisando Foto'));
      doneRef.current = true;
      // Chegada da carta (03/nov/2026): com a análise PRONTA, a carta abre por cima deste
      // loading (modal transparente — o preto dela escurece esta tela) e o "Continuar" dela
      // segue o onboarding. Uma vez por onboarding. Já vista (refazer o scan) → a tela
      // seguinte à carta ("Calma, <nome>."): o resultado do scan (`resultado-scan`) precisa
      // do relatório completo, que só existe depois da compra.
      const st = useAppStore.getState();
      if (!st.cartaChegadaVista) {
        router.push('/(carta)/carta?modo=onboarding' as any);
        // Por baixo da carta, este loading fica rosa (o fundo da carta): quando o resultado
        // entra deslizando por cima, o que aparece atrás é o rosa, e não o loading em 100%.
        setTimeout(() => setSobCarta(true), 3000);
        return;
      }
      setTimeout(() => router.replace('/(scan)/solucao' as any), 500);
    })();
  };

  // A carta fechou ("Quero resolver isso"): esta tela, já rosa por baixo, troca a si mesma
  // pela "Calma, <nome>." — sem animação (`(scan)/_layout`), então a troca não aparece. É
  // também o caminho de qualquer volta para cá depois da carta: nunca repete a carta.
  useFocusEffect(useCallback(() => {
    if (doneRef.current && useAppStore.getState().cartaChegadaVista) router.replace('/(scan)/solucao' as any);
  }, [router]));

  useEffect(() => {
    run();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScanLoadingView
        kind="face"
        plainBackground  // fundo branco como o resto do onboarding (pedido do produto)
        percentage={pct}
        showDemandNotice={demand.showDemandNotice}
        countdown={demand.countdown}
        countdownPaused={demand.countdownPaused}
        showError={failed}
        onRetry={() => router.replace('/(scan)/camera?retake=1' as any)}
      />
      {/* Skia e faces da carta já prontos quando a carta abrir (evita o tranco na entrada). */}
      {!failed && <PreaquecerCarta />}
      {/* O mesmo degradê do fundo da carta e da "Calma, <nome>." — se esta tela aparecer por
          um instante na troca entre as duas, não se vê diferença. */}
      {sobCarta && <View pointerEvents="none" style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FF5EA8',
        experimental_backgroundImage: 'radial-gradient(circle at 50% 46%, #FF8DC3 0%, #FF5EA8 52%, #EC4895 100%)',
      }} />}
    </View>
  );
}

// Quem refaz o onboarding JÁ LOGADA (ex.: conta sem assinatura) tinha o scan salvo aqui
// (`saveScanIfLoggedIn`). Desde 06/nov/2026 não há relatório antes da compra: quem salva o
// scan é a tela de espera depois da compra (`(onboarding)/loading-rotina`), com ou sem conta.
