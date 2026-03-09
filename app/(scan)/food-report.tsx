import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Sparkles, Info } from 'lucide-react-native';

interface FoodEntry {
  name: string;
  image: string;
  impact: 'boost' | 'neutral' | 'trigger';
  calories: number;
  time: string;
  ingredients: string[];
  keyNutrients: { name: string; effect: string; icon: string }[];
  explanation: string;
  recommendation: string;
}

const foodDatabase: Record<string, FoodEntry> = {
  'salada-mediterranea': {
    name: 'Salada mediterrânea',
    image: 'https://images.unsplash.com/photo-1649531794884-b8bb1de72e68?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=400',
    impact: 'boost',
    calories: 245,
    time: '12:47',
    ingredients: ['Folhas verdes (espinafre, alface)', 'Tomate cereja', 'Pepino', 'Azeite de oliva extra virgem', 'Azeitonas pretas', 'Queijo feta'],
    keyNutrients: [
      { name: 'Vitamina E', effect: 'Antioxidante poderoso que protege a pele dos radicais livres e promove regeneração celular.', icon: '🛡️' },
      { name: 'Ômega-3', effect: 'Propriedades anti-inflamatórias que reduzem vermelhidão e acne. Mantém a pele hidratada.', icon: '💧' },
      { name: 'Vitamina C', effect: 'Estimula produção de colágeno, uniformiza o tom da pele e previne manchas.', icon: '✨' },
    ],
    explanation: 'Esta salada é excelente para sua pele! Rica em antioxidantes, vitaminas e gorduras saudáveis do azeite, ela combate inflamação e promove regeneração celular.',
    recommendation: 'Continue incluindo este tipo de refeição regularmente. Ideal consumir no almoço para máxima absorção de nutrientes.',
  },
  'torrada-abacate': {
    name: 'Torrada de abacate',
    image: 'https://images.unsplash.com/photo-1609158087148-3bae840bcfda?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=400',
    impact: 'neutral',
    calories: 320,
    time: '08:15',
    ingredients: ['Pão integral', 'Abacate fresco', 'Sal marinho', 'Pimenta preta', 'Azeite'],
    keyNutrients: [
      { name: 'Gorduras Saudáveis', effect: 'O abacate fornece gorduras monoinsaturadas que mantêm a pele macia e hidratada.', icon: '🥑' },
      { name: 'Vitamina E', effect: 'Proteção antioxidante contra danos ambientais e envelhecimento precoce.', icon: '🛡️' },
      { name: 'Carboidratos', effect: 'O pão integral pode causar picos de insulina em algumas pessoas, afetando a pele.', icon: '⚠️' },
    ],
    explanation: 'Esta refeição tem aspectos positivos e neutros. O abacate é excelente com suas gorduras saudáveis, porém o pão integral pode causar leve inflamação.',
    recommendation: 'Monitore como sua pele reage. Se notar mais oleosidade, considere substituir o pão por uma opção sem glúten.',
  },
  'salmao-grelhado': {
    name: 'Salmão grelhado',
    image: 'https://images.unsplash.com/photo-1580959375944-abd7e991f971?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=400',
    impact: 'boost',
    calories: 380,
    time: 'Ontem',
    ingredients: ['Filé de salmão selvagem', 'Limão', 'Ervas frescas', 'Alho', 'Azeite'],
    keyNutrients: [
      { name: 'Ômega-3 (EPA/DHA)', effect: 'Os ácidos graxos mais anti-inflamatórios! Reduzem acne, vermelhidão e promovem cicatrização.', icon: '🐟' },
      { name: 'Proteína de Alta Qualidade', effect: 'Fornece aminoácidos essenciais para produção de colágeno e elastina.', icon: '💪' },
      { name: 'Astaxantina', effect: 'Antioxidante exclusivo do salmão que protege contra raios UV e melhora elasticidade.', icon: '✨' },
    ],
    explanation: 'O salmão é um dos melhores alimentos para a pele! Rico em ômega-3, ele combate inflamação sistêmica, reduz acne e promove uma pele radiante.',
    recommendation: 'Perfeito! Tente consumir salmão ou outros peixes gordos 2-3x por semana para melhores resultados na pele.',
  },
};

const impactConfig = {
  boost: { label: 'Skin Boost', color: '#7CB69D', bgColor: 'rgba(124,182,157,0.1)', emoji: '🟢', description: 'Este alimento é excelente para sua pele' },
  neutral: { label: 'Neutro', color: '#B8860B', bgColor: 'rgba(255,215,0,0.1)', emoji: '🟡', description: 'Este alimento tem efeito moderado na pele' },
  trigger: { label: 'Possível Gatilho', color: '#FB7B6B', bgColor: 'rgba(251,123,107,0.1)', emoji: '🔴', description: 'Este alimento pode afetar negativamente sua pele' },
};

export default function FoodReport() {
  const router = useRouter();
  const { foodId } = useLocalSearchParams<{ foodId: string }>();
  const food = foodDatabase[foodId ?? 'salada-mediterranea'];
  const impact = impactConfig[food?.impact ?? 'boost'];

  if (!food) {
    return (
      <SafeAreaView className="flex-1 bg-[#F6F4EE] items-center justify-center">
        <Text className="text-[#1A1A1A]">Alimento não encontrado</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F4EE]">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
          >
            <ChevronLeft size={20} color="#1D3A44" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1D3A44' }}>Relatório de Impacto</Text>
        </View>

        {/* Food image */}
        <View className="px-5 mb-4">
          <View style={{ width: '100%', height: 200, borderRadius: 16, overflow: 'hidden' }}>
            <Image
              source={{ uri: food.image }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {/* Gradient overlay */}
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: 'rgba(0,0,0,0.4)' }} />
            <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>{food.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 10 }}>{impact.emoji}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: impact.color }}>{impact.label}</Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1D3A44' }}>{food.calories} cal</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="px-5 gap-3 pb-8">
          {/* Impact explanation */}
          <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: impact.bgColor, alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={18} color={impact.color} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44', marginBottom: 4 }}>{impact.description}</Text>
                <Text style={{ fontSize: 13, color: '#5A5A5C', lineHeight: 20 }}>{food.explanation}</Text>
              </View>
            </View>
          </View>

          {/* Key nutrients */}
          <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44', marginBottom: 12 }}>Nutrientes chave</Text>
            <View style={{ gap: 12 }}>
              {food.keyNutrients.map((nutrient, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <Text style={{ fontSize: 24 }}>{nutrient.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D3A44', marginBottom: 2 }}>{nutrient.name}</Text>
                    <Text style={{ fontSize: 12, color: '#5A5A5C', lineHeight: 18 }}>{nutrient.effect}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Ingredients */}
          <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44', marginBottom: 12 }}>Ingredientes identificados</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {food.ingredients.map((ingredient, index) => (
                <View key={index} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: '#F6F4EE' }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#1D3A44' }}>{ingredient}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Recommendation */}
          <View style={{ borderRadius: 14, padding: 16, backgroundColor: impact.bgColor, borderWidth: 1.5, borderColor: impact.color + '20' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Info size={18} color={impact.color} strokeWidth={2} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: impact.color, marginBottom: 4 }}>Recomendação personalizada</Text>
                <Text style={{ fontSize: 12, color: '#1D3A44', lineHeight: 18 }}>{food.recommendation}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
