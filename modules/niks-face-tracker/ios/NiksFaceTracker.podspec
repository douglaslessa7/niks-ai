Pod::Spec.new do |s|
  s.name           = 'NiksFaceTracker'
  s.version        = '1.0.0'
  s.summary        = 'Deteccao de rosto (Apple Vision) na MESMA sessao de camera do expo-camera'
  s.description    = 'Anexa um AVCaptureVideoDataOutput a sessao que o expo-camera ja tem aberta e roda o Vision em cada quadro: posicao do rosto, giro da cabeca e nariz, para o scan guiado do onboarding.'
  s.author         = 'NIKS'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Máscara do scan: MediaPipe Face Landmarker, câmera comum (sem ARKit — out/2026).
  # ⚠️ NÃO usar o pod `MediaPipeTasksVision` direto: a `glog` que ele embute colide com a
  # do React Native e o app aborta ao carregar o JS. O MediaPipe vem isolado nesta
  # framework DINÂMICA, que só exporta `NKFaceLandmarker` (montada por
  # `../mediapipe-wrapper/build.sh`).
  s.vendored_frameworks = 'MediaPipe/NiksMediaPipe.xcframework'
  s.frameworks = 'Vision', 'AVFoundation', 'Metal', 'MetalKit', 'CoreVideo'

  # Modelo do Face Landmarker + grade da malha (gerada por MediaPipe/gen_face_grid.py).
  s.resource_bundles = {
    'NiksFaceMP' => ['MediaPipe/face_landmarker.task', 'MediaPipe/niks_face_grid.json']
  }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Só a raiz: o `MediaPipe/` tem a framework pronta (com header próprio), não é fonte.
  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"
end
