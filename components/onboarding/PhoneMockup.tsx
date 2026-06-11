import { View, Image, ImageSourcePropType, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';

interface PhoneMockupProps {
  width?: number;
  screenImage?: ImageSourcePropType;
  screenVideo?: number | string;
}

function VideoScreen({ source, style }: { source: number | string; style: object }) {
  const player = useVideoPlayer(source as any, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
    />
  );
}

export function PhoneMockup({ width = 210, screenImage, screenVideo }: PhoneMockupProps) {
  const h = Math.round(width * 2.06);
  const r = width * 0.155;
  const innerR = width * 0.135;
  const bezel = Math.max(7, width * 0.034);
  const islandW = width * 0.32;
  const islandH = width * 0.082;

  const btnLeft = { left: -1.5 };
  const btnRight = { right: -1.5 };

  return (
    <View style={[styles.shadow, { width, height: h, borderRadius: r }]}>
      {/* outer titanium frame */}
      <LinearGradient
        colors={['#3a342f', '#1c1916', '#2a2521', '#15110f']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: r }]}
      />

      {/* sheen overlay */}
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.06)']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: r }]}
      />

      {/* inner screen */}
      <View style={{
        position: 'absolute',
        top: bezel, left: bezel, right: bezel, bottom: bezel,
        borderRadius: innerR,
        backgroundColor: '#F4EFE9',
        overflow: 'hidden',
      }}>
        {/* brand glow at bottom */}
        <View style={{
          position: 'absolute',
          bottom: '-30%' as any,
          left: '-20%',
          right: '-20%',
          height: '70%',
          opacity: 0.1,
          backgroundColor: '#FB7B6B',
          borderRadius: 9999,
        }} />

        {screenVideo ? (
          <VideoScreen
            source={screenVideo}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : screenImage ? (
          <Image
            source={screenImage}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
          />
        ) : null}

        {/* dynamic island */}
        <View style={{
          position: 'absolute',
          top: bezel + 1,
          left: '50%',
          marginLeft: -(islandW / 2),
          width: islandW,
          height: islandH,
          borderRadius: islandH,
          backgroundColor: '#0a0807',
        }} />
      </View>

      {/* side buttons left */}
      <View style={[styles.btn, btnLeft, { top: '14%', height: width * 0.07 }]} />
      <View style={[styles.btn, btnLeft, { top: '24%', height: width * 0.13 }]} />
      <View style={[styles.btn, btnLeft, { top: '35%', height: width * 0.13 }]} />
      {/* side button right */}
      <View style={[styles.btn, btnRight, { top: '26%', height: width * 0.18 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'relative',
    shadowColor: '#2b2724',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 12,
  },
  btn: {
    position: 'absolute',
    width: 3,
    borderRadius: 2,
    backgroundColor: '#1c1916',
  },
});
