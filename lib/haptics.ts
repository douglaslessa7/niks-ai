// ─────────────────────────────────────────────────────────────────────────────
// Haptics — o retorno tátil (a "vibraçãozinha") de cada toque.
//
// REGRA DO PROJETO: todo elemento clicável dá retorno tátil. Ao criar um botão
// novo, escolha um dos 6 abaixo — nunca chame `expo-haptics` direto na tela.
// (Antes deste módulo o padrão estava copiado inline em 34 lugares, só com
// `Light`, e sem guarda de plataforma nem tratamento de erro.)
//
// A API é por SIGNIFICADO, não por intensidade: `action()` continua sendo o CTA
// principal mesmo se um dia decidirmos que ele deve ser Heavy em vez de Medium.
// Assim a escala inteira do app se ajusta num arquivo só.
//
// | Chamada      | Sensação      | Usar em                                        |
// |--------------|---------------|------------------------------------------------|
// | `tap()`      | leve          | voltar, card, link, expandir/colapsar, navbar   |
// | `action()`   | média         | CTA principal: Continuar, Escanear, Enviar, obturador |
// | `select()`   | seca, curta   | escolher entre opções: chip, aba, segmented, picker |
// | `success()`  | dois pulsos ↑ | algo concluído: rotina finalizada, foto salva   |
// | `warning()`  | dois pulsos   | ação destrutiva/atenção: apagar conta, sair     |
// | `error()`    | três pulsos   | falha: erro de rede, login recusado             |
//
// ⚠️ NÃO colocar haptic em: fechar teclado, backdrop de modal, scroll, ou
// qualquer coisa que o usuário não percebe como "apertei um botão". Haptic em
// excesso vira ruído e o usuário desliga a vibração do aparelho inteiro.
// ─────────────────────────────────────────────────────────────────────────────
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Haptics só existe em aparelho. No web o módulo rejeita; num simulador ele
// simplesmente não faz nada (por isso testar de verdade exige iPhone físico).
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Dispara e esquece. Sempre engolimos o erro de propósito: vibração é enfeite —
 * se o motor háptico estiver ocupado, indisponível ou desligado nos Ajustes, o
 * BOTÃO PRECISA FUNCIONAR MESMO ASSIM. Sem o `.catch` isso viraria "possible
 * unhandled promise rejection" no console a cada toque.
 */
function fire(run: () => Promise<void>): void {
  if (!SUPPORTED) return;
  run().catch(() => {});
}

export const haptics = {
  /** Leve. Toque comum: voltar, card, link, expandir, aba da navbar. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Média. CTA principal da tela: Continuar, Escanear, Enviar, obturador. */
  action: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Seca. Escolher entre opções: chip, aba interna, segmented, wheel picker. */
  select: () => fire(() => Haptics.selectionAsync()),

  /** Conclusão: rotina finalizada, foto salva, análise pronta. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** Atenção / destrutivo: apagar conta, sair da conta. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),

  /** Falha: erro de rede, login recusado, análise que não deu certo. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
