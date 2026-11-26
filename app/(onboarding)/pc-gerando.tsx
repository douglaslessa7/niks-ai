import { useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { t } from '../../lib/i18n';
import { ObScreen, useObName } from '../../components/onboarding/kit';
import AnelCarregando, { linhaDoProgresso } from '../../components/onboarding/AnelCarregando';
import { aguardarAnaliseCompleta, awaitRoutine } from '../../lib/onboardingPrefetch';

// Pós-compra v2 · passo 4 "Criando uma rotina só sua, <nome>" (lib/posCompraV2.ts).
// O visual é o da tela de espera depois do cadastro (components/onboarding/AnelCarregando), em
// fundo branco (design-handoff/pos-compra-v2/04-criando-sua-rotina.html).
//
// O que espera DE VERDADE: só o que já roda desde a compra — a análise completa e a rotina
// pré-gerada (`lib/onboardingPrefetch.ts`). Nada é gravado aqui (ela ainda não tem conta): a
// gravação e o lote dos produtos de casa são da tela de espera depois do cadastro. Por isso as
// frases NÃO falam em analisar os produtos (eles só são analisados depois do cadastro).
// A % anda no ritmo da tela de espera (0 → 100 em ~6,5 s) e segura em 95% até a rotina
// pré-gerada chegar, com TETO: passou de `TETO_MS`, segue assim mesmo (a tela de espera
// termina o que faltar). Sem foto do scan (aberta direto pelo menu de dev), não espera nada.
const RUN_MS = 6500;
const HOLD_AT = 0.95;
const TETO_MS = 25_000;

export default function PcGerando() {
  const router = useRouter();
  const name = useObName();
  const [p, setP] = useState(0);
  const pronta = useRef(false);
  const start = useRef(Date.now());
  const linhas = useRef([
    t('Preparando sua rotina…'),
    t('Separando os passos da manhã e da noite…'),
    t('Ajustando para a sua pele…'),
  ]).current;

  useEffect(() => {
    let vivo = true;
    const teto = new Promise<void>((r) => setTimeout(r, TETO_MS));
    const rotina = (async () => {
      try {
        const relatorio = await aguardarAnaliseCompleta();
        if (relatorio) await awaitRoutine();
      } catch (e) {
        console.warn('[pc-gerando] rotina pré-gerada não chegou:', e);
      }
    })();
    void Promise.race([rotina, teto]).then(() => { if (vivo) pronta.current = true; });

    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    let id: number;
    let fim = false;
    const loop = () => {
      const k = (Date.now() - start.current) / RUN_MS;
      const pe = 1 - Math.pow(1 - Math.min(1, k), 1.6);
      const next = pronta.current ? pe : Math.min(HOLD_AT, pe);
      setP(next);
      if (next >= 1 && !fim) {
        fim = true;
        setTimeout(() => { if (vivo) router.replace('/(onboarding)/pc-rotina-pronta' as any); }, 400);
        return;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => { vivo = false; cancelAnimationFrame(id); back.remove(); };
  }, []);

  const linha = linhaDoProgresso(linhas, p);

  return (
    <ObScreen variant="white">
      <Stack.Screen options={{ gestureEnabled: false }} />
      <AnelCarregando
        rotulo={false}
        p={p}
        titulo={name ? t('Criando uma rotina só sua, {{name}}', { name }) : t('Criando uma rotina só sua')}
        linha={linha.texto}
        linhaOpacity={linha.opacity}
      />
    </ObScreen>
  );
}
