// Saída das boas-vindas pós-pagamento ("Entrar no app" da bv-nivel e, no pós-compra v2, o botão
// da bv-sequencia). Tirado da bv-nivel sem mudar nada:
//   · ex-convidada (já tem conta) → home e, logo depois, o scan novo (a rotina sai dele); os
//     produtos de casa do pós-compra v2 ficam ligados à conta dela (lib/filaProdutosCasa.ts);
//   · já logada (fez o onboarding pela conta do "Entrar", 1.64) → sem cadastro: a compra, o
//     perfil, o scan e a rotina vão para a conta da sessão → tela de espera;
//   · sem conta → cadastro.
import type { useRouter } from 'expo-router';
import { useAcesso } from '../../lib/acesso';
import { supabase } from '../../lib/supabase';
import { concluirComContaLogada } from '../../lib/onboardingObrigatorio';
import { ligarFilaAConta } from '../../lib/filaProdutosCasa';

export async function sairDasBoasVindas(
  router: ReturnType<typeof useRouter>,
  startFaceScan: (origem: string) => void,
): Promise<void> {
  if (useAcesso.getState().boasVindasEx) {
    useAcesso.setState({ boasVindasEx: false });
    // Pós-compra v2: ela não passa pelo cadastro nem pela tela de espera. Os produtos que
    // escaneou (fila no aparelho, lib/filaProdutosCasa.ts) ficam ligados à conta dela e vão
    // quando a rotina base NOVA existir — a do scan abaixo (lib/generateProtocol.ts tenta o
    // envio assim que a grava), não uma antiga da conta.
    const { data: { session: sessaoEx } } = await supabase.auth.getSession();
    if (sessaoEx?.user) await ligarFilaAConta(sessaoEx.user.id, { esperarRotinaNova: true });
    router.replace('/(app)/home' as any);
    setTimeout(() => startFaceScan('boas_vindas'), 400);
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await concluirComContaLogada(session.user.id);
    router.replace('/(onboarding)/loading-rotina' as any);
    return;
  }
  router.replace('/(onboarding)/signup');
}
