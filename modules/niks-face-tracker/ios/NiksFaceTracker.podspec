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
  s.frameworks = 'Vision', 'AVFoundation', 'ARKit', 'SceneKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
