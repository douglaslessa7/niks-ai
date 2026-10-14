#import "NiksMediaPipe.h"
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>

@implementation NKFaceLandmarker {
  MPPFaceLandmarker *_landmarker;
}

- (nullable instancetype)initWithModelPath:(NSString *)modelPath useGPU:(BOOL)useGPU {
  self = [super init];
  if (!self) return nil;
  NSArray<NSNumber *> *delegates = useGPU ? @[ @(MPPDelegateGPU), @(MPPDelegateCPU) ] : @[ @(MPPDelegateCPU) ];
  for (NSNumber *delegate in delegates) {
    MPPFaceLandmarkerOptions *options = [[MPPFaceLandmarkerOptions alloc] init];
    options.baseOptions.modelAssetPath = modelPath;
    options.baseOptions.delegate = (MPPDelegate)delegate.unsignedIntegerValue;
    options.runningMode = MPPRunningModeVideo;
    options.numFaces = 1;
    options.minFaceDetectionConfidence = 0.5;
    options.minFacePresenceConfidence = 0.5;
    options.minTrackingConfidence = 0.5;
    NSError *error = nil;
    MPPFaceLandmarker *landmarker = [[MPPFaceLandmarker alloc] initWithOptions:options error:&error];
    if (landmarker) {
      _landmarker = landmarker;
      _usesGPU = delegate.unsignedIntegerValue == MPPDelegateGPU;
      return self;
    }
  }
  return nil;
}

- (nullable NSData *)detectSampleBuffer:(CMSampleBufferRef)sampleBuffer timestampMs:(NSInteger)timestampMs {
  NSError *error = nil;
  MPPImage *image = [[MPPImage alloc] initWithSampleBuffer:sampleBuffer orientation:UIImageOrientationUp error:&error];
  if (!image) return nil;
  MPPFaceLandmarkerResult *result = [_landmarker detectVideoFrame:image timestampInMilliseconds:timestampMs error:&error];
  NSArray<MPPNormalizedLandmark *> *face = result.faceLandmarks.firstObject;
  if (face.count == 0) return nil;
  NSMutableData *data = [NSMutableData dataWithLength:face.count * 3 * sizeof(float)];
  float *out = (float *)data.mutableBytes;
  for (NSUInteger i = 0; i < face.count; i++) {
    MPPNormalizedLandmark *p = face[i];
    out[3 * i] = p.x;
    out[3 * i + 1] = p.y;
    out[3 * i + 2] = p.z;
  }
  return data;
}

@end
