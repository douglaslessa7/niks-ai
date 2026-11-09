import { Alert } from 'react-native';
import { supabase } from './supabase';

// Parte B, Fase 8. Cabeçalho das funções de IA que aceitam chamada sem conta: com sessão, manda
// a dela (o servidor confere a assinatura); sem sessão, a anon key do onboarding.
export async function autorizacaoIA(anonKey: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token ?? anonKey}`;
}

let ultimoAviso = 0;
/** Resposta 403 de uma função de IA: a assinatura não foi reconhecida no servidor. */
export function avisarSeSemAssinatura(status: number) {
  if (status !== 403 || Date.now() - ultimoAviso < 30_000) return;
  ultimoAviso = Date.now();
  Alert.alert('Não conseguimos confirmar sua assinatura. Feche e abra o NIKS, ou toque em Restaurar compra.');
}
