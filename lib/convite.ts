// ─────────────────────────────────────────────────────────────────────────────
// Convite de grupo (Parte B, Fase 3): a mensagem leva o link da App Store e o código. Quem já
// tem o app entra por "Entrar com código", em Seus grupos. Links antigos seguem funcionando.
// Canais da folha (80u) e do menu "Convidar amigas" (80b): WhatsApp, Instagram (folha
// de compartilhar do sistema — o Instagram não aceita texto por link) e Copiar link.
// ─────────────────────────────────────────────────────────────────────────────
import { Linking, Share } from 'react-native';
import { conviteDoGrupo } from './gruposServidor';
import { trackFora } from './mixpanel/MixpanelProvider';

export type Canal = 'whatsapp' | 'instagram' | 'copiar';
const APP_STORE = 'https://apps.apple.com/app/id6760590018';

export function mensagemConvite(nome: string, codigo: string) {
  return `Entra no meu grupo "${nome}" no NIKS para a gente fazer skincare juntas! Baixe aqui: ${APP_STORE}\nSeu código: ${codigo}`;
}

// expo-clipboard é nativo: até o app ser recompilado com ele, cai na folha do sistema.
async function copiar(texto: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard');
    await Clipboard.setStringAsync(texto);
    return true;
  } catch {
    return false;
  }
}

/** Gera (ou reaproveita) o convite dela e manda pelo canal. Devolve se copiou de fato. */
export async function enviarConvite(canal: Canal, grupoId: string, nomeGrupo: string): Promise<{ copiado: boolean }> {
  const r = await conviteDoGrupo(grupoId);
  if (!('token' in r)) throw new Error(r.motivo);
  const msg = mensagemConvite(nomeGrupo, r.codigo);
  trackFora('convite_enviado', { canal });
  if (canal === 'whatsapp') {
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    if (await Linking.canOpenURL(url).catch(() => false)) { await Linking.openURL(url); return { copiado: false }; }
    await Share.share({ message: msg });
    return { copiado: false };
  }
  if (canal === 'copiar' && (await copiar(msg))) return { copiado: true };
  await Share.share({ message: msg });
  return { copiado: false };
}
