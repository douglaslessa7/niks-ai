import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const ANDROID_CHANNEL_ID = 'default';

/**
 * No Android 8+ toda notificação precisa pertencer a um canal, e é o canal —
 * não o payload — que define som, vibração e se ela aparece como banner.
 * Sem isso as notificações chegam silenciosas e sem heads-up.
 * Precisa rodar antes de pedir permissão / registrar o token.
 */
export async function setupAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Lembretes NIKS',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6F61',
    sound: 'default',
  });
}

// Configura como as notificações aparecem quando o app está aberto. O push do lote
// "Montar minha rotina" (type 'rotina_lote') não vira banner com o app aberto: quem
// avisa é o próprio app (components/rotina/AvisoLote) — senão ela recebe dois avisos.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const doLote = n.request.content.data?.type === 'rotina_lote';
    return {
      shouldShowAlert: !doLote,
      shouldPlaySound: !doLote,
      shouldSetBadge: false,
      shouldShowBanner: !doLote,
      shouldShowList: true,
    };
  },
});

/**
 * Só a permissão: mostra o pop-up do sistema (se ainda não foi respondido) e diz se
 * ficou permitida. Resolve no toque em "Permitir"/"Não permitir" — sem teto de tempo,
 * ao contrário do token, que depende de rede. Se já foi recusada antes, o iOS não
 * mostra o pop-up de novo e responde `false` na hora.
 */
export async function askPushPermission(): Promise<boolean> {
  await setupAndroidNotificationChannel();
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Pede permissão de notificação ao usuário e retorna o Expo Push Token.
 * Retorna null se o usuário recusar.
 */
export async function requestPushPermission(): Promise<string | null> {
  if (!(await askPushPermission())) {
    console.log('[notifications] Permissão negada pelo usuário.');
    return null;
  }

  // Obtém o projectId do app.json / EAS
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.error('[notifications] projectId não encontrado. Verifique app.json ou eas.json.');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[notifications] Token obtido:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error('[notifications] Erro ao obter token:', error);
    return null;
  }
}

/**
 * Salva o push token do usuário na tabela `users` do Supabase.
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    console.error('[notifications] Erro ao salvar push_token:', error.message);
  }
}