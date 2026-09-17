Pod::Spec.new do |s|
  s.name           = 'NiksCameraMirror'
  s.version        = '1.0.0'
  s.summary        = 'Segunda previa (borrada) da MESMA sessao de camera do expo-camera'
  s.description    = 'Espelho de camera: anexa um AVCaptureVideoPreviewLayer extra a sessao que o expo-camera ja tem aberta, para desenhar o fundo borrado ao vivo da grade de colagem.'
  s.author         = 'NIKS'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
