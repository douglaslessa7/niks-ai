import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Configura como as notificações aparecem quando o app está aberto
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Pede permissão de notificação ao usuário e retorna o Expo Push Token.
 * Retorna null se o usuário recusar.
 */
export async function requestPushPermission(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
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