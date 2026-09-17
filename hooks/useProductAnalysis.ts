import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '../store/onboarding';
import { useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import { getAccessToken } from '../lib/sessionToken';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export type ProductScanOrigem = 'camera' | 'share_url' | 'share_image';

type Options = {
  /** A análise só começa quando `enabled` vira true (ex.: depois do consentimento e da imagem pronta). */
  enabled: boolean;
  origem: ProductScanOrigem;
  /** Título da página (fluxo de share por link) — contexto extra para a IA. */
  productName?: string | null;
  /** % inicial do contador (o fluxo de link já gastou uma fatia buscando a imagem). */
  percentFloor?: number;
  /**
   * `true` (padrão): ao terminar, navega sozinho para o `product-result` — é o que a
   * câmera (`product-loading`) faz desde sempre.
   * `false`: a tela FICA e recebe o resultado em `result` para revelar na própria
   * tela (o "Compartilhar com o NIKS" mostra a compatibilidade antes de abrir a
   * análise completa). O scan já está salvo no banco nos dois casos.
   */
  navigateOnSuccess?: boolean;
};

/**
 * LÓGICA das telas de carregamento do scan de produto (`product-loading` e
 * `share-product-loading`). O visual fica em cada tela; aqui mora:
 *  - chamada à Edge Function `analisar-produto` com o token da sessão;
 *  - `clientScanId` estável (retry não duplica scan em `product_scans`);
 *  - guard `useRef` contra execução dupla (StrictMode / remount — decisão 25);
 *  - % realista que desacelera perto de 99;
 *  - aviso de "alta demanda" com countdown depois de 99%;
 *  - 2 retries automáticos e estado de erro com `retry()` manual;
 *  - sucesso → `setProductScanResult` → `router.replace('/(scan)/product-result')`.
 *
 * A imagem é lida do store (`productImageBase64`) no momento da chamada — nunca por params.
 */
export function useProductAnalysis({
  enabled, origem, productName, percentFloor = 0, navigateOnSuccess = true,
}: Options) {
  const router = useRouter();
  const { track } = useMixpanel();
  const setProductScanResult = useAppStore((s) => s.setProductScanResult);

  const [percentage, setPercentage] = useState(percentFloor);
  const [showDemandNotice, setShowDemandNotice] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [showError, setShowError] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPercentageRef = useRef(percentFloor);
  const retryCount = useRef(0);
  // clientScanId estável entre tentativas → idempotência no `analisar-produto`.
  const clientScanIdRef = useRef(`prod_${Date.now()}_${Math.floor(Math.random() * 1e6)}`);
  const runningRef = useRef(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productNameRef = useRef(productName);
  productNameRef.current = productName;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  const tickProgress = useCallback(() => {
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
      if (!mountedRef.current) return;
      const next = currentPercentageRef.current + 1;
      currentPercentageRef.current = next;
      setPercentage(next);
      tickProgress();
    }, delay);
  }, []);

  const runAnalysis = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const attempt = async (): Promise<void> => {
      try {
        const { productImageBase64, productImageMimeType } = useAppStore.getState();
        if (!productImageBase64) throw new Error('Sem imagem do produto');

        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Sem sessão válida');

        const name = productNameRef.current?.trim();
        const response = await fetch(`${SUPABASE_URL}/functions/v1/analisar-produto`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            images: [{ base64: productImageBase64, mimeType: productImageMimeType ?? 'image/jpeg' }],
            clientScanId: clientScanIdRef.current,
            ...(name ? { productName: name } : {}),
          }),
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(JSON.stringify(errBody));
        }
        const data = await response.json();
        if (!mountedRef.current) return;

        if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
        setProductScanResult(data);
        currentPercentageRef.current = 100;
        setPercentage(100);
        track('product_scan_completed', {
          origem,
          status: data?.status ?? null,
          compatibilidade: typeof data?.compatibilidade === 'number' ? data.compatibilidade : null,
          veredito: data?.veredito ?? null,
        });

        if (navigateOnSuccess) {
          setTimeout(() => {
            if (mountedRef.current) router.replace('/(scan)/product-result' as any);
          }, 500);
        } else {
          // Deixa o anel fechar em 100% antes de revelar.
          setTimeout(() => { if (mountedRef.current) setResult(data); }, 500);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (retryCount.current < 2) {
          retryCount.current += 1;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (mountedRef.current) await attempt();
        } else {
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          track('product_scan_failed', { origem, error: String((err as Error)?.message ?? err).slice(0, 300) });
          setShowError(true);
          runningRef.current = false;
        }
      }
    };

    await attempt();
  }, [navigateOnSuccess, origem, router, setProductScanResult, tickProgress, track]);

  // Dispara uma única vez quando habilitado.
  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    retryCount.current = 0;
    currentPercentageRef.current = Math.max(currentPercentageRef.current, percentFloor);
    setPercentage(currentPercentageRef.current);
    tickProgress();
    runAnalysis();
  }, [enabled, percentFloor, runAnalysis, tickProgress]);

  const retry = useCallback(() => {
    if (runningRef.current) return;
    retryCount.current = 0;
    setShowError(false);
    tickProgress();
    runAnalysis();
  }, [runAnalysis, tickProgress]);

  // Aviso de alta demanda: 3s depois de chegar a 99%.
  useEffect(() => {
    if (percentage >= 99 && percentage < 100 && !showError) {
      demandTimerRef.current = setTimeout(() => setShowDemandNotice(true), 3000);
    } else {
      if (demandTimerRef.current) clearTimeout(demandTimerRef.current);
      setShowDemandNotice(false);
    }
    return () => { if (demandTimerRef.current) clearTimeout(demandTimerRef.current); };
  }, [percentage, showError]);

  // Countdown do aviso: 60 → 0, pausa 3s, recomeça.
  useEffect(() => {
    if (!showDemandNotice) {
      if (countdownRef.current) clearTimeout(countdownRef.current);
      setCountdown(60);
      setCountdownPaused(false);
      return;
    }
    const tick = (current: number) => {
      if (current <= 1) {
        setCountdownPaused(true);
        setCountdown(0);
        countdownRef.current = setTimeout(() => {
          setCountdown(60);
          setCountdownPaused(false);
          countdownRef.current = setTimeout(() => tick(60), 1000);
        }, 3000);
        return;
      }
      const next = current - 1;
      setCountdown(next);
      countdownRef.current = setTimeout(() => tick(next), 1000);
    };
    countdownRef.current = setTimeout(() => tick(60), 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [showDemandNotice]);

  return { percentage, showDemandNotice, countdown, countdownPaused, showError, retry, result };
}
