import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ArrowLeft, Star } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { requestAppReview } from '../../lib/storeReview';

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
  const insets = useSafeAreaInsets();

  useEffect(() => {
    requestAppReview();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top Bar */}
      <View className="px-6 pt-2 pb-4 flex-row items-center gap-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-[#F5F5F5] items-center justify-center"
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#1A1A1A" />
        </TouchableOpacity>
        <View className="flex-1 h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
          <View className="w-[90%] h-full bg-[#1A1A1A] rounded-full" />
        </View>
      </View>

      <View className="flex-1 px-6" style={{ paddingBottom: insets.bottom + 88 }}>
        <Text style={styles.title}>Avalie-nos</Text>

        {/* Rating Card */}
        <View style={styles.ratingCard}>
          <LeftLaurel />
          <View className="flex-1 items-center gap-2">
            <Text style={styles.ratingText}>
              {'Deixe a sua avaliação\ndo nosso app!'}
            </Text>
            <View className="flex-row items-center gap-[2px]">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} size={18} color="#F59E0B" fill="#F59E0B" />
              ))}
            </View>
          </View>
          <RightLaurel />
        </View>

        {/* Made for you */}
        <View className="items-center mb-8">
          <Text style={styles.madeForYouTitle}>
            NIKS AI foi feito para pessoas como você
          </Text>

          {/* Overlapping Avatars */}
          <View style={styles.avatarRow}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1705940372495-ab4ed45d3102?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
              style={[styles.avatar, styles.avatarSide, { zIndex: 10 }]}
            />
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1690444963408-9573a17a8058?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
              style={[styles.avatar, styles.avatarCenter, { zIndex: 20 }]}
            />
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1656339504243-2df4c5ebf1c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
              style={[styles.avatar, styles.avatarSide, { zIndex: 10 }]}
            />
          </View>
        </View>

        {/* Testimonial Cards */}
        <View style={styles.testimonialContainer}>
          {/* Ghost card behind */}
          <View style={styles.ghostCard} />

          {/* Main card */}
          <View style={styles.mainCard}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1630841539293-bd20634c5d72?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200' }}
                  style={styles.testimonialAvatar}
                />
                <Text style={styles.testimonialName}>João Pedro</Text>
              </View>
              <View className="flex-row items-center gap-[2px]">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={14} color="#F59E0B" fill="#F59E0B" />
                ))}
              </View>
            </View>
            <Text style={styles.testimonialText}>
              Minha pele melhorou muito em 2 meses! Eu estava cético no início, mas decidi dar uma chance a este app e funcionou :)
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom CTA */}
      <View style={[styles.bottomCta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={() => router.replace('/(scan)/results')}
          style={styles.continueBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 8,
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  ratingCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 1,
    backgroundColor: '#fff',
  },
  ratingText: {
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 20,
    marginBottom: 8,
  },
  madeForYouTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 32,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  avatar: {
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 999,
  },
  avatarSide: {
    width: 72,
    height: 72,
    marginLeft: -16,
  },
  avatarCenter: {
    width: 84,
    height: 84,
    marginTop: -8,
    marginLeft: -16,
  },
  testimonialContainer: {
    position: 'relative',
    width: '100%',
    marginTop: 8,
  },
  ghostCard: {
    position: 'absolute',
    bottom: -16,
    left: 16,
    right: 16,
    height: 60,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    opacity: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  mainCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 2,
  },
  testimonialAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  testimonialName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  testimonialText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
  },
  bottomCta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 48,
    backgroundColor: 'transparent',
  },
  continueBtn: {
    width: '100%',
    height: 56,
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 17,
  },
});
