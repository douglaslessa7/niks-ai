import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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
 * Retorna null se o usuário recusar ou se estiver no simulador.
 */
export async function requestPushPermission(): Promise<string | null> {
  // Simulador iOS não tem token real — retorna null sem erro
  if (Platform.OS === 'ios' && __DEV__) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // No simulador, o token não é válido para push real, mas retornamos um placeholder
    // para o fluxo funcionar em dev
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch {
      return 'simulator-token';
    }
  }

  // Dispositivo real
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
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