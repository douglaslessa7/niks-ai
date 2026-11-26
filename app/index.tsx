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
import { compraRecenteNoServidor } from '../lib/assinaturaServidor';
import { lerCompraNestaSessao, marcarCompraNestaSessao } from '../lib/sinalCompra';
import { transferirNoCadastro } from '../lib/regraCompra';

// Retomada da compra (26/nov/2026, junto com a correção 2b): o aparelho pode não confirmar a
// compra (Superwall/RevenueCat), mesmo paga — o paywall pode ter liberado pela confirmação do
// servidor. Então, além do portão de sempre:
//   • sem conta: vale o sinal do paywall (`lib/sinalCompra.ts`, gravado SÓ depois de uma compra
//     confirmada, 24 h) ou o servidor (compra deste aparelho nos últimos 15 min);
//   • com conta: o servidor liga a compra deste aparelho à conta e diz se ela é assinante.
async function compraConfirmadaNaRetomada(label: string, comSessao: boolean): Promise<boolean> {
  if (PULAR_PAYWALL) return true;
  if (await confirmPremium({ label })) return true;
  const sinal = await lerCompraNestaSessao();
  if (!comSessao && sinal) {
    trackFora('compra_confirmada', { tipo: 'retomada', fonte: 'sinal', com_sessao: false });
    return true;
  }
  const srv = await compraRecenteNoServidor(comSessao ? transferirNoCadastro(sinal) : undefined);
  const ok = comSessao ? srv?.assinante === true : srv?.confirmado === true;
  // Confirmada pelo servidor = compra feita NESTE aparelho: vale como o sinal do paywall (o
  // pós-compra e o cadastro exigem o sinal). Só "Superwall ACTIVE" não marca (qualquer
  // assinatura do Apple ID passaria).
  if (ok && !sinal) await marcarCompraNestaSessao('compra');
  trackFora(ok ? 'compra_confirmada' : 'compra_sem_confirmacao', {
    tipo: 'retomada', fonte: ok ? 'servidor' : null, com_sessao: comSessao, servidor_compra: srv?.confirmado ?? null,
  });
  return ok;
}

// Ponto de entrada — SÓ decide o destino da abertura, sem UI própria. A splash de
// abertura (tela 0 do design "NIKS Onboarding - fluxo completo": logo #FF5EA8 no
// centro, `components/SplashOverlay.tsx`) fica por cima enquanto isso:
//   • com sessão → `/(app)/home` (o guard de assinatura/nome do `(app)/_layout` decide o resto);
//   • sem sessão → `/(onboarding)/abertura` — a abertura com vídeo ("NF 1" do novo
//     fluxo, 03/nov/2026), que leva ao nome. O "Olá" e o "Seus dados" saíram do fluxo.
//   • COMPRA PENDENTE (06/nov/2026, `lib/compraPendente.ts`): ela comprou e o app fechou
//     antes de a conta ficar pronta. Com sessão (já criou a conta) → a tela de espera
//     termina de salvar. Sem sessão → confere o premium (RevenueCat anônimo, que sobrevive
//     ao fechar o app): confirmado → retoma a análise e volta ao início do pós-compra v2
//     (pc-boas-vindas; desde 26/nov/2026 — antes ia direto ao cadastro); não confirmado →
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
              const pago = await compraConfirmadaNaRetomada('retomada:com_sessao', true);
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
        const pago = await compraConfirmadaNaRetomada('retomada:compra_pendente', false);
        if (pago) {
          await retomarCompraPendente(reg);
          // Pós-compra v2 desde o começo (antes ia direto ao cadastro e pulava o fluxo): os pontos
          // e a etapa ficam só na memória. As fotos de uma câmera anterior seguem na fila do
          // aparelho até ela fotografar de novo (troca) ou tocar em "Não tenho produtos agora".
          trackFora('pos_compra_retomado', {});
          router.replace('/(onboarding)/pc-boas-vindas' as any);
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
