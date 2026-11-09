import { avisarSeSemAssinatura, autorizacaoIA } from '../../lib/respostaIA';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { invalidateCache, peekCache } from '../../lib/cache';
import { chaveEstado, estadoCartas, type EstadoCartas } from '../../lib/cartasServidor';
import { ganhouPontos } from '../../lib/pontosAnimacao';
import { regenerateProtocolInApp } from '../../lib/regenerateProtocolInApp';
import { ScanLoadingView } from '../../components/scan/ScanLoadingView';

// Tela de carregamento da ANÁLISE DE PELE feita DENTRO do app (scan de 6 fotos).
// Visual = tela 50a do Claude Design (`components/scan/ScanLoadingView`, a mesma
// tela do scan de produto). A LÓGICA é a mesma de antes: chama a Edge Function
// `analyze-skin-app` com as colagens do scan multi-foto, salva o scan no banco,
// invalida o cache da home e navega para o resultado.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export default function LoadingDentroApp() {
  const router = useRouter();
  const { skinImageBase64, skinImageUri, skinCollagesBase64, skinScanLayout, onboarding, setScanResult, setSelectedScan } = useAppStore();
  const { track } = useMixpanel();

  const [percentage, setPercentage] = useState(0);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [showError, setShowError] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState(false);
  const salvarRef = useRef<(() => Promise<void>) | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPercentageRef = useRef(0);
  const retryCount = useRef(0);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    retryCount.current = 0;

    // NOTA: a geração da preview "antes/depois" (generate-skin-preview) é EXCLUSIVA do
    // loading do ONBOARDING (app/(scan)/loading.tsx). Esta tela — o loading de scans
    // feitos DENTRO do app — nunca deve disparar essa geração.

    const tickProgress = () => {
      const current = currentPercentageRef.current;
      if (current >= 99) return;
      let delay: number;
      if (current < 60) delay = 90;
      else if (current < 75) delay = 220;
      else if (current < 85) delay = 500;
      else if (current < 92) delay = 1200;
      else if (current < 96) delay = 3500;
      else delay = 8000;
      progressTimerRef.current = setTimeout(() => {
        const next = current + 1;
        currentPercentageRef.current = next;
        setPercentage(next);
        tickProgress();
      }, delay);
    };
    tickProgress();

    const runAnalysis = async () => {
      try {
        const birthdayVal = onboarding.birthday;
        let idadeNum: number | null = null;
        if (birthdayVal) {
          const asNum = Number(birthdayVal);
          if (!isNaN(asNum) && asNum > 0 && asNum < 120) {
            idadeNum = asNum;
          } else {
            const d = new Date(birthdayVal);
            if (!isNaN(d.getTime())) {
              idadeNum = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            }
          }
        }

        const response = await fetch(
          // Função SEPARADA da do onboarding (`analyze-skin`): esta é a multi-foto,
          // que pode aprofundar a análise sem tocar no funil do onboarding.
          `${SUPABASE_URL}/functions/v1/analyze-skin-app`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': await autorizacaoIA(SUPABASE_ANON_KEY),
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              // Sempre preenchido com a foto NEUTRA. É o campo que a Edge Function
              // usava antes de existir o scan multi-foto — mantê-lo faz um deploy
              // fora de ordem (app novo + função velha) degradar para a análise de
              // 1 foto em vez de quebrar.
              imageBase64: skinImageBase64,
              // Scan multi-foto: 'turns_v1' = [frente, um lado, outro lado] (câmera do
              // giro, out/2026); 'expressions_v1' = [neutra_alta, layoutA, layoutB]
              // (camera-multi, aposentada). Ausente no fluxo de 1 foto — é o que a
              // função usa para escolher o prompt.
              imagesBase64: skinCollagesBase64.length ? skinCollagesBase64 : undefined,
              scanLayout: skinCollagesBase64.length ? (skinScanLayout ?? 'expressions_v1') : 'single',
              skinProfile: {
                skin_type: onboarding.skin_type,
                concerns: onboarding.concerns,
                genero: onboarding.genero,
                idade: idadeNum,
                sun_exposure: onboarding.sun_exposure,
                hydration: onboarding.hydration,
                sleep: onboarding.sleep,
              },
            }),
          }
        );
        if (!response.ok) {
          avisarSeSemAssinatura(response.status);
          const errBody = await response.json().catch(() => ({}));
          throw new Error(JSON.stringify(errBody));
        }
        const data = await response.json();

        setSelectedScan(null);
        setScanResult(data, skinImageUri ?? '');
        track('scan_completed', { skin_score: data.skin_score, skin_type: data.skin_type_detected });
        setPercentage(100);

        // A análise já foi feita: "Tentar de novo" só salva, com a mesma foto e sem chamar a IA.
        let fotoUrl = '';
        const salvarScan = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('sem usuário para salvar o scan');
          {
            const { skinImageBase64: b64 } = useAppStore.getState();
            if (b64 && !fotoUrl) {
              const path = `${user.id}/${Date.now()}.jpg`;
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
            // Regras novas das cartas: o scan dá NIKS Points sem carta (1 a cada 7 dias, pelo
            // gatilho do servidor). O total de antes, para a barra de nível subir depois.
            const totalAntes = peekCache<EstadoCartas>(chaveEstado(user.id))?.data?.pontos?.total;
            const inserirScan = () => supabase.from('skin_scans').insert({
              user_id: user.id,
              foto_url: fotoUrl,
              skin_score: data.skin_score,
              tipo_pele: data.skin_type_detected,
              metricas: { acne: data.acne, skin_age: data.skin_age },
              areas_atencao: data.pontos_fracos,
              resumo: data.headline,
              full_result: data,
            }).select('id').single();
            let { data: scanRow, error: erroScan } = await inserirScan();
            if (erroScan) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              ({ data: scanRow, error: erroScan } = await inserirScan());
            }
            if (erroScan) throw erroScan;
            // Novo scan = novo score, novas métricas, nova foto. A home lê de
            // cache, então precisa ser invalidada aqui ou mostraria o scan antigo.
            invalidateCache(`home:${user.id}`);
            if (typeof totalAntes === 'number') {
              void estadoCartas()
                .then((e) => { if (e.pontos && e.pontos.total > totalAntes) ganhouPontos({ total_antes: totalAntes, total: e.pontos.total }); })
                .catch(() => {});
            }
            // Regeneração do protocolo no 1º scan in-app — BACKGROUND, não bloqueia a
            // navegação. A função de módulo sobrevive à desmontagem desta tela; os guards
            // internos (marcador + regenInFlight) garantem "uma única vez".
            void regenerateProtocolInApp(user.id, data, scanRow?.id ?? null);
          }
        } catch (e) {
          // Resultado que não foi salvo não aparece como se estivesse: some do histórico depois.
          console.warn('Failed to save scan to DB:', e);
          track('scan_nao_salvo', { error: (e as any)?.message ?? 'unknown' });
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          setErroAoSalvar(true);
          setShowError(true);
          return;
        }

        setTimeout(() => {
          // Mesmo relatório do onboarding (49d), em modo app (a `skin-result` antiga saiu do fluxo).
          router.replace('/(scan)/resultado-scan?modo=app' as any);
        }, 500);
        };
        salvarRef.current = salvarScan;
        await salvarScan();
      } catch (err) {
        if (retryCount.current < 2) {
          retryCount.current += 1;
          await new Promise(resolve => setTimeout(resolve, 2000));
          await runAnalysis();
        } else {
          track('scan_failed', { error: (err as any)?.message ?? 'unknown' });
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          setShowError(true);
        }
      }
    };
    runAnalysis();

    return () => { if (progressTimerRef.current) clearTimeout(progressTimerRef.current); };
  }, []);

  useEffect(() => {
    if (percentage >= 99 && !showError) {
      demandTimerRef.current = setTimeout(() => setShowDemandNotice(true), 3000);
    } else {
      if (demandTimerRef.current) clearTimeout(demandTimerRef.current);
      setShowDemandNotice(false);
    }
    return () => { if (demandTimerRef.current) clearTimeout(demandTimerRef.current); };
  }, [percentage, showError]);

  useEffect(() => {
    if (!showDemandNotice) {
      if (countdownRef.current) clearTimeout(countdownRef.current);
      setCountdown(60);
      setCountdownPaused(false);
      return;
    }
    const tick = (current: number, paused: boolean) => {
      if (paused) return;
      if (current <= 1) {
        setCountdownPaused(true);
        setCountdown(0);
        countdownRef.current = setTimeout(() => {
          setCountdown(60);
          setCountdownPaused(false);
          countdownRef.current = setTimeout(() => tick(60, false), 1000);
        }, 3000);
        return;
      }
      const next = current - 1;
      setCountdown(next);
      countdownRef.current = setTimeout(() => tick(next, false), 1000);
    };
    countdownRef.current = setTimeout(() => tick(60, false), 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [showDemandNotice]);

  return (
    <ScanLoadingView
      kind="face"
      percentage={percentage}
      showDemandNotice={showDemandNotice}
      countdown={countdown}
      countdownPaused={countdownPaused}
      showError={showError}
      erroAoSalvar={erroAoSalvar ? { titulo: 'Não conseguimos salvar sua análise', botao: 'Tentar de novo' } : null}
      onRetry={() => {
        if (erroAoSalvar) {
          setErroAoSalvar(false);
          setShowError(false);
          void salvarRef.current?.();
          return;
        }
        // Câmera nova do zero (a do giro chega aqui com `replace`, então não há o que "voltar").
        router.replace('/(scan)/camera?modo=app' as any);
      }}
    />
  );
}
