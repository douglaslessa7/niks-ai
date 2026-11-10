import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { startOnboardingAttempt } from '../lib/onboardingAttempt';
import { comTetoRc, confirmPremium, ensureAnonymousRevenueCat } from '../lib/subscriptionGate';
import { loginRevenueCat } from '../lib/revenuecat';
import { PULAR_PAYWALL } from '../lib/devPaywall';
import {
  apagarCompraPendente, apagarFotosDeCompra, compraPendenteVencida, lerCompraPendente,
} from '../lib/compraPendente';
import { adiarCompraPendente, compraDestaConta, destinoDaCompra, retomarCompraPendente, tentarEmSegundoPlano } from '../lib/concluirCompra';
import { trackFora } from '../lib/mixpanel/MixpanelProvider';

// Ponto de entrada — SÓ decide o destino da abertura, sem UI própria. A splash de
// abertura (tela 0 do design "NIKS Onboarding - fluxo completo": logo #FF5EA8 no
// centro, `components/SplashOverlay.tsx`) fica por cima enquanto isso:
//   • com sessão → `/(app)/home` (o guard de assinatura/nome do `(app)/_layout` decide o resto);
//   • sem sessão → `/(onboarding)/abertura` — a abertura com vídeo ("NF 1" do novo
//     fluxo, 03/nov/2026), que leva ao nome. O "Olá" e o "Seus dados" saíram do fluxo.
//   • COMPRA PENDENTE (06/nov/2026, `lib/compraPendente.ts`): ela comprou e o app fechou
//     antes de a conta ficar pronta. Com sessão (já criou a conta) → a tela de espera
//     termina de salvar. Sem sessão → confere o premium (RevenueCat anônimo, que sobrevive
//     ao fechar o app): confirmado → retoma a análise e vai ao cadastro; não confirmado →
//     onboarding novo (o registro espera até 24 h — falha momentânea não joga fora a foto
//     de quem pagou — e depois é apagado). Sem registro, alguma foto de compra que tenha
//     sobrado no cache é apagada. Com 3 falhas (ou se ela já entrou no app), não volta à
//     tela de espera: vai para a home e tenta de novo em segundo plano (`lib/concluirCompra.ts`).
//
// Quem avisa a splash que o destino está pronto é o próprio destino:
// `(onboarding)/_layout` (abertura), `(app)/_layout` (home/captura de nome) ou `paywall-soft`.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const decidir = async (session: Session | null) => {
      const reg = await lerCompraPendente();
      if (!reg) apagarFotosDeCompra();

      if (session) {
        if (reg && await compraDestaConta(reg, session.user)) {
          const destino = destinoDaCompra(reg);
          if (destino === 'vencida') {
            trackFora('rotina_desistiu', { falhas: reg.falhas ?? 0 });
            await apagarCompraPendente();
          } else {
            await retomarCompraPendente(reg);
            if (destino === 'espera') {
              // Antes de gerar a rotina. Sem assinatura, a home manda ao paywall; restaurar
              // ali volta para esta tela, porque o registro da compra continua no aparelho.
              await comTetoRc(loginRevenueCat(session.user.id));
              const pago = PULAR_PAYWALL || await confirmPremium({ label: 'retomada:com_sessao' });
              router.replace(pago ? '/(onboarding)/loading-rotina' as any : '/(app)/home');
              return;
            }
            if (!reg.adiada) await adiarCompraPendente(reg.falhas ?? 0);
            router.replace('/(app)/home');
            tentarEmSegundoPlano();
            return;
          }
        } else if (reg) {
          await apagarCompraPendente(); // de outra conta
        }
        // Usuária logada — delega a verificação de assinatura para (app)/_layout.tsx
        // (evita race condition: loginRevenueCat pode não ter completado ainda).
        router.replace('/(app)/home');
        return;
      }

      if (reg?.userId) {
        // Já é de uma conta: espera ela entrar nessa conta. O cadastro criaria outra.
        if (compraPendenteVencida(reg)) await apagarCompraPendente();
      } else if (reg) {
        await ensureAnonymousRevenueCat('retomada');
        const pago = PULAR_PAYWALL || await confirmPremium({ label: 'retomada:compra_pendente' });
        if (pago) {
          await retomarCompraPendente(reg);
          router.replace('/(onboarding)/signup');
          return;
        }
        if (compraPendenteVencida(reg)) await apagarCompraPendente();
      }
      // Sem sessão: nova tentativa de onboarding (`lib/onboardingAttempt.ts`). Somada
      // ANTES de navegar, para a abertura já mandar o passo 1 com o número certo.
      startOnboardingAttempt().finally(() => router.replace('/(onboarding)/abertura'));
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') return;
      void decidir(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
}
