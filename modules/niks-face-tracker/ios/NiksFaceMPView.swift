import ExpoModulesCore
import AVFoundation
import CoreImage
import ImageIO
import NiksMediaPipe
import Metal
import MetalKit
import simd
import UIKit

// ── Scan com o MediaPipe Face Landmarker ─────────────────────────────────────────
// A câmera do scan (`app/(scan)/camera.tsx`). SEM ARKit de propósito: a Apple recusou o
// 1.0.56 (1) por 2.5.1/4.2.1 por causa da antiga versão em ARKit (removida em out/2026).
// Câmera frontal comum (`AVCaptureSession`, sem câmera de profundidade) + Face Landmarker
// do Google (478 pontos por quadro, com profundidade relativa `z`), isolado na framework
// `NiksMediaPipe` (ver o podspec).
//
// O que esta view faz — o mesmo que a antiga em ARKit fazia (a usuária não percebe):
//   • mostra a câmera frontal espelhada (o quadro é desenhado em Metal JUNTO com a malha
//     calculada a partir DELE: a malha nunca fica "atrasada" em relação ao vídeo — é o
//     que o ARSCNView faz);
//   • desenha a malha: uma grade regular de "quadradinhos" (~1.200 pontos, a densidade
//     da malha do ARKit) presa à superfície do rosto. A grade foi gerada uma vez sobre o
//     rosto canônico do MediaPipe (`MediaPipe/gen_face_grid.py` → `niks_face_grid.json`):
//     cada ponto da grade fica num triângulo do Face Landmarker, com pesos fixos, então
//     a grade acompanha o rosto real a cada quadro. Linhas de 1 px SOMADAS à imagem
//     (brilho), esmaecendo na borda de fora; olhos e boca vazados; linha de scan = corte
//     do rosto num plano horizontal DO ROSTO (curva com ele), rastro e brilhos com as
//     MESMAS fórmulas e constantes do ARKit. Oclusor invisível (o próprio rosto, um pouco
//     para trás) esconde o que fica atrás do nariz e o lado que vira;
//   • fundo DESFOCADO ao vivo com o furo do oval (prop `hole`), técnica do Vision;
//   • manda ao JS (`onFace`) o MESMO `FaceFrame` do ARKit (coordenadas em pontos da tela):
//     caixa, giro (`yaw`/`pitch` pela normal do rosto NA TELA — sem convenção de eixo),
//     inclinação, "nariz" e luz (EXIF);
//   • `takePhoto`: foto do QUADRO AO VIVO, sem som, em pé e SEM espelhar.
//
// Tremor: o modelo dá pontos um pouco "nervosos" quadro a quadro; cada coordenada passa
// por um filtro One Euro (parado = bem filtrado; em movimento = quase sem atraso).
final class NiksFaceMPView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate, MTKViewDelegate {
  let onFace = EventDispatcher()
  let onReady = EventDispatcher()

  // Câmera.
  private let session = AVCaptureSession()
  private let output = AVCaptureVideoDataOutput()
  private static let sessionQueue = DispatchQueue(label: "niks.face.mp.session")
  private let videoQueue = DispatchQueue(label: "niks.face.mp.video")
  private var configured = false
  private var landmarker: NiksFaceLandmarker?
  private var lastTs = -1
  /// Último quadro inteiro (só na `videoQueue`): é dele que sai a foto silenciosa.
  private var latestBuffer: CVPixelBuffer?

  // Desenho (Metal).
  private let mtkView: MTKView
  private let renderer: Renderer?
  private let lock = NSLock()
  private var pending: Frame?          // último quadro com os pontos dele (videoQueue → main)
  private var shown: Frame?
  private var viewSize = CGSize.zero   // lido na videoQueue

  // Fundo desfocado (igual ao do NiksFaceTrackerView).
  private let bgLayer = CALayer()
  private let imageLayer = CALayer()
  private let dimLayer = CALayer()
  private let maskLayer = CAShapeLayer()
  private var hole: CGRect?
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  private var lastBlur: CFTimeInterval = 0
  private static let downscaleWidth: CGFloat = 80

  // Malha (constantes herdadas da antiga versão em ARKit).
  private var baseAlpha: Float = 0.32
  private var peakAlpha: Float = 0.95
  private static let sweepMs: Float = 2600
  private static let trailMs: Float = 520
  private let startTime = CACurrentMediaTime()
  private var faceVisibleSince: CFTimeInterval?

  // Eventos e filtro.
  private var lastEmit: CFTimeInterval = 0
  private var readySent = false
  private var filter = OneEuro(minCutoff: 1.0, beta: 0.012, dCutoff: 1.0)
  private var stats = (n: 0, ms: 0.0, at: CACurrentMediaTime())

  struct Frame {
    let texture: CVMetalTexture
    let imgW: Int
    let imgH: Int
    /// Pontos do rosto em pontos da TELA: x, y (origem no topo) e `toward` (quanto o ponto
    /// está mais perto da câmera, na mesma escala). `nil` = sem rosto.
    let pts: [SIMD3<Float>]?
  }

  required init(appContext: AppContext? = nil) {
    let device = MTLCreateSystemDefaultDevice()
    mtkView = MTKView(frame: .zero, device: device)
    renderer = device.flatMap { Renderer(device: $0) }
    super.init(appContext: appContext)
    clipsToBounds = true
    isUserInteractionEnabled = false
    backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1)

    mtkView.colorPixelFormat = .bgra8Unorm_srgb    // mistura em espaço linear, como o SceneKit
    mtkView.depthStencilPixelFormat = .depth32Float
    mtkView.clearColor = MTLClearColor(red: 0.01, green: 0.01, blue: 0.01, alpha: 1)
    mtkView.clearDepth = 1
    mtkView.preferredFramesPerSecond = 60
    mtkView.isPaused = false
    mtkView.enableSetNeedsDisplay = false
    mtkView.isUserInteractionEnabled = false
    mtkView.delegate = self
    addSubview(mtkView)

    bgLayer.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1).cgColor
    imageLayer.contentsGravity = .resizeAspectFill
    imageLayer.magnificationFilter = .trilinear
    imageLayer.masksToBounds = true
    dimLayer.backgroundColor = UIColor.black.cgColor
    dimLayer.opacity = 0.35
    maskLayer.fillRule = .evenOdd
    bgLayer.addSublayer(imageLayer)
    bgLayer.addSublayer(dimLayer)
    bgLayer.mask = maskLayer
    layer.addSublayer(bgLayer)
  }

  /// Câmera frontal + modelo e grade no binário. (Não exige câmera de profundidade.)
  static var isSupported: Bool {
    AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) != nil
      && MPGrid.shared != nil && MPGrid.modelPath != nil && MTLCreateSystemDefaultDevice() != nil
  }

  // MARK: - Ciclo de vida

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { start() } else { stop() }
  }

  private func start() {
    Self.sessionQueue.async { [weak self] in
      guard let self else { return }
      if !self.configured { self.configure() }
      if self.landmarker == nil { self.landmarker = Self.makeLandmarker() }
      if self.configured, !self.session.isRunning { self.session.startRunning() }
    }
  }

  private func stop() {
    Self.sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
  }

  private func configure() {
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
          let input = try? AVCaptureDeviceInput(device: device)
    else { return }
    session.beginConfiguration()
    // 1080×1920 em pé: a foto sai do quadro ao vivo, então é essa resolução que vai à IA.
    session.sessionPreset = session.canSetSessionPreset(.hd1920x1080) ? .hd1920x1080 : .high
    if session.canAddInput(input) { session.addInput(input) }
    output.alwaysDiscardsLateVideoFrames = true
    // BGRA: é o que o MediaPipe lê e o que vira textura direto.
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    output.setSampleBufferDelegate(self, queue: videoQueue)
    if session.canAddOutput(output) { session.addOutput(output) }
    if let connection = output.connection(with: .video) {
      // Em pé e espelhado: o quadro já está no sentido da tela (como a prévia da selfie).
      if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
      if connection.isVideoMirroringSupported {
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = true
      }
    }
    session.commitConfiguration()
    configured = true
  }

  /// O MediaPipe vem isolado na framework `NiksMediaPipe` (ver o podspec: a `glog` dele
  /// colide com a do React Native se for linkado direto no app).
  private static func makeLandmarker() -> NiksFaceLandmarker? {
    guard let path = MPGrid.modelPath, let lm = NiksFaceLandmarker(modelPath: path, useGPU: true) else {
      NSLog("[niks-mp] Face Landmarker não abriu")
      return nil
    }
    NSLog("[niks-mp] Face Landmarker pronto (%@)", lm.usesGPU ? "GPU" : "CPU")
    return lm
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    mtkView.frame = bounds
    lock.lock(); viewSize = bounds.size; lock.unlock()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    bgLayer.frame = bounds
    imageLayer.frame = bounds
    dimLayer.frame = bounds
    maskLayer.frame = bounds
    updateMask()
    CATransaction.commit()
  }

  // MARK: - Props

  func setHole(_ value: [Double]) {
    hole = value.count == 4 ? CGRect(x: value[0], y: value[1], width: value[2], height: value[3]) : nil
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    updateMask()
    CATransaction.commit()
  }

  func setDim(_ value: Double) { dimLayer.opacity = Float(max(0, min(1, value))) }
  func setMeshBase(_ value: Double) { baseAlpha = Float(max(0, min(1, value))) }
  func setMeshPeak(_ value: Double) { peakAlpha = Float(max(0, min(1, value))) }

  private func updateMask() {
    let path = UIBezierPath(rect: bounds)
    if let hole { path.append(UIBezierPath(ovalIn: hole)) }
    maskLayer.path = path.cgPath
  }

  // MARK: - Quadros

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer), let renderer else { return }
    latestBuffer = buffer
    let imgW = CVPixelBufferGetWidth(buffer), imgH = CVPixelBufferGetHeight(buffer)
    lock.lock(); let size = viewSize; lock.unlock()
    guard imgW > 0, imgH > 0, size.width > 0, size.height > 0 else { return }
    let now = CACurrentMediaTime()
    if !readySent {
      readySent = true
      DispatchQueue.main.async { [weak self] in self?.onReady([:]) }
    }
    if now - lastBlur >= 1.0 / 20.0 {
      lastBlur = now
      drawBackground(buffer)
    }
    let light = Self.sceneBrightness(sampleBuffer)

    // Rosto (modo vídeo: síncrono, o resultado é DESTE quadro).
    // 478 × (x, y, z), x/y em frações do quadro, z na escala do x (menor = mais perto).
    var landmarks: [SIMD3<Float>]?
    let ts = Int(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000)
    if let landmarker, ts > lastTs {
      lastTs = ts
      let t0 = CACurrentMediaTime()
      if let data = landmarker.detect(sampleBuffer, timestampMs: ts) {
        landmarks = data.withUnsafeBytes { raw in
          let f = raw.bindMemory(to: Float.self)
          return (0..<(f.count / 3)).map { SIMD3(f[3 * $0], f[3 * $0 + 1], f[3 * $0 + 2]) }
        }
      }
      logTiming(CACurrentMediaTime() - t0)
    }

    // Quadro → pontos da tela ("cover", como a prévia).
    var pts: [SIMD3<Float>]?
    if let landmarks, landmarks.count >= 468 {
      let scale = Float(max(size.width / CGFloat(imgW), size.height / CGFloat(imgH)))
      let offX = (Float(size.width) - Float(imgW) * scale) / 2
      let offY = (Float(size.height) - Float(imgH) * scale) / 2
      let sw = Float(imgW) * scale, sh = Float(imgH) * scale
      // `z` do MediaPipe: na escala do x, MENOR = mais perto da câmera.
      let raw = landmarks.map { SIMD3(offX + $0.x * sw, offY + $0.y * sh, -$0.z * sw) }
      pts = filter.apply(raw, at: now)
    } else {
      filter.reset()
    }

    var cvTex: CVMetalTexture?
    if let cache = renderer.textureCache {
      CVMetalTextureCacheCreateTextureFromImage(nil, cache, buffer, nil, .bgra8Unorm_srgb, imgW, imgH, 0, &cvTex)
    }
    if let cvTex {
      lock.lock(); pending = Frame(texture: cvTex, imgW: imgW, imgH: imgH, pts: pts); lock.unlock()
    }

    if let pts {
      if now - lastEmit >= 1.0 / 30.0 {
        lastEmit = now
        emitFace(pts, size: size, light: light)
      }
    } else if now - lastEmit >= 0.1 {
      lastEmit = now
      var payload: [String: Any] = ["detected": false, "imgW": Double(size.width), "imgH": Double(size.height)]
      if let light { payload["light"] = light }
      DispatchQueue.main.async { [weak self] in self?.onFace(payload) }
    }
  }

  private func logTiming(_ dt: CFTimeInterval) {
    #if DEBUG
    stats.n += 1
    stats.ms += dt * 1000
    let now = CACurrentMediaTime()
    if now - stats.at >= 3 {
      NSLog("[niks-mp] %.1f quadros/s, %.1f ms por quadro no modelo", Double(stats.n) / (now - stats.at), stats.ms / Double(max(1, stats.n)))
      stats = (0, 0, now)
    }
    #endif
  }

  /// Fundo desfocado a partir do quadro (já em pé e espelhado, como a prévia).
  private func drawBackground(_ buffer: CVPixelBuffer) {
    let source = CIImage(cvPixelBuffer: buffer)
    guard source.extent.width > 0 else { return }
    let scale = Self.downscaleWidth / source.extent.width
    let small = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let softened = small.clampedToExtent().applyingGaussianBlur(sigma: 1.6).cropped(to: small.extent)
    guard let cgImage = ciContext.createCGImage(softened, from: small.extent) else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      self.imageLayer.contents = cgImage
      CATransaction.commit()
    }
  }

  /// Brilho da cena (APEX, o `BrightnessValue` do EXIF do quadro) — a mesma escala do Vision.
  private static func sceneBrightness(_ sampleBuffer: CMSampleBuffer) -> Double? {
    guard let attachments = CMCopyDictionaryOfAttachments(
      allocator: kCFAllocatorDefault, target: sampleBuffer, attachmentMode: kCMAttachmentMode_ShouldPropagate
    ) as? [String: Any],
      let exif = attachments[kCGImagePropertyExifDictionary as String] as? [String: Any],
      let value = exif[kCGImagePropertyExifBrightnessValue as String] as? NSNumber
    else { return nil }
    return value.doubleValue
  }

  // MARK: - Dados do rosto para o JS (mesmo formato do ARKit)

  private func emitFace(_ p: [SIMD3<Float>], size: CGSize, light: Double?) {
    // Caixa: a borda de fora dos pontos, apertada para a escala da caixa do Vision (os
    // pontos vão até a testa e perto das orelhas; a caixa do Vision, não) — como no ARKit.
    var minX = Float.greatestFiniteMagnitude, maxX = -Float.greatestFiniteMagnitude
    var minY = Float.greatestFiniteMagnitude, maxY = -Float.greatestFiniteMagnitude
    for q in p.prefix(468) {
      minX = min(minX, q.x); maxX = max(maxX, q.x); minY = min(minY, q.y); maxY = max(maxY, q.y)
    }
    let cx = Double(minX + maxX) / 2, cy = Double(minY + maxY) / 2
    let w = Double(maxX - minX) * 0.85, h = Double(maxY - minY) * 0.85

    // Para onde o rosto aponta, NA TELA: normal do plano bochecha↔bochecha × queixo↔testa
    // (no rosto canônico ela fica a <1° da frente). Eixos: x direita, y CIMA, z para a câmera.
    let s = { (i: Int) in SIMD3<Double>(Double(p[i].x), -Double(p[i].y), Double(p[i].z)) }
    let right = s(454) - s(234)
    let up = s(10) - s(152)
    var n = simd_normalize(simd_cross(right, up))
    if n.z < 0 { n = -n }
    let theta = acos(max(-1, min(1, n.z)))
    let vx = n.x, vy = -n.y               // na tela: x direita, y para baixo
    let len = hypot(vx, vy)
    let yawS = len > 1e-4 ? theta * vx / len : 0
    let pitchDown = len > 1e-4 ? theta * vy / len : 0
    // Inclinação: a linha dos cantos de fora dos olhos.
    var roll = atan2(Double(p[263].y - p[33].y), Double(p[263].x - p[33].x))
    if roll > .pi / 2 { roll -= .pi } else if roll < -.pi / 2 { roll += .pi }

    var payload: [String: Any] = [
      "detected": true,
      "x": (cx - w / 2) / Double(size.width), "y": (cy - h / 2) / Double(size.height),
      "w": w / Double(size.width), "h": h / Double(size.height),
      "imgW": Double(size.width), "imgH": Double(size.height),
      "yaw": yawS, "pitch": pitchDown, "roll": roll,
      // Mesma escala do "nariz" do Vision (0,14 ≈ cabeça bem virada, ~25°), como no ARKit.
      "nose": 0.32 * yawS,
    ]
    if let light { payload["light"] = light }
    DispatchQueue.main.async { [weak self] in self?.onFace(payload) }
  }

  // MARK: - Desenho

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  func draw(in view: MTKView) {
    guard let renderer, let grid = MPGrid.shared else { return }
    lock.lock()
    if let p = pending { shown = p; pending = nil }
    lock.unlock()
    let now = CACurrentMediaTime()
    var mesh: Renderer.Mesh?
    if let frame = shown, let pts = frame.pts {
      if faceVisibleSince == nil { faceVisibleSince = now }
      let fadeIn = Float(min(1, (now - (faceVisibleSince ?? now)) / 0.25))
      mesh = buildMesh(pts, grid, t: Float(now - startTime) * 1000, opacity: fadeIn)
    } else {
      faceVisibleSince = nil
    }
    renderer.draw(in: view, frame: shown, mesh: mesh, size: bounds.size)
  }

  private static func ease(_ u: Float) -> Float { u < 0.5 ? 2 * u * u : 1 - powf(-2 * u + 2, 2) / 2 }
  private static func easeInv(_ q: Float) -> Float { q < 0.5 ? sqrtf(q / 2) : 1 - sqrtf((1 - q) / 2) }

  /// Há quanto tempo (ms) a linha de scan passou pela altura `q` (0 = topo, 1 = queixo).
  private static func sinceScan(_ q: Float, _ t: Float) -> Float {
    let half = Int(t / sweepMs)
    let tau = fmodf(t, sweepMs) / sweepMs
    let down = half % 2 == 0
    let pos = down ? ease(tau) : 1 - ease(tau)
    let passedNow = down ? q <= pos : q >= pos
    if passedNow { return (tau - easeInv(down ? q : 1 - q)) * sweepMs }
    if half == 0 { return .infinity }
    return (tau + 1 - easeInv(down ? 1 - q : q)) * sweepMs
  }

  /// A malha do quadro: posição de cada ponto da grade (pesos fixos no triângulo dele),
  /// intensidade (repouso + rastro + brilho da linha) e a linha de scan. Fórmulas do ARKit;
  /// a "altura do rosto" é a do rosto canônico (cm), então a linha curva com o rosto.
  private func buildMesh(_ p: [SIMD3<Float>], _ g: MPGrid, t: Float, opacity: Float) -> Renderer.Mesh {
    let n = g.count
    let span = max(0.001, g.maxY - g.minY)
    let cyc = fmodf(t, 2 * Self.sweepMs) / Self.sweepMs
    let scanY = g.maxY - Self.ease(cyc < 1 ? cyc : 2 - cyc) * span
    let band: Float = 0.3                     // 3 mm (o ARKit usa 0,003 m)

    var verts = [SIMD4<Float>](repeating: .zero, count: n)
    var glints: [UInt16] = []
    for i in 0..<n {
      let a = p[g.i0[i]], b = p[g.i1[i]], c = p[g.i2[i]]
      let q = a * g.w0[i] + b * g.w1[i] + c * g.w2[i]
      let y = g.nodeY[i]
      let age = Self.sinceScan((g.maxY - y) / span, t)
      let trail: Float = age.isInfinite ? 0 : expf(-age / Self.trailMs)
      let d = (y - scanY) / band
      let glow = 0.5 * expf(-d * d)
      let alpha = min(1, (baseAlpha + (peakAlpha - baseAlpha) * trail + glow) * g.fade[i] * opacity)
      verts[i] = SIMD4(q.x, q.y, q.z, alpha)
      if g.glint[i], trail > 0.4, g.fade[i] > 0.5 { glints.append(UInt16(i)) }
    }

    // Linha de scan: o corte da grade pela altura `scanY` do rosto.
    var scan: [SIMD4<Float>] = []
    var k = 0
    while k + 2 < g.cells.count {
      let ids = (g.cells[k], g.cells[k + 1], g.cells[k + 2])
      k += 3
      var cut: [SIMD4<Float>] = []
      for (ia, ib) in [(ids.0, ids.1), (ids.1, ids.2), (ids.2, ids.0)] {
        let ya = g.nodeY[ia] - scanY, yb = g.nodeY[ib] - scanY
        if (ya < 0) != (yb < 0) {
          let f = ya / (ya - yb)
          let pa = verts[ia], pb = verts[ib]
          let pos = pa + (pb - pa) * f
          let fd = g.fade[ia] + (g.fade[ib] - g.fade[ia]) * f
          cut.append(SIMD4(pos.x, pos.y, pos.z, min(1, fd * opacity)))
        }
      }
      if cut.count == 2 { scan.append(contentsOf: cut) }
    }

    // Oclusor: o rosto (468 pontos) um pouco PARA TRÁS na direção da câmera — esconde o que
    // fica atrás do nariz e o lado que vira, sem brigar com as linhas da frente.
    let faceW = abs(p[454].x - p[234].x)
    let back = max(1, 0.012 * faceW)
    let occ = p.prefix(468).map { SIMD4($0.x, $0.y, $0.z - back, 0) }
    return Renderer.Mesh(nodes: verts, glints: glints, scan: scan, occluder: occ)
  }

  // MARK: - Foto

  /// Foto do último quadro ao vivo: em pé, SEM espelhar (o quadro vem espelhado, para casar
  /// com a prévia — aqui desfaz) e sem som. → { uri, width, height }
  func takePhoto(_ promise: Promise) {
    videoQueue.async { [weak self] in
      guard let self, let buffer = self.latestBuffer else {
        promise.reject("E_MP_PHOTO", "Sem quadro da câmera")
        return
      }
      let image = CIImage(cvPixelBuffer: buffer).oriented(.upMirrored)
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
            let data = self.ciContext.jpegRepresentation(
              of: image, colorSpace: space,
              options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.92]
            )
      else {
        promise.reject("E_MP_PHOTO", "Falha ao gerar a foto")
        return
      }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("niks-mp-\(UUID().uuidString).jpg")
      do {
        try data.write(to: url)
        promise.resolve(["uri": url.absoluteString, "width": image.extent.width, "height": image.extent.height])
      } catch {
        promise.reject("E_MP_PHOTO", "Falha ao salvar a foto")
      }
    }
  }
}

// MARK: - Grade da malha (gerada uma vez: MediaPipe/gen_face_grid.py)

final class MPGrid {
  static let bundle: Bundle? = {
    for base in [Bundle.main, Bundle(for: MPGrid.self)] {
      if let url = base.url(forResource: "NiksFaceMP", withExtension: "bundle"), let b = Bundle(url: url) { return b }
    }
    return nil
  }()
  static let modelPath: String? = bundle?.path(forResource: "face_landmarker", ofType: "task")
  static let shared: MPGrid? = {
    guard let url = bundle?.url(forResource: "niks_face_grid", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let raw = try? JSONDecoder().decode(Raw.self, from: data)
    else { return nil }
    return MPGrid(raw)
  }()

  private struct Raw: Decodable {
    let tris: [UInt16]
    let nodeTri: [Int]
    let nodeB: [Float]
    let nodeY: [Float]
    let fade: [Float]
    let edges: [UInt16]
    let cells: [Int]
  }

  let count: Int
  let i0: [Int], i1: [Int], i2: [Int]
  let w0: [Float], w1: [Float], w2: [Float]
  let nodeY: [Float]
  let fade: [Float]
  let glint: [Bool]          // pontos que podem brilhar no rastro (~35%, mesma regra do ARKit)
  let edges: [UInt16]
  let cells: [Int]
  let tris: [UInt16]         // triângulos do Face Landmarker (oclusor)
  let minY: Float, maxY: Float

  private init(_ r: Raw) {
    count = r.nodeTri.count
    var a = [Int](), b = [Int](), c = [Int](), x = [Float](), y = [Float](), z = [Float]()
    for k in 0..<count {
      let t = r.nodeTri[k] * 3
      a.append(Int(r.tris[t])); b.append(Int(r.tris[t + 1])); c.append(Int(r.tris[t + 2]))
      let b1 = r.nodeB[2 * k], b2 = r.nodeB[2 * k + 1]
      x.append(1 - b1 - b2); y.append(b1); z.append(b2)
    }
    i0 = a; i1 = b; i2 = c; w0 = x; w1 = y; w2 = z
    nodeY = r.nodeY
    fade = r.fade
    glint = (0..<count).map { i in
      let s = sinf(Float(i) * 12.9898) * 43758.5453
      return s - floorf(s) < 0.35
    }
    edges = r.edges
    cells = r.cells
    tris = r.tris
    minY = r.nodeY.min() ?? -1
    maxY = r.nodeY.max() ?? 1
  }
}

// MARK: - Filtro One Euro (por coordenada)

private struct OneEuro {
  let minCutoff: Float
  let beta: Float
  let dCutoff: Float
  private var x: [SIMD3<Float>] = []
  private var dx: [SIMD3<Float>] = []
  private var last: CFTimeInterval = 0

  init(minCutoff: Float, beta: Float, dCutoff: Float) {
    self.minCutoff = minCutoff
    self.beta = beta
    self.dCutoff = dCutoff
  }

  mutating func reset() { x = []; dx = [] }

  private static func alpha(_ cutoff: SIMD3<Float>, _ dt: Float) -> SIMD3<Float> {
    let r = 2 * Float.pi * cutoff * dt
    return r / (r + 1)
  }

  mutating func apply(_ v: [SIMD3<Float>], at t: CFTimeInterval) -> [SIMD3<Float>] {
    let dt = Float(t - last)
    last = t
    guard x.count == v.count, dt > 0, dt < 0.5 else {
      x = v
      dx = [SIMD3<Float>](repeating: .zero, count: v.count)
      return v
    }
    let ad = Self.alpha(SIMD3(repeating: dCutoff), dt)
    for i in 0..<v.count {
      let d = (v[i] - x[i]) / dt
      dx[i] = dx[i] + ad * (d - dx[i])
      let cutoff = SIMD3(repeating: minCutoff) + beta * simd_abs(dx[i])
      x[i] = x[i] + Self.alpha(cutoff, dt) * (v[i] - x[i])
    }
    return x
  }
}

// MARK: - Metal: câmera + oclusor + malha (linhas de 1 px somadas à imagem)

private final class Renderer {
  struct Mesh {
    let nodes: [SIMD4<Float>]      // x, y (pontos da tela), toward, intensidade
    let glints: [UInt16]
    let scan: [SIMD4<Float>]       // pares de pontos (segmentos)
    let occluder: [SIMD4<Float>]
  }

  let device: MTLDevice
  let queue: MTLCommandQueue
  var textureCache: CVMetalTextureCache?
  private let bgPipeline: MTLRenderPipelineState
  private let occPipeline: MTLRenderPipelineState
  private let linePipeline: MTLRenderPipelineState
  private let pointPipeline: MTLRenderPipelineState
  private let depthOff: MTLDepthStencilState
  private let depthWrite: MTLDepthStencilState
  private let depthRead: MTLDepthStencilState
  private var edgeBuffer: MTLBuffer?
  private var triBuffer: MTLBuffer?
  private var frameCount = 0

  init?(device: MTLDevice) {
    guard let queue = device.makeCommandQueue(),
          let lib = try? device.makeLibrary(source: Self.shaders, options: nil)
    else { return nil }
    self.device = device
    self.queue = queue
    CVMetalTextureCacheCreate(nil, nil, device, nil, &textureCache)

    func pipeline(_ v: String, _ f: String, additive: Bool, colorWrite: Bool = true) -> MTLRenderPipelineState? {
      let d = MTLRenderPipelineDescriptor()
      d.vertexFunction = lib.makeFunction(name: v)
      d.fragmentFunction = lib.makeFunction(name: f)
      d.depthAttachmentPixelFormat = .depth32Float
      let c = d.colorAttachments[0]!
      c.pixelFormat = .bgra8Unorm_srgb
      if !colorWrite { c.writeMask = [] }
      if additive {
        // Somado à imagem (brilho), como o `blendMode = .add` do SceneKit no ARKit.
        c.isBlendingEnabled = true
        c.rgbBlendOperation = .add
        c.alphaBlendOperation = .add
        c.sourceRGBBlendFactor = .one
        c.destinationRGBBlendFactor = .one
        c.sourceAlphaBlendFactor = .zero
        c.destinationAlphaBlendFactor = .one
      }
      return try? device.makeRenderPipelineState(descriptor: d)
    }
    func depth(_ compare: MTLCompareFunction, write: Bool) -> MTLDepthStencilState? {
      let d = MTLDepthStencilDescriptor()
      d.depthCompareFunction = compare
      d.isDepthWriteEnabled = write
      return device.makeDepthStencilState(descriptor: d)
    }
    guard let bg = pipeline("bg_vertex", "bg_fragment", additive: false),
          let occ = pipeline("mesh_vertex", "line_fragment", additive: false, colorWrite: false),
          let line = pipeline("mesh_vertex", "line_fragment", additive: true),
          let point = pipeline("mesh_vertex", "point_fragment", additive: true),
          let off = depth(.always, write: false),
          let write = depth(.less, write: true),
          let read = depth(.lessEqual, write: false)
    else { return nil }
    bgPipeline = bg; occPipeline = occ; linePipeline = line; pointPipeline = point
    depthOff = off; depthWrite = write; depthRead = read
  }

  func draw(in view: MTKView, frame: NiksFaceMPView.Frame?, mesh: Mesh?, size: CGSize) {
    guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
          let cmd = queue.makeCommandBuffer(), let enc = cmd.makeRenderCommandEncoder(descriptor: pass),
          size.width > 0, size.height > 0
    else { return }
    let W = Float(size.width), H = Float(size.height)

    // Câmera em "cover" (o quadro já vem em pé e espelhado).
    if let frame, let tex = CVMetalTextureGetTexture(frame.texture) {
      let scale = max(W / Float(frame.imgW), H / Float(frame.imgH))
      let sw = Float(frame.imgW) * scale / W, sh = Float(frame.imgH) * scale / H
      let quad: [SIMD4<Float>] = [
        SIMD4(-sw, sh, 0, 0), SIMD4(sw, sh, 1, 0), SIMD4(-sw, -sh, 0, 1), SIMD4(sw, -sh, 1, 1),
      ]
      enc.setRenderPipelineState(bgPipeline)
      enc.setDepthStencilState(depthOff)
      enc.setVertexBytes(quad, length: MemoryLayout<SIMD4<Float>>.stride * 4, index: 0)
      enc.setFragmentTexture(tex, index: 0)
      enc.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    if let mesh, let grid = MPGrid.shared {
      if edgeBuffer == nil {
        edgeBuffer = device.makeBuffer(bytes: grid.edges, length: grid.edges.count * 2)
        triBuffer = device.makeBuffer(bytes: grid.tris, length: grid.tris.count * 2)
      }
      // x, y em pontos → recorte; profundidade: mais perto da câmera = menor.
      let pointPx = Float(view.contentScaleFactor) * 2
      var u = SIMD4<Float>(2 / W, 2 / H, 1 / 4000, pointPx)
      let stride = MemoryLayout<SIMD4<Float>>.stride

      if let occBuf = device.makeBuffer(bytes: mesh.occluder, length: mesh.occluder.count * stride), let triBuffer {
        enc.setRenderPipelineState(occPipeline)
        enc.setDepthStencilState(depthWrite)
        enc.setVertexBuffer(occBuf, offset: 0, index: 0)
        enc.setVertexBytes(&u, length: stride, index: 1)
        enc.drawIndexedPrimitives(type: .triangle, indexCount: grid.tris.count, indexType: .uint16, indexBuffer: triBuffer, indexBufferOffset: 0)
      }
      if let nodeBuf = device.makeBuffer(bytes: mesh.nodes, length: mesh.nodes.count * stride), let edgeBuffer {
        enc.setRenderPipelineState(linePipeline)
        enc.setDepthStencilState(depthRead)
        enc.setVertexBuffer(nodeBuf, offset: 0, index: 0)
        enc.setVertexBytes(&u, length: stride, index: 1)
        enc.drawIndexedPrimitives(type: .line, indexCount: grid.edges.count, indexType: .uint16, indexBuffer: edgeBuffer, indexBufferOffset: 0)
        if !mesh.glints.isEmpty, let gBuf = device.makeBuffer(bytes: mesh.glints, length: mesh.glints.count * 2) {
          enc.setRenderPipelineState(pointPipeline)
          enc.drawIndexedPrimitives(type: .point, indexCount: mesh.glints.count, indexType: .uint16, indexBuffer: gBuf, indexBufferOffset: 0)
        }
      }
      if !mesh.scan.isEmpty, let sBuf = device.makeBuffer(bytes: mesh.scan, length: mesh.scan.count * stride) {
        enc.setRenderPipelineState(linePipeline)
        enc.setDepthStencilState(depthRead)
        enc.setVertexBuffer(sBuf, offset: 0, index: 0)
        enc.setVertexBytes(&u, length: stride, index: 1)
        enc.drawPrimitives(type: .line, vertexStart: 0, vertexCount: mesh.scan.count)
      }
    }

    enc.endEncoding()
    cmd.present(drawable)
    cmd.commit()
    frameCount += 1
    if frameCount % 300 == 0, let textureCache { CVMetalTextureCacheFlush(textureCache, 0) }
  }

  private static let shaders = """
  #include <metal_stdlib>
  using namespace metal;

  struct BgOut { float4 pos [[position]]; float2 uv; };
  vertex BgOut bg_vertex(uint vid [[vertex_id]], constant float4 *quad [[buffer(0)]]) {
    BgOut o; float4 q = quad[vid];
    o.pos = float4(q.xy, 1, 1); o.uv = q.zw; return o;
  }
  fragment float4 bg_fragment(BgOut in [[stage_in]], texture2d<float> tex [[texture(0)]]) {
    constexpr sampler s(filter::linear, address::clamp_to_edge);
    return float4(tex.sample(s, in.uv).rgb, 1);
  }

  struct MeshOut { float4 pos [[position]]; float alpha; float size [[point_size]]; };
  vertex MeshOut mesh_vertex(uint vid [[vertex_id]], constant float4 *v [[buffer(0)]], constant float4 &u [[buffer(1)]]) {
    float4 p = v[vid]; MeshOut o;
    o.pos = float4(p.x * u.x - 1, 1 - p.y * u.y, 0.5 - p.z * u.z, 1);
    o.alpha = p.w; o.size = u.w; return o;
  }
  fragment float4 line_fragment(MeshOut in [[stage_in]]) {
    return float4(in.alpha, in.alpha, in.alpha, 1);
  }
  fragment float4 point_fragment(MeshOut in [[stage_in]], float2 pc [[point_coord]]) {
    float a = in.alpha * saturate(1.5 - 2.0 * length(pc - 0.5) * 1.5);
    return float4(a, a, a, 1);
  }
  """
}
