import { View, Text, Image, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ChevronLeft, Star } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { requestAppReview } from '../../lib/storeReview';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { Colors } from '../../constants/colors';

const LeftLaurel = () => (
  <Svg width={32} height={48} viewBox="0 0 32 48" fill="none">
    <Path d="M16 45C9 35 6 23 9 10C10 5 14 2 14 2" stroke="#E5B869" strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M13 36C19 35 23 30 22 25C18 25 12 28 13 36Z" fill="#E5B869" />
    <Path d="M14 27C20 25 23 20 22 15C18 15 13 19 14 27Z" fill="#E5B869" />
    <Path d="M16 18C22 15 24 10 22 5C18 6 14 11 16 18Z" fill="#E5B869" />
    <Path d="M9 30C5 29 2 25 3 20C7 20 12 24 9 30Z" fill="#E5B869" />
    <Path d="M10 21C6 19 3 15 4 10C8 10 13 14 10 21Z" fill="#E5B869" />
  </Svg>
);

const RightLaurel = () => (
  <Svg width={32} height={48} viewBox="0 0 32 48" fill="none">
    <Path d="M16 45C23 35 26 23 23 10C22 5 18 2 18 2" stroke="#E5B869" strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M19 36C13 35 9 30 10 25C14 25 20 28 19 36Z" fill="#E5B869" />
    <Path d="M18 27C12 25 9 20 10 15C14 15 19 19 18 27Z" fill="#E5B869" />
    <Path d="M16 18C10 15 8 10 10 5C14 6 18 11 16 18Z" fill="#E5B869" />
    <Path d="M23 30C27 29 30 25 29 20C25 20 20 24 23 30Z" fill="#E5B869" />
    <Path d="M22 21C26 19 29 15 28 10C24 10 19 14 22 21Z" fill="#E5B869" />
  </Svg>
);

export default function RateUs() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { scanSource, setScanSource } = useAppStore();

  useEffect(() => {
    requestAppReview();
  }, []);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 16, step_name: 'Avalie Nos', step_total: 23 });
  }, []);

  const handleContinue = () => {
    track('onboarding_step_completed', { step_number: 16, step_name: 'Avalie Nos', step_total: 23 });
    if (scanSource === 'app') {
      setScanSource('onboarding');
      router.replace('/(app)/skin-result' as any);
    } else {
      router.replace('/(scan)/results');
    }
  };

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '70%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 18, paddingTop: 40, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 32,
            }}>
              Avalie-nos
            </Text>

            {/* Rating */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
              <LeftLaurel />
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{
                  fontWeight: '700',
                  color: Colors.tabActive,
                  textAlign: 'center',
                  lineHeight: 26,
                  fontSize: 18,
                  marginBottom: 4,
                }}>
                  {'Deixe a sua avaliação\ndo nosso app!'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={18} color="#F59E0B" fill="#F59E0B" />
                  ))}
                </View>
              </View>
              <RightLaurel />
            </View>

            {/* Made for you */}
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <Text style={{
                fontSize: 22,
                fontWeight: '800',
                color: Colors.tabActive,
                textAlign: 'center',
                maxWidth: 280,
                lineHeight: 28,
                marginBottom: 20,
              }}>
                NIKS AI foi feito para pessoas como você
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1705940372495-ab4ed45d3102?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
                  style={{ width: 72, height: 72, borderRadius: 999, borderWidth: 3, borderColor: Colors.white, marginLeft: -16, zIndex: 10 }}
                />
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1690444963408-9573a17a8058?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
                  style={{ width: 84, height: 84, borderRadius: 999, borderWidth: 3, borderColor: Colors.white, marginLeft: -16, marginTop: -8, zIndex: 20 }}
                />
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1656339504243-2df4c5ebf1c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
                  style={{ width: 72, height: 72, borderRadius: 999, borderWidth: 3, borderColor: Colors.white, marginLeft: -16, zIndex: 10 }}
                />
              </View>
            </View>

            {/* Testimonial */}
            <View style={{
              width: '100%',
              marginBottom: 40,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.10)',
              padding: 20,
              backgroundColor: 'transparent',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Image
                    source={{ uri: 'https://images.unsplash.com/photo-1599651515421-43a8e7dbf212?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
                    style={{ width: 44, height: 44, borderRadius: 22 }}
                  />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.tabActive }}>
                    Mariana Silva
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={14} color="#F59E0B" fill="#F59E0B" />
                  ))}
                </View>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 22, color: Colors.gray }}>
                Minha pele já melhorou muito em 2 meses! Eu estava cética no início, mas decidi dar uma chance a este app e funcionou :)
              </Text>
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={0.8}
              style={{
                backgroundColor: Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </ScrollView>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
