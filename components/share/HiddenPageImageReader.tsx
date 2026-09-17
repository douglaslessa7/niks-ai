import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { PAGE_IMAGE_MESSAGE, PAGE_IMAGE_SCRIPT } from '../../lib/pageImageScript';

export type PageImageResult =
  | { ok: true; imageUrl: string; title: string | null; ms: number }
  | { ok: false; reason: 'timeout' | 'verificacao' | 'sem_imagem' | 'erro_carregamento'; ms: number };

type Props = {
  url: string;
  onResult: (result: PageImageResult) => void;
  timeoutMs?: number;
};

// Mesmo user agent do Safari do iPhone: o WKWebView padrão não tem o sufixo
// "Version/… Safari/…", e o teste que passou pela verificação do ML foi no Safari.
const SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const RETRY_EVERY_MS = 1500;
// Tempo que aceitamos ficar NUMA tela de verificação antes de desistir. O Mercado
// Livre passa sozinho em ~2 s e vira o produto; a Shopee manda para
// /verify/traffic/error e fica lá — sem este corte a usuária esperava os 25 s
// inteiros para receber "não conseguimos pegar a foto".
const VERIFICATION_GRACE_MS = 6000;

// Telas de bloqueio conhecidas. ⚠️ `/verify/traffic` (Shopee) estava FALTANDO e por
// isso o corte de 6 s não disparava justamente no caso que o motivou — os testes
// terminavam em 25 s. Ao adicionar um padrão novo, confira no log `[share-webview]
// navegou …` para qual URL a loja manda.
const isVerificationUrl = (url: string) =>
  /\/(gz\/)?account-verification|\/captcha|\/verify\/traffic|\/cdn-cgi\/challenge-platform/i.test(url);

/**
 * "Compartilhar com o NIKS" — último recurso para links do Mercado Livre vindos do
 * app do ML (texto com link, sem metatags), quando o backend recebe a tela
 * anti-robô. Carrega a página num WebView INVISÍVEL (a rede é a do celular, o motor
 * é o do Safari) e lê a foto com o mesmo script do preprocessor da extensão.
 *
 * Responde UMA vez: foto encontrada, ou — só no fim do timeout (padrão 25 s — o Safari levou ~30 s na 1ª carga do ML) —
 * `verificacao` (ficou na tela anti-robô — encerra em VERIFICATION_GRACE_MS, sem
 * esperar o timeout inteiro), `sem_imagem` (página carregou sem foto) ou `timeout`
 * (nem carregou).
 *
 * ⚠️ Timeout de 12 s, não 25: as páginas que FUNCIONAM entregam a foto em ~2 s (ML
 * carregou em 1,8 s), e a Shopee às vezes bloqueia SEM redirecionar — fica na URL do
 * produto servindo página vazia, sem sinal para o corte por URL de verificação. Nesse
 * caso o timeout é o único freio, e 25 s era espera demais para um caminho que falha. A verificação NÃO encerra na hora: no Safari
 * ela passa sozinha e redireciona para o produto.
 *
 * Quem usa deve desmontar o componente depois do resultado.
 */
export function HiddenPageImageReader({ url, onResult, timeoutMs = 12_000 }: Props) {
  const webviewRef = useRef<WebView>(null);
  const doneRef = useRef(false);
  const startRef = useRef(Date.now());
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Entrou/saiu de uma tela de verificação: arma ou desarma o corte de 6 s.
  const trackVerification = (href: string) => {
    lastHrefRef.current = href;
    if (isVerificationUrl(href)) {
      if (!verificationTimerRef.current) {
        verificationTimerRef.current = setTimeout(() => {
          if (isVerificationUrl(lastHrefRef.current)) {
            finish({ ok: false, reason: 'verificacao', ms: Date.now() - startRef.current });
          }
        }, VERIFICATION_GRACE_MS);
      }
    } else if (verificationTimerRef.current) {
      clearTimeout(verificationTimerRef.current);
      verificationTimerRef.current = null;
    }
  };

  // Estado visto até agora — decide o motivo quando o tempo acaba.
  const lastHrefRef = useRef(url);
  const sawPageRef = useRef(false);
  const verificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const finish = (result: PageImageResult) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (retryRef.current) clearInterval(retryRef.current);
    if (verificationTimerRef.current) clearTimeout(verificationTimerRef.current);
    console.log(`[share-webview] ${result.ok ? `imagem ok ${result.imageUrl.slice(0, 80)}` : `falhou: ${result.reason}`} em ${result.ms}ms`);
    onResultRef.current(result);
  };

  useEffect(() => {
    startRef.current = Date.now();
    console.log(`[share-webview] carregando ${url.slice(0, 100)}`);
    const timer = setTimeout(() => {
      const reason = isVerificationUrl(lastHrefRef.current)
        ? 'verificacao'
        : sawPageRef.current ? 'sem_imagem' : 'timeout';
      finish({ ok: false, reason, ms: Date.now() - startRef.current });
    }, timeoutMs);
    return () => {
      clearTimeout(timer);
      if (retryRef.current) clearInterval(retryRef.current);
      if (verificationTimerRef.current) clearTimeout(verificationTimerRef.current);
      doneRef.current = true;
    };
  }, [url, timeoutMs]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let data: { type?: string; image?: string | null; title?: string | null; href?: string; error?: string };
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type !== PAGE_IMAGE_MESSAGE) return;
    const ms = Date.now() - startRef.current;
    if (data.href) trackVerification(data.href);
    if (data.href && isVerificationUrl(data.href)) {
      // A verificação do ML passa sozinha via JavaScript e vira o produto — por isso
      // não desiste na hora; quem encerra é o corte de VERIFICATION_GRACE_MS.
      console.log(`[share-webview] na tela de verificação (${ms}ms), aguardando…`);
      return;
    }
    sawPageRef.current = true;
    if (data.image && /^https:\/\//.test(data.image)) {
      finish({ ok: true, imageUrl: data.image, title: data.title ?? null, ms });
      return;
    }
    // Página ainda montando (JSON-LD/metas às vezes entram depois do load): tenta de
    // novo até o timeout, sem mandar resultado ainda.
    console.log(`[share-webview] sem imagem ainda (${ms}ms)${data.error ? ` erro=${data.error}` : ''}`);
  };

  const handleLoadEnd = () => {
    if (doneRef.current) return;
    console.log(`[share-webview] página carregou em ${Date.now() - startRef.current}ms`);
    webviewRef.current?.injectJavaScript(PAGE_IMAGE_SCRIPT);
    if (!retryRef.current) {
      retryRef.current = setInterval(() => {
        if (!doneRef.current) webviewRef.current?.injectJavaScript(PAGE_IMAGE_SCRIPT);
      }, RETRY_EVERY_MS);
    }
  };

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', left: 0, top: 0 }}
    >
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        userAgent={SAFARI_UA}
        javaScriptEnabled
        incognito
        // ⚠️ `about:*` na lista de propósito: fora da whitelist a biblioteca tenta
        // ABRIR a URL no sistema (`Linking.openURL`), e páginas de loja cheias de
        // iframe de anúncio (`about:srcdoc`, Shopee) enchiam o log de
        // "Unable to open URL". Quem decide o que carrega é o handler abaixo.
        originWhitelist={['https://*', 'http://*', 'about:*']}
        // Nunca sair para outro app (universal link do ML, meli://…) e nunca navegar
        // para nada que não seja http(s).
        onShouldStartLoadWithRequest={(req) => /^https?:\/\//i.test(req.url)}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        onNavigationStateChange={(nav) => {
          trackVerification(nav.url);
          console.log(`[share-webview] navegou ${nav.url.slice(0, 100)} loading=${nav.loading}`);
        }}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={() => finish({ ok: false, reason: 'erro_carregamento', ms: Date.now() - startRef.current })}
        style={{ width: 390, height: 844 }}
      />
    </View>
  );
}
