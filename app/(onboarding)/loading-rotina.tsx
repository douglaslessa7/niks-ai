import { useEffect, useRef, useState } from 'react';
import { Text, BackHandler, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAppStore } from '../../store/onboarding';
import AnelCarregando, { linhaDoProgresso } from '../../components/onboarding/AnelCarregando';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObPillButton, ObScreen, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { routineLoadingLines } from '../../components/onboarding/answers';
import { t } from '../../lib/i18n';
import {
  ESPERA_SEGUNDO_PLANO_MS, FALHAS_PARA_ENTRAR, abandonarExecucao, adiarCompraPendente, concluirCompraPendente, tentarEmSegundoPlano,
} from '../../lib/concluirCompra';
import { esperarRotina } from '../../lib/esperaDaRotina';

// TELA DE ESPERA depois da compra (06/nov/2026) — "Criando uma rotina só sua, <nome>". O
// visual é o da antiga tela 23 do fluxo completo (fora do fluxo desde out/2026): anel R 122
// (trilho branco 13 pt + progresso em degradê #FF5EA8 → #FF8CC0, 11 pt) em volta de um disco
// branco Ø214 com a porcentagem; embaixo do título, uma frase que troca a cada terço
// (`routineLoadingLines`) e 4 tracinhos pulsando.
//
// Chega aqui: o cadastro (conta nova), o paywall (já logada, refazendo o onboarding) ou a
// retomada ao abrir o app (`app/index.tsx`, com sessão e compra pendente). Faz, em ordem:
//   1. aguarda a análise completa (`analyze-skin`, disparada na compra — `lib/onboardingPrefetch.ts`);
//   2. grava na conta: perfil (`users`), foto no bucket `scans` e `skin_scans` (`saveToSupabase`);
//   3. aguarda/gera a rotina e grava em `protocolos` + `recomendar-produtos` (`saveOnboardingProtocol`);
//   4. apaga a foto e o registro do aparelho (`lib/compraPendente.ts`) e abre a home.
// A % anda no ritmo do design (0 → 100 em ~6,5 s) mas SEGURA em 95% até terminar. Falhou a
// análise (depois das tentativas) → "Não conseguimos terminar sua rotina agora." + "Tentar de
// novo"; o registro continua no aparelho, então reabrir o app também retoma. A rotina que
// falhar de vez não segura a tela (a aba Rotina gera de novo, como sempre). Sem voltar.
// Depois de 3 falhas aparece "Entrar no app" e o resto continua em segundo plano
// (`lib/concluirCompra.ts`, 09/nov/2026).
// ⚠️ NUNCA PARADA (18/nov/2026, caso real no TestFlight 1.63 (1)): antes ela só saía dos 95%
// quando tudo terminava, e nenhuma etapa tinha limite — uma requisição pendurada prendia a
// usuária para sempre. Agora cada tentativa tem teto de 75 s (`lib/esperaDaRotina.ts`; as
// chamadas de IA também têm limite próprio): estourou ou falhou → tenta de novo sozinha; na
// 2ª, segue para o app e a rotina termina por trás (a Rotina mostra o que já estiver pronto).
//
// ⚠️ A linha "43.754 mulheres com pele oleosa já seguem uma rotina NIKS" do design
// ficou de fora: prova social não vai ao ar com número de exemplo.
// O visual (anel, porcentagem, título, frase, tracinhos): components/onboarding/AnelCarregando.
const RUN_MS = 6500;
const HOLD_AT = 0.95;

export default function LoadingRotina() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { buttonBottom } = useObFrame();
  const onboarding = useAppStore((s) => s.onboarding);
  const skinType = useAppStore((s) => s.scanResult?.skin_type_detected);
  const lines = useRef(routineLoadingLines(onboarding, skinType)).current;
  const [p, setP] = useState(0);
  const [falhou, setFalhou] = useState(false);
  const [falhas, setFalhas] = useState(0);
  const ready = useRef(false);
  const start = useRef(Date.now());

  useOnMount(() => track('onboarding_step_viewed', obStep(OB_STEPS.loadingRotina, 'Loading Rotina')));

  const processar = async () => {
    setFalhou(false);
    const r = await esperarRotina({
      tentar: concluirCompraPendente,
      abandonar: abandonarExecucao,
      aoTentarDeNovo: (n, motivo) => track('rotina_tentou_de_novo', { tentativa: n, motivo }),
    });
    if (r.fim === 'ok') { ready.current = true; return; }
    if (r.fim === 'sem_sessao') { router.replace('/'); return; }
    // Não deu nas tentativas: segue para o app; o resto termina em segundo plano.
    track('rotina_seguiu_para_o_app', { tentativas: r.tentativas, motivos: r.motivos.join(',') });
    await adiarCompraPendente(r.tentativas);
    tentarEmSegundoPlano(ESPERA_SEGUNDO_PLANO_MS);
    router.replace('/(app)/home');
  };

  useEffect(() => {
    void processar();
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);

    let id: number;
    let done = false;
    const loop = () => {
      const t = (Date.now() - start.current) / RUN_MS;
      const pe = 1 - Math.pow(1 - Math.min(1, t), 1.6);
      const next = ready.current ? pe : Math.min(HOLD_AT, pe);
      setP(next);
      if (next >= 1 && !done) {
        done = true;
        track('onboarding_step_completed', obStep(OB_STEPS.loadingRotina, 'Loading Rotina'));
        setTimeout(() => router.replace('/(app)/home'), 400);
        return;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(id); back.remove(); };
  }, []);

  const tentarDeNovo = () => {
    haptics.action();
    void processar();
  };

  const entrarNoApp = async () => {
    haptics.action();
    await adiarCompraPendente(falhas);
    tentarEmSegundoPlano(ESPERA_SEGUNDO_PLANO_MS);
    router.replace('/(app)/home');
  };

  const linha = linhaDoProgresso(lines, p);

  return (
    <ObScreen variant="blush">
      <Stack.Screen options={{ gestureEnabled: false }} />
      <AnelCarregando
        p={p}
        titulo={falhou ? t('Não conseguimos terminar sua rotina agora.') : name ? t('Criando uma rotina só sua, {{name}}', { name }) : t('Criando uma rotina só sua')}
        linha={linha.texto}
        linhaOpacity={linha.opacity}
        carregando={!falhou}
      />

      {falhou && falhas < FALHAS_PARA_ENTRAR && <ObPillButton label={t('Tentar de novo')} width={200} bottom={buttonBottom} onPress={tentarDeNovo} />}
      {falhou && falhas >= FALHAS_PARA_ENTRAR && (
        <>
          <TouchableOpacity
            onPress={tentarDeNovo}
            accessibilityRole="button"
            style={{ position: 'absolute', alignSelf: 'center', bottom: buttonBottom + 66, paddingVertical: 10, paddingHorizontal: 20 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: OB.ink }}>{t('Tentar de novo')}</Text>
          </TouchableOpacity>
          <ObPillButton label={t('Entrar no app')} width={220} bottom={buttonBottom} onPress={() => { void entrarNoApp(); }} />
        </>
      )}
    </ObScreen>
  );
}
