import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { getUserId } from '../lib/currentUser';
import { precisaPrimeiroFluxo, marcarPrimeiroFluxoFeito } from '../lib/colecaoFlow';
import { getUserId as lerUserId } from '../lib/currentUser';
import { useFaceScan } from './useFaceScan';
import { useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import PerguntaSimNao from '../components/colecao/PerguntaSimNao';

// ─────────────────────────────────────────────────────────────────────────────
// PRIMEIRO FLUXO DA MINHA COLEÇÃO — o portão, montado na tela de ROTINA.
//
// Gatilho (spec): o que vier primeiro entre a PRIMEIRA ABERTURA DA ABA ROTINA e o
// PRIMEIRO TOQUE NO "ESCANEAR" da home. O segundo caso não abre a câmera: o
// `useFaceScan` manda a usuária para a Rotina, e o fluxo começa por aqui — então
// existe UM só lugar que faz a pergunta, não dois.
//
// Respostas:
//   • Sim → câmera em lote (`colecao-camera`) → scan de rosto
//   • Não → scan de rosto direto (Coleção fica vazia, rotina 100% do catálogo)
//
// ⚠️ A pergunta só aparece DEPOIS de o servidor confirmar que esta conta nunca
// passou pelo fluxo (`users.colecao_onboarding_at`). Nada de piscar pop-up para
// quem já respondeu — mesma ordem obrigatória do tutorial da home.
// ─────────────────────────────────────────────────────────────────────────────
export function useColecaoOnboarding() {
  const router = useRouter();
  const { startFaceScanSemGate } = useFaceScan();
  const { track } = useMixpanel();
  const [visible, setVisible] = useState(false);
  // Uma pergunta por montagem: sem isto, voltar da câmera para a Rotina reabriria
  // o pop-up (o marcador no servidor só é gravado no FIM do fluxo, de propósito).
  const perguntouRef = useRef(false);

  const checar = useCallback(async () => {
    if (perguntouRef.current) return;
    try {
      const userId = await getUserId();
      if (!userId) return;
      if (!(await precisaPrimeiroFluxo(userId))) return;
      perguntouRef.current = true;
      setVisible(true);
      track('colecao_primeiro_fluxo_perguntado');
    } catch (e) {
      console.warn('[useColecaoOnboarding] checagem falhou:', e);
    }
  }, [track]);

  useFocusEffect(useCallback(() => { checar(); }, [checar]));

  const responder = (tem: boolean) => {
    setVisible(false);
    track('colecao_primeiro_fluxo_respondido', { tem_produtos: tem });
    // ⚠️ O marcador de "esta conta já passou pelo fluxo" é gravado AQUI, na
    // resposta — não no fim do fluxo. Quem respondeu já foi perguntada; repetir a
    // pergunta a cada abertura da Rotina seria implicância, e ela pode adicionar
    // produtos quando quiser pela aba Minha Coleção. Fire-and-forget: falha de
    // rede não pode travar a navegação para a câmera.
    void lerUserId().then((userId) => { if (userId) void marcarPrimeiroFluxoFeito(userId); });
    if (tem) router.push('/(scan)/colecao-camera' as any);
    else startFaceScanSemGate();
  };

  const gate = (
    <PerguntaSimNao
      visible={visible}
      titulo="Você tem produtos de skincare em casa?"
      subtitulo="Me mostra que eu analiso cada um. O que for bom pra sua pele entra na sua rotina, e eu te aviso o que é melhor evitar."
      labelSim="Sim, tenho"
      labelNao="Não tenho nenhum"
      onSim={() => responder(true)}
      onNao={() => responder(false)}
    />
  );

  return { gate };
}
