// Atalho de desenvolvimento do paywall: FONTE ÚNICA dos desvios que deixam o Metro
// entrar no app sem assinatura.
//
// `true` só em build de desenvolvimento (__DEV__) e sem a chave abaixo. Em Release,
// TestFlight e loja é sempre `false`, com ou sem a chave.
//
// Para testar o paywall e as travas de verdade no Metro, ponha no `.env`:
//   EXPO_PUBLIC_PAYWALL_REAL=1
// e reinicie o Metro limpando o cache (`npx expo start --dev-client --clear`), porque o
// valor é embutido no bundle. O acesso precisa ser `process.env.EXPO_PUBLIC_...` escrito
// por extenso, senão o Expo não substitui.
export const PULAR_PAYWALL = __DEV__ && process.env.EXPO_PUBLIC_PAYWALL_REAL !== '1';
