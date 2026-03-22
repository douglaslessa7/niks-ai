import { useState, useEffect } from 'react';
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Unlock, Bell, Crown } from 'lucide-react-native';
import { BackButton } from '../../components/ui/BackButton';
import { getOfferings, purchasePackage, restorePurchases, isPremium } from '../../lib/revenuecat';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  restorePurchases,
  isSubscribed,
} from '../../lib/revenuecat';

type Plan = 'monthly' | 'annual';

const trialEndDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
})();

const timelineSteps = [
  {
    Icon: Unlock,
    color: '#D97706',
    title: 'Hoje',
    description: 'Desbloqueie scan de pele, análise alimentar e mais',
  },
  {
    Icon: Bell,
    color: '#B45309',
    title: 'Em 2 dias',
    description: 'Lembrete de que o teste está acabando',
  },
  {
    Icon: Crown,
    color: '#1A1A1A',
    title: 'Em 3 dias',
    description: 'Cobrança inicia após o período de teste',
    description: `Cobrança inicia em ${trialEndDate}`,
  },
];

export default function PaywallDetailed() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [monthlyPkg, setMonthlyPkg] = useState<PurchasesPackage | null>(null);
  const [annualPkg, setAnnualPkg] = useState<PurchasesPackage | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState('R$29,90/mês');
  const [annualPrice, setAnnualPrice] = useState('R$14,99/mês');
  const [annualTotal, setAnnualTotal] = useState('R$179,90/ano');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getOfferings()
      .then((offering) => {
        if (!offering) return;
        for (const pkg of offering.availablePackages) {
          if (pkg.product.identifier === 'br.com.niksai.app.mensal') {
            setMonthlyPkg(pkg);
            setMonthlyPrice(pkg.product.priceString + '/mês');
          }
          if (pkg.product.identifier === 'br.com.niksai.app.anual') {
            setAnnualPkg(pkg);
            setAnnualTotal(pkg.product.priceString + '/ano');
            // Calcula equivalente mensal para exibir no card
            const monthlyEquivalent = pkg.product.price / 12;
            const formatted = monthlyEquivalent.toLocaleString('pt-BR', {
              style: 'currency',
              currency: pkg.product.currencyCode ?? 'BRL',
            });
            setAnnualPrice(formatted + '/mês');
          }
        }
      })
      .catch(() => {
        // Mantém preços hardcoded como fallback
      });
  }, []);

  const handlePurchase = async () => {
    const pkg = selectedPlan === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) {
      Alert.alert('Erro', 'Produto não disponível. Tente novamente.');
      return;
    }

    try {
      setPurchasing(true);
      await purchasePackage(pkg);
      router.push('/(onboarding)/notifications');
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert('Erro na compra', 'Não foi possível processar o pagamento. Tente novamente.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const customerInfo = await restorePurchases();
      if (isPremium(customerInfo)) {
        router.push('/(onboarding)/notifications');
      } else {
        Alert.alert('Sem assinatura ativa', 'Não encontramos nenhuma compra anterior associada a esta conta.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar as compras. Tente novamente.');
    } finally {
      setRestoring(false);
    }
  };
  const [restoring, setRestoring] = useState(false);

  function handlePurchase() {
    router.push('/(onboarding)/notifications');
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      if (isSubscribed(info)) {
        router.replace('/(app)/home');
      } else {
        Alert.alert('Nenhuma assinatura encontrada', 'Não encontramos uma assinatura ativa para restaurar.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar. Tente novamente.');
    } finally {
      setRestoring(false);
    }
  }

  const mensalPrice = 'R$29,90';
  const anualPrice = 'R$179,90';
  const anualMonthly = 'R$14,99';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
          <BackButton />
          <TouchableOpacity activeOpacity={0.7} onPress={handleRestore} disabled={restoring}>
            {restoring ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Text className="text-[15px] text-[#9CA3AF] underline">Restaurar</Text>
            )}
          <TouchableOpacity onPress={handleRestore} disabled={restoring} activeOpacity={0.7}>
            {restoring
              ? <ActivityIndicator size="small" color="#9CA3AF" />
              : <Text className="text-[15px] text-[#9CA3AF] underline">Restaurar</Text>
            }
          </TouchableOpacity>
        </View>

        <View className="px-6 pb-10">
          {/* Headline */}
          <View className="mb-8">
            <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
              Comece seu teste GRÁTIS de 3 dias.
            </Text>
          </View>

          {/* Timeline */}
          <View className="mb-8">
            <View
              style={{
                position: 'absolute',
                left: 20,
                top: 32,
                bottom: 32,
                width: 2,
                backgroundColor: '#E5E7EB',
              }}
            />
            <View className="gap-6">
              {timelineSteps.map((step, index) => {
                const Icon = step.Icon;
                return (
                  <View key={index} className="flex-row items-start gap-4">
                    <View
                      className="w-10 h-10 rounded-full bg-[#F5F5F7] items-center justify-center flex-shrink-0"
                      style={{ zIndex: 1 }}
                    >
                      <Icon size={20} color={step.color} />
                    </View>
                    <View className="pt-1.5 flex-1">
                      <Text className="text-[15px] font-semibold text-[#1A1A1A] mb-1">
                        {step.title}
                      </Text>
                      <Text className="text-[14px] text-[#9CA3AF] leading-relaxed">
                        {step.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Plan Cards */}
          <View className="mb-6">
            <View className="flex-row gap-3">
              {/* Monthly Plan */}
              <TouchableOpacity
                onPress={() => setSelectedPlan('monthly')}
                activeOpacity={0.85}
                className="flex-1 p-4 rounded-[16px]"
                style={{
                  borderWidth: 2,
                  borderColor: selectedPlan === 'monthly' ? '#1A1A1A' : 'transparent',
                  backgroundColor: selectedPlan === 'monthly' ? 'white' : '#F5F5F7',
                }}
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View
                    className="w-5 h-5 rounded-full border-2 items-center justify-center"
                    style={{
                      borderColor: selectedPlan === 'monthly' ? '#1A1A1A' : '#9CA3AF',
                      backgroundColor: selectedPlan === 'monthly' ? '#1A1A1A' : 'transparent',
                    }}
                  >
                    {selectedPlan === 'monthly' && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                </View>
                <Text className="text-[15px] font-semibold text-[#1A1A1A] mb-1">Mensal</Text>
                <Text className="text-[17px] font-bold text-[#1A1A1A]">{monthlyPrice}</Text>
                <Text className="text-[20px] font-bold text-[#1A1A1A]">
                  {mensalPrice}
                  <Text className="text-[14px] font-normal text-[#9CA3AF]">/mês</Text>
                </Text>
              </TouchableOpacity>

              {/* Annual Plan */}
              <View className="flex-1 relative">
                {selectedPlan === 'annual' && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: [{ translateX: -40 }],
                      backgroundColor: '#1A1A1A',
                      borderRadius: 99,
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      zIndex: 1,
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>
                      3 DIAS GRÁTIS
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setSelectedPlan('annual')}
                  activeOpacity={0.85}
                  className="p-4 rounded-[16px]"
                  style={{
                    borderWidth: 2,
                    borderColor: selectedPlan === 'annual' ? '#1A1A1A' : 'transparent',
                    backgroundColor: selectedPlan === 'annual' ? 'white' : '#F5F5F7',
                    flex: 1,
                  }}
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View
                      className="w-5 h-5 rounded-full border-2 items-center justify-center"
                      style={{
                        borderColor: selectedPlan === 'annual' ? '#1A1A1A' : '#9CA3AF',
                        backgroundColor: selectedPlan === 'annual' ? '#1A1A1A' : 'transparent',
                      }}
                    >
                      {selectedPlan === 'annual' && (
                        <View className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </View>
                  </View>
                  <Text className="text-[15px] font-semibold text-[#1A1A1A] mb-1">Anual</Text>
                  <Text className="text-[17px] font-bold text-[#1A1A1A]">{annualPrice}</Text>
                  <Text className="text-[20px] font-bold text-[#1A1A1A]">
                    {anualMonthly}
                    <Text className="text-[14px] font-normal text-[#9CA3AF]">/mês</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Badge "Nenhum pagamento" */}
          <View className="flex-row items-center justify-center gap-2 mb-8">
            <Check size={20} color="#1A1A1A" />
            <Text className="text-[15px] text-[#1A1A1A]">Nenhum pagamento agora</Text>
          </View>

          {/* CTA */}
          <View className="mb-4">
            <TouchableOpacity
              onPress={handlePurchase}
              disabled={purchasing}
              activeOpacity={0.85}
              className="w-full py-4 rounded-[14px] items-center justify-center bg-[#1A1A1A]"
            >
              {purchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white text-[17px] font-semibold">
                  Iniciar meu teste grátis de 3 dias
                </Text>
              )}
              activeOpacity={0.85}
              className="w-full py-4 rounded-[14px] items-center justify-center bg-[#1A1A1A]"
            >
              <Text className="text-white text-[17px] font-semibold">
                {selectedPlan === 'annual' ? 'Iniciar meu teste grátis de 3 dias' : `Assinar por ${mensalPrice}/mês`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fine print */}
          <Text className="text-center text-[13px] text-[#9CA3AF] leading-relaxed">
            3 dias grátis, depois {selectedPlan === 'annual' ? annualTotal : monthlyPrice}
            {selectedPlan === 'annual'
              ? `3 dias grátis, depois ${anualPrice}/ano (${anualMonthly}/mês)`
              : `${mensalPrice}/mês, cancele quando quiser`
            }
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
