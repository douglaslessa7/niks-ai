import { View, Text, TouchableOpacity, Image, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react-native';

export default function FoodScanIntro() {
  const router = useRouter();
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 160,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Back Button */}
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#F6F4EE',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={18} color="#1A1A1A" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        {/* Heading */}
        <View style={{ marginBottom: 28, marginTop: 16 }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: '#1A1A1A', lineHeight: 38 }}>
            Sua alimentação afeta sua pele mais do que você imagina
          </Text>
        </View>

        {/* Food Analysis Card */}
        <View
          style={{
            backgroundColor: '#F5F5F7',
            borderRadius: 16,
            padding: 20,
            marginBottom: 12,
          }}
        >
          {/* Image with scan animation overlay */}
          <View
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
              height: 192,
              backgroundColor: '#000',
            }}
          >
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1654683413645-d8d15189384c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800' }}
              style={{ width: '100%', height: '100%', opacity: 0.8 }}
              resizeMode="cover"
            />

            {/* Animated scan line */}
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                backgroundColor: '#4ADE80',
                shadowColor: '#4ADE80',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
                transform: [{ translateY: scanAnim }],
              }}
            />

            {/* Viewfinder corner brackets */}
            {/* Top-left */}
            <View style={{ position: 'absolute', top: 24, left: 24, width: 24, height: 24, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderTopLeftRadius: 2 }} />
            {/* Top-right */}
            <View style={{ position: 'absolute', top: 24, right: 24, width: 24, height: 24, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderTopRightRadius: 2 }} />
            {/* Bottom-left */}
            <View style={{ position: 'absolute', bottom: 24, left: 24, width: 24, height: 24, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderBottomLeftRadius: 2 }} />
            {/* Bottom-right */}
            <View style={{ position: 'absolute', bottom: 24, right: 24, width: 24, height: 24, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderBottomRightRadius: 2 }} />
          </View>

          {/* Description */}
          <Text style={{ fontSize: 15, color: '#1A1A1A', lineHeight: 22 }}>
            Escaneie qualquer refeição e descubra na hora o que está ajudando — ou sabotando — sua pele.
          </Text>
        </View>

        {/* Citation */}
        <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24, marginBottom: 24 }}>
          Baseado em estudos do Journal of Dermatology e Nutrition Research
        </Text>

        <View style={{ flex: 1 }} />

        {/* CTA Button */}
        <View style={{ paddingBottom: 40 }}>
          <TouchableOpacity
            onPress={() => router.push('/(scan)/food-camera' as any)}
            activeOpacity={0.9}
            style={{
              width: '100%',
              paddingVertical: 16,
              borderRadius: 14,
              backgroundColor: '#1A1A1A',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>
              Continuar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
