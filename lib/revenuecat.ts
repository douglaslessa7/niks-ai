import Purchases, { LOG_LEVEL, PACKAGE_TYPE } from 'react-native-purchases';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { mixpanel } from './mixpanel/mixpanelClient';

// O `.env` do repo tem valores `placeholder`, então a chave só é lida do
// ambiente quando é uma chave de verdade — caso contrário cai no literal, que
// é o que vinha sendo usado em produção no iOS.
const fromEnv = (value: string | undefined, prefix: string) =>
  value && value !== 'placeholder' && value.startsWith(prefix) ? value : '';

const IOS_KEY =
  fromEnv(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY, 'appl_') ||
  'appl_KEtOtPCtwkUlypWaXDQWmWsRfTW';
const ANDROID_KEY = fromEnv(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY, 'goog_');

export const PRODUCT_MENSAL = 'br.com.niksai.app.mensal.notrial';
export const PRODUCT_ANUAL = 'br.com.niksai.app.anual.notrial';
export const ENTITLEMENT_ID = 'premium';

export function initRevenueCat() {
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : Platform.OS === 'android' ? ANDROID_KEY : '';
  if (!apiKey) {
    console.error(
      `[revenuecat] Chave de API ausente para ${Platform.OS}. ` +
      `Defina EXPO_PUBLIC_REVENUECAT_${Platform.OS === 'android' ? 'ANDROID' : 'IOS'}_KEY. ` +
      `Compras e verificação de assinatura NÃO vão funcionar.`
    );
    return;
  }
  Purchases.configure({ apiKey });
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
}

/**
 * Compara um product identifier do RevenueCat com o ID configurado no app.
 *
 * No iOS o identifier é exatamente o product ID da App Store.
 * No Google Play uma assinatura tem `subscription ID` + `base plan ID`, e o
 * RevenueCat devolve o identifier como `sub_id:base_plan_id`. Comparar com
 * `===` faria todo produto Android falhar em silêncio, então normalizamos
 * removendo o sufixo de base plan dos dois lados antes de comparar.
 */
export function matchesProduct(identifier: string, target: string): boolean {
  const base = (id: string) => id.split(':')[0];
  return identifier === target || base(identifier) === base(target);
}

export async function loginRevenueCat(userId: string) {
  await Purchases.logIn(userId);
}

export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function getPackages(): Promise<{
  mensal: PurchasesPackage | null;
  anual: PurchasesPackage | null;
}> {
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];

  // Primeiro tenta pelo product ID (caminho exato quando os IDs da loja batem
  // com os configurados aqui). Se a loja usa IDs diferentes — comum no Google
  // Play, onde a assinatura pode ter sido criada com outro nome — cai para o
  // packageType, que o RevenueCat normaliza por duração em ambas as lojas.
  const byProduct = (target: string) =>
    packages.find((p) => matchesProduct(p.product.identifier, target)) ?? null;
  const byType = (type: PACKAGE_TYPE) => packages.find((p) => p.packageType === type) ?? null;

  const mensal = byProduct(PRODUCT_MENSAL) ?? byType(PACKAGE_TYPE.MONTHLY);
  const anual = byProduct(PRODUCT_ANUAL) ?? byType(PACKAGE_TYPE.ANNUAL);

  if (!mensal || !anual) {
    console.error(
      `[revenuecat] Pacote não encontrado (mensal=${!!mensal}, anual=${!!anual}) em ${Platform.OS}. ` +
      `Offering atual: ${offerings.current?.identifier ?? '(nenhuma)'}. ` +
      `Produtos disponíveis: ${packages.map((p) => `${p.product.identifier}[${p.packageType}]`).join(', ') || '(nenhum)'}`
    );
  }

  return { mensal, anual };
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const plan = pkg.product.identifier.includes('anual') ? 'anual' : 'mensal';
  mixpanel.track('purchase_initiated', { plan });
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    mixpanel.track('purchase_completed', { plan });
    return customerInfo;
  } catch (err: any) {
    mixpanel.track('purchase_failed', { plan, error: err?.message ?? 'unknown' });
    throw err;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const customerInfo = await Purchases.restorePurchases();
  mixpanel.track('purchase_restored');
  return customerInfo;
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return await Purchases.getCustomerInfo();
}

export function isPremium(customerInfo: CustomerInfo): boolean {
  return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}

export function isSubscribed(customerInfo: CustomerInfo): boolean {
  return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}
