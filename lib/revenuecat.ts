import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { mixpanel } from './mixpanel/mixpanelClient';

const IOS_KEY = 'appl_KEtOtPCtwkUlypWaXDQWmWsRfTW';

export const PRODUCT_MENSAL = 'br.com.niksai.app.mensal.notrial';
export const PRODUCT_ANUAL = 'br.com.niksai.app.anual.notrial';
export const ENTITLEMENT_ID = 'premium';

export function initRevenueCat() {
  if (Platform.OS === 'ios') {
    Purchases.configure({ apiKey: IOS_KEY });
  }
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
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
  return {
    mensal: packages.find((p) => p.product.identifier === PRODUCT_MENSAL) ?? null,
    anual: packages.find((p) => p.product.identifier === PRODUCT_ANUAL) ?? null,
  };
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
