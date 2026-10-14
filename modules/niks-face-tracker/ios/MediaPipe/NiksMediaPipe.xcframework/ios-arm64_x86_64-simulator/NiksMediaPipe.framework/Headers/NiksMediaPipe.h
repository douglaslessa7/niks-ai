#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>

NS_ASSUME_NONNULL_BEGIN

/// Face Landmarker do MediaPipe, ISOLADO numa framework dinâmica (`NiksMediaPipe`).
/// Por quê: o MediaPipe embute a sua própria `glog` (nova) e o React Native usa a dele
/// (0.3.5). Linkadas juntas no app, as duas se misturam e o app aborta ao carregar o JS
/// (out/2026). Aqui dentro só esta classe é exportada — a `glog` do MediaPipe fica invisível.
NS_SWIFT_NAME(NiksFaceLandmarker)
@interface NKFaceLandmarker : NSObject

/// Modo vídeo, 1 rosto. `useGPU` cai para a CPU se a GPU não abrir. `nil` se nada abrir.
- (nullable instancetype)initWithModelPath:(NSString *)modelPath useGPU:(BOOL)useGPU;

/// `YES` se abriu na GPU.
@property(nonatomic, readonly) BOOL usesGPU;

/// Pontos do rosto do quadro (BGRA, já em pé): 478 × (x, y, z) em `float`, x/y em
/// frações da imagem e z na escala do x (menor = mais perto). `nil` sem rosto ou com erro.
/// `timestampMs` tem de crescer a cada chamada.
- (nullable NSData *)detectSampleBuffer:(CMSampleBufferRef)sampleBuffer
                            timestampMs:(NSInteger)timestampMs
    NS_SWIFT_NAME(detect(_:timestampMs:));

- (instancetype)init NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
