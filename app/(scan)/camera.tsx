import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import Svg, { Ellipse } from 'react-native-svg';

export default function Camera() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.8}
        style={styles.closeBtn}
      >
        <X size={20} color="white" />
      </TouchableOpacity>

      {/* Camera view (placeholder) — flex:1, centralizado */}
      <View style={styles.cameraPlaceholder}>
        {/* Face Guide — 256×320 igual ao Figma (w-64 h-80) */}
        <View style={styles.guideContainer}>

          {/* Elipse via SVG — rounded-[50%] do Figma */}
          <Svg width={256} height={320} style={StyleSheet.absoluteFill}>
            <Ellipse
              cx={128}
              cy={160}
              rx={126}
              ry={158}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={2}
              fill="none"
            />
          </Svg>

          {/* Corner brackets — posicionados nos 4 cantos do bounding box */}
          {/* Top Left */}
          <View style={[styles.corner, styles.cornerTL]} />
          {/* Top Right */}
          <View style={[styles.corner, styles.cornerTR]} />
          {/* Bottom Left */}
          <View style={[styles.corner, styles.cornerBL]} />
          {/* Bottom Right */}
          <View style={[styles.corner, styles.cornerBR]} />

          {/* Instruction text — centralizado -48px abaixo do guia, igual ao Figma */}
          <View style={styles.instructionWrapper}>
            <Text style={styles.instructionText}>
              Posicione seu rosto dentro do guia
            </Text>
          </View>
        </View>
      </View>

      {/* Capture button */}
      <View style={styles.captureArea}>
        <TouchableOpacity
          onPress={() => router.push('/(scan)/loading')}
          activeOpacity={0.9}
          style={styles.captureOuter}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    left: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideContainer: {
    width: 256,
    height: 320,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
  },
  cornerTL: {
    top: 0,
    left: 32,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'white',
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 32,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: 'white',
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 32,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'white',
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 32,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: 'white',
    borderBottomRightRadius: 8,
  },
  instructionWrapper: {
    position: 'absolute',
    bottom: -48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  captureArea: {
    paddingBottom: 48,
    alignItems: 'center',
  },
  captureOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
  },
});
