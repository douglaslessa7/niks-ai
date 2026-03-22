import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

export function initRevenueCat() {
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY! });
}

export async function loginRevenueCat(userId: string) {
  await Purchases.logIn(userId);
}

export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases() {
  return await Purchases.restorePurchases();
}

export async function getCustomerInfo() {
  return await Purchases.getCustomerInfo();
}

export function isPremium(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active['premium'] !== undefined;
}
