import { View } from 'react-native';
import Svg, {
  Circle,
  Ellipse,
  Defs,
  RadialGradient,
  Stop,
  Filter,
  FeGaussianBlur,
} from 'react-native-svg';

// Reference: orb div is 210×210; halo has inset: -34 (overflow, layout sees only 210×210)
const ORB   = 210;
const EXTRA = 34;
const C     = ORB + EXTRA * 2; // 278 — halo SVG size

// Orb circle center/radius in the 210×210 SVG coordinate space
const orbCx = ORB / 2; // 105
const orbCy = ORB / 2; // 105
const orbR  = ORB / 2; // 105

// CSS: radial-gradient(circle at 35% 28%, ...) → farthest-corner from (73.5, 58.8) in 210×210
// Farthest corner: bottom-right (210,210) → distance ≈ 203.7px
const ORB_GRAD_CX = ORB * 0.35; // 73.5
const ORB_GRAD_CY = ORB * 0.28; // 58.8
const ORB_GRAD_R  = 204;        // CSS farthest-corner ≈ 203.7px

// Specular highlight: top 18%, left 24%, width 36%, height 24% of 210×210
const specRx = (ORB * 0.36) / 2; // 37.8
const specRy = (ORB * 0.24) / 2; // 25.2
const specCx = ORB * 0.24 + specRx; // 50.4 + 37.8 = 88.2
const specCy = ORB * 0.18 + specRy; // 37.8 + 25.2 = 63.0

// Halo SVG is 278×278, gradient: radial-gradient(circle at 35% 30%, ...)
// Gradient center in 278×278 space
const haloCx = C * 0.35; // 97.3
const haloCy = C * 0.30; // 83.4
// CSS farthest-corner from (97.3, 83.4) in 278×278 → bottom-right (278,278) ≈ 265.5px
const HALO_R = 265.5;

export function WelcomeOrb() {
  return (
    // Layout container: 210×210 (matches the reference HTML structure).
    // The halo SVG overflows 34px in all directions via absolute positioning.
    <View style={{ width: ORB, height: ORB }}>

      {/* halo — absolute, -34px inset on all sides → renders 278×278 centered on the orb */}
      <Svg
        width={C}
        height={C}
        style={{ position: 'absolute', top: -EXTRA, left: -EXTRA }}
      >
        <Defs>
          <RadialGradient
            id="haloGrad"
            cx={haloCx} cy={haloCy} r={HALO_R}
            fx={haloCx} fy={haloCy}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0"    stopColor="#FFDEC8" stopOpacity="0.55" />
            <Stop offset="0.42" stopColor="#FB7B6B" stopOpacity="0.16" />
            <Stop offset="0.70" stopColor="#FB7B6B" stopOpacity="0"    />
          </RadialGradient>
          {/* filter: blur(6px) — applied to the entire halo circle */}
          <Filter id="haloBlur" x="-15%" y="-15%" width="130%" height="130%">
            <FeGaussianBlur stdDeviation="6" />
          </Filter>
        </Defs>
        {/* circle fills the 278×278 SVG, gradient fades to transparent at ~186px from center */}
        <Circle cx={C / 2} cy={C / 2} r={C / 2} fill="url(#haloGrad)" filter="url(#haloBlur)" />
      </Svg>

      {/* orb body: 210×210, radial gradient matches CSS exactly */}
      <Svg width={ORB} height={ORB}>
        <Defs>
          <RadialGradient
            id="orbGrad"
            cx={ORB_GRAD_CX} cy={ORB_GRAD_CY} r={ORB_GRAD_R}
            fx={ORB_GRAD_CX} fy={ORB_GRAD_CY}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0"    stopColor="#FFEFE4" />
            <Stop offset="0.28" stopColor="#F9C9B6" />
            <Stop offset="0.62" stopColor="#E89178" />
            <Stop offset="1"    stopColor="#C86651" />
          </RadialGradient>

          {/* specular highlight: radial-gradient(ellipse at center, ...) with blur(3px) */}
          <RadialGradient
            id="specGrad"
            cx={specCx} cy={specCy} r={Math.max(specRx, specRy)}
            fx={specCx} fy={specCy}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0"    stopColor="white" stopOpacity="0.7" />
            <Stop offset="0.70" stopColor="white" stopOpacity="0"   />
          </RadialGradient>
          {/* filter: blur(3px) on specular */}
          <Filter id="specBlur" x="-30%" y="-30%" width="160%" height="160%">
            <FeGaussianBlur stdDeviation="3" />
          </Filter>
        </Defs>

        {/* orb circle */}
        <Circle cx={orbCx} cy={orbCy} r={orbR} fill="url(#orbGrad)" />

        {/* specular highlight with blur */}
        <Ellipse
          cx={specCx} cy={specCy}
          rx={specRx} ry={specRy}
          fill="url(#specGrad)"
          filter="url(#specBlur)"
        />
      </Svg>

    </View>
  );
}
