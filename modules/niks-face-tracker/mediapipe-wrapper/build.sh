#!/bin/bash
# Monta modules/niks-face-tracker/ios/MediaPipe/NiksMediaPipe.xcframework: o MediaPipe Face
# Landmarker (0.10.21) dentro de uma framework DINÂMICA que só exporta `NKFaceLandmarker`.
# Por quê: a `glog` que o MediaPipe embute colide com a do React Native e o app aborta ao
# carregar o JS (out/2026). Rodar de novo só ao trocar a versão do MediaPipe ou o wrapper.
#   bash modules/niks-face-tracker/mediapipe-wrapper/build.sh
set -euo pipefail

MP_VERSION=0.10.21
VISION_URL=https://dl.google.com/cpdc/20250131-063213/MediaPipeTasksVision-$MP_VERSION.tar.gz
COMMON_URL=https://dl.google.com/cpdc/20250131-063213/MediaPipeTasksCommon-$MP_VERSION.tar.gz
MIN_IOS=15.1

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../ios/MediaPipe/NiksMediaPipe.xcframework"
WORK="${TMPDIR:-/tmp}/niks-mediapipe-build"
mkdir -p "$WORK/vision" "$WORK/common"

[ -d "$WORK/vision/frameworks" ] || curl -sSfL "$VISION_URL" | tar xz -C "$WORK/vision"
[ -d "$WORK/common/frameworks" ] || curl -sSfL "$COMMON_URL" | tar xz -C "$WORK/common"

VXC="$WORK/vision/frameworks/MediaPipeTasksVision.xcframework"
CXC="$WORK/common/frameworks/MediaPipeTasksCommon.xcframework"
GRAPH="$WORK/common/frameworks/graph_libraries"

printf '_OBJC_CLASS_$_NKFaceLandmarker\n_OBJC_METACLASS_$_NKFaceLandmarker\n' > "$WORK/exports.txt"

build_slice() { # sdk slice archs... ; graph lib
  local sdk=$1 slice=$2 graph=$3; shift 3
  local fw="$WORK/$slice/NiksMediaPipe.framework"
  rm -rf "$WORK/$slice"; mkdir -p "$fw/Headers" "$fw/Modules"
  local arch_flags=() ; for a in "$@"; do arch_flags+=(-arch "$a"); done
  local target_flag="-mios-version-min=$MIN_IOS"
  [ "$sdk" = iphonesimulator ] && target_flag="-mios-simulator-version-min=$MIN_IOS"
  # -ObjC: OBRIGATÓRIO. Sem ele, as CATEGORIAS ObjC dos .a do MediaPipe (ex.: `NSString
  # (Helpers)`, que define `-cppString`) não entram no link e o app CRASHA ao abrir o scan
  # com "unrecognized selector sent to instance __NSCFConstantString" (TestFlight do
  # 1.0.56, out/2026). -g + dsymutil: dSYM para os crashes virem com a linha exata.
  # Compila e linka em passos separados: o dsymutil precisa do .o (que o clang apagaria).
  local obj="$WORK/$slice/NiksMediaPipe.o"
  xcrun --sdk "$sdk" clang -c -fobjc-arc -fmodules -g "${arch_flags[@]}" "$target_flag" \
    -F "$VXC/$slice" -F "$CXC/$slice" "$HERE/NiksMediaPipe.m" -o "$obj"
  xcrun --sdk "$sdk" clang -dynamiclib "${arch_flags[@]}" "$target_flag" \
    -F "$VXC/$slice" -F "$CXC/$slice" \
    "$obj" -o "$fw/NiksMediaPipe" \
    -framework MediaPipeTasksVision -framework MediaPipeTasksCommon \
    -Wl,-force_load,"$GRAPH/$graph" \
    -framework Foundation -framework UIKit -framework Accelerate -framework CoreMedia \
    -framework AssetsLibrary -framework CoreFoundation -framework CoreGraphics -framework CoreImage \
    -framework QuartzCore -framework AVFoundation -framework CoreVideo -framework Metal \
    -framework MetalKit -framework OpenGLES -lc++ \
    -install_name @rpath/NiksMediaPipe.framework/NiksMediaPipe \
    -Wl,-exported_symbols_list,"$WORK/exports.txt" -Wl,-ObjC -Wl,-dead_strip -Wl,-dead_strip_dylibs
  # dSYM a partir do binário ainda com os símbolos locais; depois enxuga o que vai no app.
  rm -rf "$WORK/$slice/NiksMediaPipe.framework.dSYM"
  xcrun dsymutil "$fw/NiksMediaPipe" -o "$WORK/$slice/NiksMediaPipe.framework.dSYM"
  xcrun strip -x "$fw/NiksMediaPipe"
  cp "$HERE/NiksMediaPipe.h" "$fw/Headers/"
  printf 'framework module NiksMediaPipe {\n  umbrella header "NiksMediaPipe.h"\n  export *\n}\n' > "$fw/Modules/module.modulemap"
  local platform=iPhoneOS; [ "$sdk" = iphonesimulator ] && platform=iPhoneSimulator
  cat > "$fw/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>NiksMediaPipe</string>
  <key>CFBundleIdentifier</key><string>br.com.niksai.NiksMediaPipe</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>NiksMediaPipe</string>
  <key>CFBundlePackageType</key><string>FMWK</string>
  <key>CFBundleShortVersionString</key><string>$MP_VERSION</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleSupportedPlatforms</key><array><string>$platform</string></array>
  <key>MinimumOSVersion</key><string>$MIN_IOS</string>
</dict></plist>
PLIST
}

build_slice iphoneos ios-arm64 libMediaPipeTasksCommon_device_graph.a arm64
build_slice iphonesimulator ios-arm64_x86_64-simulator libMediaPipeTasksCommon_simulator_graph.a arm64 x86_64

rm -rf "$OUT"
xcodebuild -create-xcframework \
  -framework "$WORK/ios-arm64/NiksMediaPipe.framework" \
  -debug-symbols "$WORK/ios-arm64/NiksMediaPipe.framework.dSYM" \
  -framework "$WORK/ios-arm64_x86_64-simulator/NiksMediaPipe.framework" \
  -debug-symbols "$WORK/ios-arm64_x86_64-simulator/NiksMediaPipe.framework.dSYM" \
  -output "$OUT"

echo "Exportado (deve ser só NKFaceLandmarker):"
nm -gU "$OUT/ios-arm64/NiksMediaPipe.framework/NiksMediaPipe"
# Trava contra a volta do crash: as categorias do MediaPipe TÊM de estar no binário.
if ! xcrun otool -ov "$OUT/ios-arm64/NiksMediaPipe.framework/NiksMediaPipe" \
    | awk '/__objc_catlist/{f=1} f&&/^Contents of/&&!/catlist/{f=0} f' | grep -q '_OBJC_CLASS_\$_NSString'; then
  echo "ERRO: categoria NSString(Helpers)/cppString ausente — o app crasharia no scan." >&2
  exit 1
fi
echo "Categorias do MediaPipe presentes (cppString ok)."
du -sh "$OUT"
