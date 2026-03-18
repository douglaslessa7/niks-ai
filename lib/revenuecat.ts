import Purchases, { LOG_LEVEL, PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';

const IOS_KEY = 'appl_KEtOtPCtwkUlypWaXDQWmWsRfTW';

export const PRODUCT_MENSAL = 'br.com.niksai.app.mensal';
export const PRODUCT_ANUAL = 'br.com.niksai.app.anual';
export const ENTITLEMENT_ID = 'premium';

export function initRevenueCat() {
  if (Platform.OS === 'ios') {
    Purchases.configure({ apiKey: IOS_KEY });
  }
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
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
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return await Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return await Purchases.getCustomerInfo();
}

export function isSubscribed(customerInfo: CustomerInfo): boolean {
  return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}
