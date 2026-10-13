import ExpoModulesCore
import AVFoundation
import CoreImage
import ImageIO
import UIKit
import Vision

// ── Rastreador de rosto ───────────────────────────────────────────────────────
// Scan do onboarding (`app/(scan)/camera.tsx`): diz ao JS, ~15 vezes por segundo, se
// há um rosto na câmera, onde ele está e para que lado a cabeça está virada. Usa o
// Apple Vision (vem no iOS — nenhuma lib de terceiros).
//
// ⚠️ MESMA TÉCNICA DO `modules/niks-camera-mirror` (ler o cabeçalho do Swift de lá):
// o `expo-camera` abre a sessão e o iOS só deixa UMA sessão segurar a câmera. Esta
// view não abre sessão nenhuma — se pendura na que já roda, com um
// `AVCaptureVideoDataOutput` (canal SEPARADO, convive com a prévia e com o disparo da
// foto). Nunca disputar a conexão de prévia; nunca configurar a sessão antes de ela
// estar rodando (a câmera levava ~10 s para abrir). A busca, o retry e o watchdog
// são cópias dos de lá, de propósito: os dois módulos ficam independentes.
//
// A view cobre a tela inteira e desenha o FUNDO DESFOCADO AO VIVO da câmera, com um
// FURO no formato do oval (prop `hole`) por onde aparece a `<CameraView>` nítida, que
// fica embaixo. O desfoque sai dos MESMOS quadros que o Vision analisa — não dá para
// pendurar o `niks-camera-mirror` junto: seriam dois canais de quadros na mesma sessão,
// o que o iOS não garante. Técnica do desfoque = a do mirror: quadro reduzido a ~80 px
// (a perda de resolução É o desfoque) + gaussiana mínima, esticado pela camada.
//
// Cada quadro analisado manda ao JS (`onFace`): caixa do rosto, giro, pontos do rosto
// (olhos, nariz, boca, queixo, e as linhas do contorno, das sobrancelhas e da crista do
// nariz — para a malha se construir dentro do rosto real) e o BRILHO DA
// CENA (`light`, o BrightnessValue do EXIF que o iPhone calcula a cada quadro: mede a
// luz do ambiente, não a imagem já compensada pela exposição automática).
//
// Coordenadas do evento: o canal de quadros sai EM PÉ e ESPELHADO na frontal — o
// mesmo sentido da prévia que ela vê. Então `x` cresce para a direita DA TELA, e
// `nose` negativo = nariz puxado para a esquerda da tela = ela virou para a esquerda
// da tela. É geometria, não depende da convenção de sinal do `yaw` do Vision.

final class NiksFaceTrackerView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onFace = EventDispatcher()

  // Fundo desfocado: imagem + escurecimento, recortados pela máscara com o furo do oval.
  private let bgLayer = CALayer()
  private let imageLayer = CALayer()
  private let dimLayer = CALayer()
  private let maskLayer = CAShapeLayer()
  private var hole: CGRect?
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  /// Largura em pixels do quadro reduzido. É ela que define o quanto o fundo borra.
  private static let downscaleWidth: CGFloat = 80

  private let output = AVCaptureVideoDataOutput()
  private var attachedSession: AVCaptureSession?

  private var attempts = 0
  private var watchdog: Timer?
  private var lastFrame: CFTimeInterval = 0
  /// Último quadro inteiro da câmera (só lido/escrito na `videoQueue`): é dele que sai a
  /// foto SILENCIOSA (`takePhoto`) — o `takePictureAsync` do expo-camera toca o obturador.
  private var latestBuffer: CVPixelBuffer?

  private static let maxAttempts = 60
  private static let retryDelay: TimeInterval = 0.15
  private static let backoffDelay: TimeInterval = 0.5

  /// ~24 análises por segundo: a malha cola no rosto sem esquentar o aparelho.
  private static let minFrameInterval: CFTimeInterval = 1.0 / 24.0

  private static let sessionQueue = DispatchQueue(label: "niks.face.tracker.session")
  private let videoQueue = DispatchQueue(label: "niks.face.tracker.video")

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    backgroundColor = .clear

    // Antes do 1º quadro, cinza escuro (nunca a câmera nítida fora do oval).
    bgLayer.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1).cgColor
    imageLayer.contentsGravity = .resizeAspectFill   // = o "cover" da prévia do expo-camera
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

  override func layoutSubviews() {
    super.layoutSubviews()
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

  /// Furo do oval, `[x, y, largura, altura]` em pontos da própria view (= da tela).
  func setHole(_ value: [Double]) {
    hole = value.count == 4 ? CGRect(x: value[0], y: value[1], width: value[2], height: value[3]) : nil
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    updateMask()
    CATransaction.commit()
  }

  /// Escurecimento por cima do desfoque (0…1).
  func setDim(_ value: Double) {
    dimLayer.opacity = Float(max(0, min(1, value)))
  }

  private func updateMask() {
    let path = UIBezierPath(rect: bounds)
    if let hole { path.append(UIBezierPath(ovalIn: hole)) }
    maskLayer.path = path.cgPath
  }

  // MARK: - Ciclo de vida

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      attempts = 0
      attach()
      startWatchdog()
    } else {
      stopWatchdog()
      detach()
    }
  }

  deinit {
    watchdog?.invalidate()
  }

  // MARK: - Pendurar na sessão

  private func attach() {
    guard attachedSession == nil, let window else { return }

    let root: UIView = window.rootViewController?.view ?? window
    guard let session = Self.findSession(in: root) else {
      scheduleRetry()
      return
    }
    // ⚠️ Só com a sessão rodando (ver o cabeçalho do niks-camera-mirror).
    guard session.isRunning else {
      scheduleRetry()
      return
    }

    output.alwaysDiscardsLateVideoFrames = true
    // YUV nativo do sensor: o Vision lê direto, sem conversão por quadro.
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    ]
    output.setSampleBufferDelegate(self, queue: videoQueue)

    Self.sessionQueue.async { [weak self] in
      guard let self else { return }
      session.beginConfiguration()
      let ok = session.canAddOutput(self.output)
      if ok {
        session.addOutput(self.output)
      }
      session.commitConfiguration()

      if ok {
        self.configureConnection(of: session)
      }

      DispatchQueue.main.async {
        if ok {
          self.attachedSession = session
        } else {
          self.scheduleRetry(after: Self.backoffDelay)
        }
      }
    }
  }

  /// Em pé (app travado em retrato) e espelhado na frontal, para as coordenadas
  /// casarem com a prévia.
  private func configureConnection(of session: AVCaptureSession) {
    guard let connection = output.connection(with: .video) else { return }
    if connection.isVideoOrientationSupported {
      connection.videoOrientation = .portrait
    }
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = Self.isFrontCamera(session)
    }
  }

  // MARK: - Foto silenciosa

  /// Foto do último quadro ao vivo: em pé, SEM espelhar (o quadro desta saída vem espelhado
  /// na frontal, para casar com a prévia — aqui desfaz) e sem som. → { uri, width, height }
  func takePhoto(_ promise: Promise) {
    videoQueue.async { [weak self] in
      guard let self, let buffer = self.latestBuffer else {
        promise.reject("E_TRACKER_PHOTO", "Sem quadro da câmera")
        return
      }
      var image = CIImage(cvPixelBuffer: buffer)
      if let session = self.attachedSession, Self.isFrontCamera(session) {
        image = image.oriented(.upMirrored)
      }
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
            let data = self.ciContext.jpegRepresentation(
              of: image, colorSpace: space,
              options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.92]
            )
      else {
        promise.reject("E_TRACKER_PHOTO", "Falha ao gerar a foto")
        return
      }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("niks-tracker-\(UUID().uuidString).jpg")
      do {
        try data.write(to: url)
        promise.resolve(["uri": url.absoluteString, "width": image.extent.width, "height": image.extent.height])
      } catch {
        promise.reject("E_TRACKER_PHOTO", "Falha ao salvar a foto")
      }
    }
  }

  private func scheduleRetry(after delay: TimeInterval? = nil) {
    guard attempts < Self.maxAttempts else { return }
    attempts += 1
    DispatchQueue.main.asyncAfter(deadline: .now() + (delay ?? Self.retryDelay)) { [weak self] in
      guard let self, self.window != nil else { return }
      self.attach()
    }
  }

  private func detach() {
    output.setSampleBufferDelegate(nil, queue: nil)
    if let session = attachedSession {
      Self.sessionQueue.async { [weak self] in
        guard let self else { return }
        session.beginConfiguration()
        session.removeOutput(self.output)
        session.commitConfiguration()
      }
    }
    attachedSession = nil
  }

  // MARK: - Watchdog (mesmo papel do niks-camera-mirror)

  private func startWatchdog() {
    stopWatchdog()
    watchdog = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      self?.verify()
    }
  }

  private func stopWatchdog() {
    watchdog?.invalidate()
    watchdog = nil
  }

  private func verify() {
    guard window != nil, let session = attachedSession else { return }
    if session.outputs.contains(output) {
      configureConnection(of: session)
    } else {
      attachedSession = nil
      attempts = 0
      scheduleRetry(after: Self.backoffDelay)
    }
  }

  // MARK: - Quadros

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    let now = CACurrentMediaTime()
    guard now - lastFrame >= Self.minFrameInterval else { return }
    lastFrame = now

    guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    latestBuffer = buffer
    let imgW = CVPixelBufferGetWidth(buffer)
    let imgH = CVPixelBufferGetHeight(buffer)
    guard imgW > 0, imgH > 0 else { return }

    drawBackground(buffer)
    let light = Self.sceneBrightness(sampleBuffer)

    // Caixa + giro (revisão 3 = yaw/pitch/roll contínuos) e, na mesma passada, os
    // pontos do rosto encontrado — o nariz é o que mede o giro de verdade.
    let rects = VNDetectFaceRectanglesRequest()
    if #available(iOS 15.0, *) {
      rects.revision = VNDetectFaceRectanglesRequestRevision3
    }
    let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:])
    do {
      try handler.perform([rects])
    } catch {
      return
    }

    // O maior rosto é o dela (alguém ao fundo não pode guiar o scan).
    guard let face = (rects.results ?? []).max(by: {
      $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
    }) else {
      var empty: [String: Any] = ["detected": false, "imgW": imgW, "imgH": imgH]
      if let light { empty["light"] = light }
      emit(empty)
      return
    }

    var nose: Double?
    var pts: [String: [Double]] = [:]
    let landmarks = VNDetectFaceLandmarksRequest()
    landmarks.inputFaceObservations = [face]
    if (try? handler.perform([landmarks])) != nil,
       let marks = (landmarks.results ?? []).first?.landmarks {
      if let points = (marks.nose ?? marks.noseCrest)?.normalizedPoints, !points.isEmpty {
        // Pontos relativos à caixa do rosto (0…1). Centro do nariz menos o centro da caixa.
        let mean = points.reduce(0.0) { $0 + Double($1.x) } / Double(points.count)
        nose = mean - 0.5
      }
      // Pontos para a malha, em frações do QUADRO com origem no topo (o Vision devolve
      // em pixels com origem embaixo). Os olhos vão sem nome de lado: o JS ordena pela
      // posição na tela (o quadro é espelhado, "esquerdo" do Vision confundiria).
      let size = CGSize(width: imgW, height: imgH)
      let centroid = { (region: VNFaceLandmarkRegion2D?) -> [Double]? in
        guard let region, region.pointCount > 0 else { return nil }
        let p = region.pointsInImage(imageSize: size)
        let x = p.reduce(0.0) { $0 + Double($1.x) } / Double(p.count)
        let y = p.reduce(0.0) { $0 + Double($1.y) } / Double(p.count)
        return [x / Double(imgW), 1 - y / Double(imgH)]
      }
      if let a = centroid(marks.leftPupil ?? marks.leftEye), let b = centroid(marks.rightPupil ?? marks.rightEye) {
        pts["eyes"] = a + b
      }
      if let n = centroid(marks.nose) { pts["noseTip"] = n }
      if let m = centroid(marks.outerLips) { pts["mouth"] = m }
      // Queixo: o ponto mais baixo do contorno do rosto.
      if let contour = marks.faceContour, contour.pointCount > 0,
         let low = contour.pointsInImage(imageSize: size).min(by: { $0.y < $1.y }) {
        pts["chin"] = [Double(low.x) / Double(imgW), 1 - Double(low.y) / Double(imgH)]
      }
      // Linhas inteiras, achatadas em [x0, y0, x1, y1, …] (mesmas frações do quadro):
      // o CONTORNO do rosto (bochecha → queixo → bochecha), as duas sobrancelhas e a crista
      // do nariz. É com elas que a malha da câmera se constrói DENTRO do rosto real.
      let flat = { (region: VNFaceLandmarkRegion2D?) -> [Double]? in
        guard let region, region.pointCount > 1 else { return nil }
        return region.pointsInImage(imageSize: size).flatMap {
          [Double($0.x) / Double(imgW), 1 - Double($0.y) / Double(imgH)]
        }
      }
      if let c = flat(marks.faceContour) { pts["contour"] = c }
      if let b = flat(marks.leftEyebrow) { pts["brow1"] = b }
      if let b = flat(marks.rightEyebrow) { pts["brow2"] = b }
      if let n = flat(marks.noseCrest) { pts["noseCrest"] = n }
    }

    // Vision: origem EMBAIXO à esquerda. O JS recebe com origem no topo.
    let box = face.boundingBox
    var payload: [String: Any] = [
      "detected": true,
      "x": Double(box.minX),
      "y": Double(1 - box.maxY),
      "w": Double(box.width),
      "h": Double(box.height),
      "imgW": imgW,
      "imgH": imgH,
    ]
    if let yaw = face.yaw?.doubleValue { payload["yaw"] = yaw }
    if let roll = face.roll?.doubleValue { payload["roll"] = roll }
    if #available(iOS 15.0, *), let pitch = face.pitch?.doubleValue { payload["pitch"] = pitch }
    if let nose { payload["nose"] = nose }
    if let light { payload["light"] = light }
    for (key, value) in pts { payload[key] = value }
    emit(payload)
  }

  /// Fundo desfocado a partir do quadro (já em pé e espelhado, como a prévia).
  private func drawBackground(_ buffer: CVPixelBuffer) {
    let source = CIImage(cvPixelBuffer: buffer)
    guard source.extent.width > 0 else { return }
    let scale = Self.downscaleWidth / source.extent.width
    let small = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let softened = small
      .clampedToExtent()
      .applyingGaussianBlur(sigma: 1.6)
      .cropped(to: small.extent)
    guard let cgImage = ciContext.createCGImage(softened, from: small.extent) else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      self.imageLayer.contents = cgImage
      CATransaction.commit()
    }
  }

  /// Brilho da cena (APEX, o `BrightnessValue` do EXIF do quadro). Mais alto = mais luz.
  private static func sceneBrightness(_ sampleBuffer: CMSampleBuffer) -> Double? {
    guard let attachments = CMCopyDictionaryOfAttachments(
      allocator: kCFAllocatorDefault, target: sampleBuffer, attachmentMode: kCMAttachmentMode_ShouldPropagate
    ) as? [String: Any],
      let exif = attachments[kCGImagePropertyExifDictionary as String] as? [String: Any],
      let value = exif[kCGImagePropertyExifBrightnessValue as String] as? NSNumber
    else { return nil }
    return value.doubleValue
  }

  private func emit(_ payload: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.window != nil else { return }
      self.onFace(payload)
    }
  }

  // MARK: - Busca (igual à do niks-camera-mirror: só API pública da Apple)

  private static func findSession(in view: UIView) -> AVCaptureSession? {
    if let preview = view.layer as? AVCaptureVideoPreviewLayer, let session = preview.session {
      return session
    }
    if let sublayers = view.layer.sublayers {
      for sublayer in sublayers {
        if let preview = sublayer as? AVCaptureVideoPreviewLayer, let session = preview.session {
          return session
        }
      }
    }
    for subview in view.subviews {
      if let session = findSession(in: subview) {
        return session
      }
    }
    return nil
  }

  private static func isFrontCamera(_ session: AVCaptureSession) -> Bool {
    for input in session.inputs {
      if let deviceInput = input as? AVCaptureDeviceInput {
        return deviceInput.device.position == .front
      }
    }
    return false
  }
}
