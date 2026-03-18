# Retiradas Temporariamente

## Contexto

Este documento foi criado em **16 de março de 2026** para registrar todo o código removido temporariamente do app NIKS AI.

### Por que foi removido?

O app ainda **não foi aprovado pela Apple**. Os produtos de assinatura cadastrados no RevenueCat não estão disponíveis na App Store:

- `br.com.niksai.app.mensal` (Plano Mensal — R$29,90/mês)
- `br.com.niksai.app.anual` (Plano Anual — R$179,90/ano = R$14,99/mês)

Quando qualquer usuário tentava clicar em "Iniciar meu teste grátis de 3 dias" na tela de Paywall Detailed, o RevenueCat retornava um erro porque a Apple não conseguia encontrar os produtos cadastrados. Além disso, o `_layout.tsx` verificava a assinatura na abertura do app e redirecionava todos os usuários não-assinantes para o paywall, criando um loop sem saída.

O resultado: **ninguém conseguia acessar o app** — nem a equipe interna, nem os revisores da Apple.

### Solução temporária

- A lógica de compra via RevenueCat foi removida da tela de Paywall Detailed
- A verificação de assinatura na abertura do app foi removida do `_layout.tsx`
- O botão CTA do paywall agora navega diretamente para a próxima tela (`/(onboarding)/notifications`)
- Usuários logados são direcionados diretamente para `/(app)/home`

### Quando restaurar

**Assim que o app for aprovado pela Apple e os produtos estiverem ativos na App Store**, restaure o código abaixo em cada arquivo correspondente.

---

## Código removido de `app/_layout.tsx`

### Import removido (linha 7)

```ts
import { initRevenueCat, getCustomerInfo, isSubscribed } from '../lib/revenuecat';
```

Deve ser restaurado para:

```ts
import { initRevenueCat, getCustomerInfo, isSubscribed } from '../lib/revenuecat';
```

(O import de `initRevenueCat` foi mantido, mas `getCustomerInfo` e `isSubscribed` foram removidos. Na versão temporária o import ficou assim:)

```ts
import { initRevenueCat } from '../lib/revenuecat';
```

### Lógica de verificação de assinatura removida

Dentro do `useEffect`, dentro do bloco `supabase.auth.getSession().then(async ({ data: { session } }) => { if (session) { ... } })`, o bloco original era:

```ts
try {
  const info = await getCustomerInfo();
  if (isSubscribed(info)) {
    router.replace('/(app)/home');
  } else {
    router.replace('/(onboarding)/paywall-soft');
  }
} catch {
  router.replace('/(onboarding)/paywall-soft');
}
```

Na versão temporária foi substituído por:

```ts
router.replace('/(app)/home');
```

**Para restaurar:** substitua `router.replace('/(app)/home');` pelo bloco `try/catch` completo acima, e restaure o import completo com `getCustomerInfo` e `isSubscribed`.

---

## Código removido de `app/(onboarding)/paywall-detailed.tsx`

### Imports removidos

```ts
import { PurchasesPackage } from 'react-native-purchases';
import {
  getPackages,
  purchasePackage,
  restorePurchases,
  isSubscribed,
} from '../../lib/revenuecat';
```

Na versão temporária apenas `restorePurchases` e `isSubscribed` foram mantidos:

```ts
import {
  restorePurchases,
  isSubscribed,
} from '../../lib/revenuecat';
```

**Para restaurar:** adicione `PurchasesPackage` ao import de `react-native-purchases` e adicione `getPackages` e `purchasePackage` ao import de `../../lib/revenuecat`.

### Estados removidos

```ts
const [mensalPkg, setMensalPkg] = useState<PurchasesPackage | null>(null);
const [anualPkg, setAnualPkg] = useState<PurchasesPackage | null>(null);
const [loadingPackages, setLoadingPackages] = useState(true);
const [purchasing, setPurchasing] = useState(false);
```

### useEffect removido (carregamento dos pacotes RevenueCat)

```ts
useEffect(() => {
  getPackages()
    .then(({ mensal, anual }) => {
      setMensalPkg(mensal);
      setAnualPkg(anual);
    })
    .catch(() => {/* mantém null — preços fallback serão exibidos */})
    .finally(() => setLoadingPackages(false));
}, []);
```

### Função `handlePurchase` removida

```ts
async function handlePurchase() {
  const pkg = selectedPlan === 'annual' ? anualPkg : mensalPkg;
  if (!pkg) {
    Alert.alert('Erro', 'Produto não encontrado. Tente novamente.');
    return;
  }
  setPurchasing(true);
  try {
    await purchasePackage(pkg);
    router.push('/(onboarding)/notifications');
  } catch (e: any) {
    if (!e.userCancelled) {
      Alert.alert('Erro', 'Não foi possível completar a compra. Tente novamente.');
    }
  } finally {
    setPurchasing(false);
  }
}
```

Na versão temporária foi substituída por:

```ts
function handlePurchase() {
  router.push('/(onboarding)/notifications');
}
```

### Variáveis de preço dinâmico removidas

```ts
const mensalPrice = mensalPkg?.product.priceString ?? 'R$29,90';
const anualPrice = anualPkg?.product.priceString ?? 'R$179,90';
const anualMonthly = anualPkg
  ? `R$${((anualPkg.product.price ?? 179.9) / 12).toFixed(2).replace('.', ',')}`
  : 'R$14,99';
```

Na versão temporária foram substituídas por valores hardcoded:

```ts
const mensalPrice = 'R$29,90';
const anualPrice = 'R$179,90';
const anualMonthly = 'R$14,99';
```

### Label do CTA removida (dinâmica)

```ts
const ctaLabel = selectedPlan === 'annual'
  ? 'Iniciar meu teste grátis de 3 dias'
  : `Assinar por ${mensalPrice}/mês`;
```

Na versão temporária foi substituída por texto fixo direto no JSX.

### Props do botão CTA removidas

O botão CTA original tinha:

```tsx
<TouchableOpacity
  onPress={handlePurchase}
  disabled={purchasing || loadingPackages}
  activeOpacity={0.85}
  className="w-full py-4 rounded-[14px] items-center justify-center bg-[#1A1A1A]"
>
  {purchasing
    ? <ActivityIndicator color="white" />
    : <Text className="text-white text-[17px] font-semibold">{ctaLabel}</Text>
  }
</TouchableOpacity>
```

Na versão temporária foi simplificado para:

```tsx
<TouchableOpacity
  onPress={handlePurchase}
  activeOpacity={0.85}
  className="w-full py-4 rounded-[14px] items-center justify-center bg-[#1A1A1A]"
>
  <Text className="text-white text-[17px] font-semibold">
    {selectedPlan === 'annual' ? 'Iniciar meu teste grátis de 3 dias' : `Assinar por ${mensalPrice}/mês`}
  </Text>
</TouchableOpacity>
```

### Loading state dos cards de plano removido

O bloco de planos original tinha um loading state:

```tsx
{loadingPackages ? (
  <View className="items-center py-6">
    <ActivityIndicator color="#FB7B6B" />
  </View>
) : (
  <View className="flex-row gap-3">
    {/* ... cards de plano ... */}
  </View>
)}
```

Na versão temporária o condicional foi removido e os cards são renderizados diretamente.

---

## Checklist de restauração (quando o app for aprovado)

- [ ] Restaurar import completo em `app/_layout.tsx` (`getCustomerInfo`, `isSubscribed`)
- [ ] Restaurar bloco `try/catch` de verificação de assinatura em `app/_layout.tsx`
- [ ] Restaurar import `PurchasesPackage` de `react-native-purchases` em `paywall-detailed.tsx`
- [ ] Restaurar imports `getPackages` e `purchasePackage` de `../../lib/revenuecat` em `paywall-detailed.tsx`
- [ ] Restaurar estados: `mensalPkg`, `anualPkg`, `loadingPackages`, `purchasing`
- [ ] Restaurar `useEffect` de carregamento dos pacotes RevenueCat
- [ ] Restaurar função `handlePurchase` completa com lógica de compra
- [ ] Restaurar variáveis de preço dinâmico (`mensalPrice`, `anualPrice`, `anualMonthly`)
- [ ] Restaurar `ctaLabel` dinâmico
- [ ] Restaurar loading state nos cards de plano
- [ ] Restaurar props `disabled` e `ActivityIndicator` no botão CTA
- [ ] Testar compra do plano mensal em ambiente de sandbox
- [ ] Testar compra do plano anual (com trial de 3 dias) em ambiente de sandbox
- [ ] Testar restauração de compra ("Restaurar")
- [ ] Verificar que usuário não-assinante é corretamente redirecionado ao paywall
