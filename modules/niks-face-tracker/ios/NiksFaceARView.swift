import ExpoModulesCore
import ARKit
import SceneKit
import CoreImage
import UIKit
import Vision

// ── Scan com a câmera do Face ID (ARKit) ──────────────────────────────────────
// A câmera do onboarding (`app/(scan)/camera.tsx`) nos iPhones com Face ID. Molde do
// scan do Lovi (referência do produto): a máscara é a MALHA 3D REAL do rosto que o
// ARKit mede (~1.200 pontos, 60×/s, com o sensor de profundidade) — por isso gruda em
// qualquer rosto e vira junto com a cabeça. Sem Face ID, a tela usa o `<CameraView>` +
// `NiksFaceTrackerView` (Vision), como antes.
//
// O que esta view faz, tudo dentro dela:
//   • mostra a câmera frontal (`ARSCNView`, espelhada como selfie);
//   • desenha a malha: só as arestas dos "quadradinhos" do rosto (a diagonal de cada par
//     de triângulos sai), fininhas e quase transparentes, esmaecendo na borda de fora;
//     uma linha de scan (corte do rosto num plano horizontal DO ROSTO — curva com ele)
//     vai e volta; por onde ela passou, a malha fica bem branca, com pontinhos nos
//     vértices, e volta ao tom normal em `trailMs`. Um "oclusor" invisível (o próprio
//     rosto, um pouco encolhido) esconde o que fica atrás do nariz e o lado que vira;
//   • fundo DESFOCADO ao vivo com o furo do oval (prop `hole`), mesma técnica do
//     `NiksFaceTrackerView` — mas a partir dos quadros do ARKit (o ARKit é dono da câmera);
//   • manda ao JS (`onFace`), no MESMO formato do Vision (`FaceFrame`, coordenadas já em
//     pontos da tela): caixa do rosto, giro e o "nariz" (giro para a tela), luz;
//   • `takePhoto`: foto de frente tirada do QUADRO AO VIVO (`currentFrame`), SEM som, em
//     pé e SEM espelhar (esquerda/direita da análise são as do rosto). ⚠️ Não usar o
//     `captureHighResolutionFrame`: ele toca o som do obturador (não dá para calar) e a
//     usuária não pode perceber que saiu uma foto (out/2026). A resolução vem do formato
//     de vídeo de maior resolução que o aparelho oferece (`bestVideoFormat`).
//
// ⚠️ Os sentidos (lado/cima/baixo) saem de PROJEÇÕES na tela (`projectPoint`), não das
// convenções de eixo do ARKit: o vetor "para onde o rosto aponta", projetado, já está no
// sentido do que ela vê. Não depende de espelhamento.
final class NiksFaceARView: ExpoView, ARSCNViewDelegate, ARSessionDelegate {
  let onFace = EventDispatcher()
  let onReady = EventDispatcher()

  private let sceneView = ARSCNView(frame: .zero)

  // Fundo desfocado (igual ao do NiksFaceTrackerView).
  private let bgLayer = CALayer()
  private let imageLayer = CALayer()
  private let dimLayer = CALayer()
  private let maskLayer = CAShapeLayer()
  private var hole: CGRect?
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  private let blurQueue = DispatchQueue(label: "niks.face.ar.blur")
  private var blurBusy = false
  private var lastBlur: CFTimeInterval = 0
  private static let downscaleWidth: CGFloat = 80

  // Malha.
  private let meshNode = SCNNode()
  private let scanNode = SCNNode()
  private var occluder: SCNNode?
  private var topo: Topology?
  private let lineMaterial = NiksFaceARView.additiveMaterial()
  private let startTime = CACurrentMediaTime()
  private var faceVisibleSince: CFTimeInterval?

  // Ajustes do visual (props, calibráveis do JS sem build novo).
  private var baseAlpha: Float = 0.32
  private var peakAlpha: Float = 0.95
  private static let sweepMs: Float = 2600
  private static let trailMs: Float = 520

  // Eventos.
  private var lastEmit: CFTimeInterval = 0
  private var readySent = false
  private var viewSize = CGSize.zero          // lido na thread de render

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    isUserInteractionEnabled = false
    backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1)

    sceneView.delegate = self
    sceneView.session.delegate = self
    sceneView.automaticallyUpdatesLighting = false
    sceneView.isUserInteractionEnabled = false
    if #available(iOS 13.0, *) { sceneView.rendersCameraGrain = false }
    addSubview(sceneView)

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

    meshNode.renderingOrder = 10
    scanNode.renderingOrder = 11
  }

  static var isSupported: Bool { ARFaceTrackingConfiguration.isSupported }

  // MARK: - Ciclo de vida

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { start() } else { sceneView.session.pause() }
  }

  private func start() {
    guard Self.isSupported else { return }
    let config = ARFaceTrackingConfiguration()
    config.isLightEstimationEnabled = true
    config.maximumNumberOfTrackedFaces = 1
    if let format = Self.bestVideoFormat() {
      config.videoFormat = format
    }
    sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
  }

  /// Maior resolução de vídeo da câmera do Face ID com pelo menos 30 quadros/s: a foto
  /// sai do quadro ao vivo, então é essa resolução que chega à análise.
  private static func bestVideoFormat() -> ARConfiguration.VideoFormat? {
    let formats = ARFaceTrackingConfiguration.supportedVideoFormats.filter { $0.framesPerSecond >= 30 }
    return formats.max { a, b in
      a.imageResolution.width * a.imageResolution.height < b.imageResolution.width * b.imageResolution.height
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
    viewSize = bounds.size
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

  // MARK: - Quadros (fundo desfocado, luz, "sem rosto")

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    if !readySent {
      readySent = true
      onReady([:])
    }
    let now = CACurrentMediaTime()

    // Fundo desfocado a ~20 quadros/s. Só o buffer viaja (nunca reter o ARFrame).
    if !blurBusy, now - lastBlur >= 1.0 / 20.0 {
      lastBlur = now
      blurBusy = true
      let buffer = frame.capturedImage
      blurQueue.async { [weak self] in
        guard let self else { return }
        // Em pé e espelhada, como a prévia da selfie.
        let source = CIImage(cvPixelBuffer: buffer).oriented(.leftMirrored)
        let scale = Self.downscaleWidth / source.extent.width
        let small = source
          .transformed(by: CGAffineTransform(translationX: -source.extent.minX, y: -source.extent.minY))
          .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let softened = small.clampedToExtent().applyingGaussianBlur(sigma: 1.6).cropped(to: small.extent)
        let cg = self.ciContext.createCGImage(softened, from: small.extent)
        DispatchQueue.main.async {
          self.blurBusy = false
          guard let cg else { return }
          CATransaction.begin()
          CATransaction.setDisableActions(true)
          self.imageLayer.contents = cg
          CATransaction.commit()
        }
      }
    }

    // Sem rosto rastreado: avisa o JS (com a luz), ~10×/s.
    let tracked = frame.anchors.contains { ($0 as? ARFaceAnchor)?.isTracked == true }
    if !tracked, now - lastEmit >= 0.1 {
      lastEmit = now
      var payload: [String: Any] = ["detected": false, "imgW": Double(viewSize.width), "imgH": Double(viewSize.height)]
      if let light = Self.brightness(frame) { payload["light"] = light }
      onFace(payload)
    }
  }

  /// Luz da cena na MESMA escala do Vision (APEX BrightnessValue): o EXIF do quadro
  /// (iOS 16+) ou, sem ele, a intensidade ambiente do ARKit convertida (1000 lm ≈ 2).
  private static func brightness(_ frame: ARFrame) -> Double? {
    if #available(iOS 16.0, *) {
      let exif = frame.exifData
      let nested = exif[kCGImagePropertyExifDictionary as String] as? [String: Any]
      if let bv = (exif[kCGImagePropertyExifBrightnessValue as String] ?? nested?[kCGImagePropertyExifBrightnessValue as String]) as? NSNumber {
        return bv.doubleValue
      }
    }
    if let ambient = frame.lightEstimate?.ambientIntensity {
      return log2(max(1, Double(ambient)) / 250)
    }
    return nil
  }

  // MARK: - Malha

  func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
    guard anchor is ARFaceAnchor, let device = sceneView.device else { return nil }
    let node = SCNNode()
    if let occ = ARSCNFaceGeometry(device: device) {
      // Oclusor: o rosto invisível, só escreve profundidade — esconde o que fica atrás
      // do nariz e o lado que vira. Um pouco encolhido para a malha não "brigar" com ele.
      occ.firstMaterial?.colorBufferWriteMask = []
      let n = SCNNode(geometry: occ)
      n.renderingOrder = -1
      n.scale = SCNVector3(0.985, 0.985, 0.985)
      node.addChildNode(n)
      occluder = n
    }
    node.addChildNode(meshNode)
    node.addChildNode(scanNode)
    return node
  }

  func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
    guard let face = anchor as? ARFaceAnchor else { return }
    node.isHidden = !face.isTracked
    guard face.isTracked else {
      faceVisibleSince = nil
      return
    }
    (occluder?.geometry as? ARSCNFaceGeometry)?.update(from: face.geometry)
    if topo == nil { topo = Topology(face.geometry) }
    guard let topo else { return }
    let now = CACurrentMediaTime()
    if faceVisibleSince == nil { faceVisibleSince = now }
    let fadeIn = Float(min(1, (now - (faceVisibleSince ?? now)) / 0.25))
    updateMesh(face.geometry, topo, t: Float(now - startTime) * 1000, opacity: fadeIn)
    if now - lastEmit >= 1.0 / 30.0 {
      lastEmit = now
      emitFace(face, topo)
    }
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

  private func updateMesh(_ geo: ARFaceGeometry, _ topo: Topology, t: Float, opacity: Float) {
    let verts = geo.vertices
    let n = verts.count
    guard n == topo.fade.count else { return }
    let span = max(0.001, topo.maxY - topo.minY)
    let cyc = fmodf(t, 2 * Self.sweepMs) / Self.sweepMs
    let scanY = topo.maxY - Self.ease(cyc < 1 ? cyc : 2 - cyc) * span
    let band: Float = 0.003

    var colors = [SIMD4<Float>](repeating: .zero, count: n)
    var glints: [UInt16] = []
    for i in 0..<n {
      let y = verts[i].y
      let age = Self.sinceScan((topo.maxY - y) / span, t)
      let trail: Float = age.isInfinite ? 0 : expf(-age / Self.trailMs)
      let d = (y - scanY) / band
      let glow = 0.5 * expf(-d * d)
      let a = min(1, (baseAlpha + (peakAlpha - baseAlpha) * trail + glow) * topo.fade[i] * opacity)
      colors[i] = SIMD4(a, a, a, 1)
      if topo.glint[i], trail > 0.4, topo.fade[i] > 0.5 { glints.append(UInt16(i)) }
    }

    let vSource = SCNGeometrySource(vertices: verts.map { SCNVector3($0.x, $0.y, $0.z) })
    let cSource = SCNGeometrySource(
      data: colors.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .color, vectorCount: n,
      usesFloatComponents: true, componentsPerVector: 4, bytesPerComponent: 4, dataOffset: 0, dataStride: 16
    )
    var elements = [topo.lines]
    if !glints.isEmpty {
      let pts = SCNGeometryElement(indices: glints, primitiveType: .point)
      pts.pointSize = 4
      pts.minimumPointScreenSpaceRadius = 1.2
      pts.maximumPointScreenSpaceRadius = 2.2
      elements.append(pts)
    }
    let g = SCNGeometry(sources: [vSource, cSource], elements: elements)
    g.materials = elements.map { _ in lineMaterial }
    meshNode.geometry = g

    // Linha de scan: o corte do rosto pelo plano y = scanY (curva com o rosto).
    var segPts: [SCNVector3] = []
    var segCol: [SIMD4<Float>] = []
    let tri = geo.triangleIndices
    var k = 0
    while k + 2 < tri.count {
      let ids = [Int(tri[k]), Int(tri[k + 1]), Int(tri[k + 2])]
      k += 3
      var cut: [(SCNVector3, Float)] = []
      for e in 0..<3 {
        let a = ids[e], b = ids[(e + 1) % 3]
        let ya = verts[a].y - scanY, yb = verts[b].y - scanY
        if (ya < 0) != (yb < 0) {
          let f = ya / (ya - yb)
          let p = verts[a] + (verts[b] - verts[a]) * f
          cut.append((SCNVector3(p.x, p.y, p.z), topo.fade[a] + (topo.fade[b] - topo.fade[a]) * f))
        }
      }
      if cut.count == 2 {
        for (p, fd) in cut {
          segPts.append(p)
          let a = min(1, fd * opacity)
          segCol.append(SIMD4(a, a, a, 1))
        }
      }
    }
    if segPts.isEmpty {
      scanNode.geometry = nil
    } else {
      let idx = (0..<segPts.count).map { UInt16($0) }
      let s = SCNGeometry(
        sources: [
          SCNGeometrySource(vertices: segPts),
          SCNGeometrySource(
            data: segCol.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .color, vectorCount: segCol.count,
            usesFloatComponents: true, componentsPerVector: 4, bytesPerComponent: 4, dataOffset: 0, dataStride: 16
          ),
        ],
        elements: [SCNGeometryElement(indices: idx, primitiveType: .line)]
      )
      s.materials = [lineMaterial]
      scanNode.geometry = s
    }
  }

  /// Cor somada à imagem da câmera (brilho, como no Lovi), sem luz, sem escrever profundidade.
  private static func additiveMaterial() -> SCNMaterial {
    let m = SCNMaterial()
    m.lightingModel = .constant
    m.diffuse.contents = UIColor.white
    m.blendMode = .add
    m.writesToDepthBuffer = false
    m.readsFromDepthBuffer = true
    m.isDoubleSided = true
    return m
  }

  // MARK: - Dados do rosto para o JS (mesmo formato do Vision)

  private func emitFace(_ face: ARFaceAnchor, _ topo: Topology) {
    let size = viewSize
    guard size.width > 0, size.height > 0 else { return }
    let tf = face.transform
    let world = { (p: SIMD3<Float>) -> SIMD3<Float> in
      let w = tf * SIMD4(p.x, p.y, p.z, 1)
      return SIMD3(w.x, w.y, w.z)
    }
    let project = { (p: SIMD3<Float>) -> CGPoint in
      let s = self.sceneView.projectPoint(SCNVector3(p.x, p.y, p.z))
      return CGPoint(x: CGFloat(s.x), y: CGFloat(s.y))
    }
    let verts = face.geometry.vertices

    // Caixa: a borda de fora da malha projetada, apertada para a escala da caixa do
    // Vision (a malha vai até perto das orelhas e da testa; a caixa do Vision, não).
    var minX = CGFloat.greatestFiniteMagnitude, maxX = -CGFloat.greatestFiniteMagnitude
    var minY = CGFloat.greatestFiniteMagnitude, maxY = -CGFloat.greatestFiniteMagnitude
    for i in topo.outer {
      let p = project(world(verts[i]))
      minX = min(minX, p.x); maxX = max(maxX, p.x); minY = min(minY, p.y); maxY = max(maxY, p.y)
    }
    let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    let w = (maxX - minX) * 0.85, h = (maxY - minY) * 0.85

    // Para onde o rosto aponta, NA TELA: ângulo total entre "frente do rosto" e "rumo à
    // câmera", repartido pela direção em que a frente do rosto aparece projetada.
    let origin = world(.zero)
    let ahead = world(SIMD3(0, 0, 0.06))
    let p0 = project(origin), p1 = project(ahead)
    let vx = Double(p1.x - p0.x), vy = Double(p1.y - p0.y)
    let len = hypot(vx, vy)
    var yawS = 0.0, pitchDown = 0.0
    if let cam = sceneView.pointOfView?.simdWorldPosition {
      let toCam = simd_normalize(cam - origin)
      let fwd = simd_normalize(ahead - origin)
      let theta = Double(acos(max(-1, min(1, simd_dot(toCam, fwd)))))
      if len > 0.5 {
        yawS = theta * vx / len
        pitchDown = theta * vy / len
      }
    }
    // Inclinação: a linha dos olhos na tela.
    let eL = project(world(SIMD3(face.leftEyeTransform.columns.3.x, face.leftEyeTransform.columns.3.y, face.leftEyeTransform.columns.3.z)))
    let eR = project(world(SIMD3(face.rightEyeTransform.columns.3.x, face.rightEyeTransform.columns.3.y, face.rightEyeTransform.columns.3.z)))
    var roll = atan2(Double(eR.y - eL.y), Double(eR.x - eL.x))
    if roll > .pi / 2 { roll -= .pi } else if roll < -.pi / 2 { roll += .pi }

    var payload: [String: Any] = [
      "detected": true,
      "x": Double((cx - w / 2) / size.width), "y": Double((cy - h / 2) / size.height),
      "w": Double(w / size.width), "h": Double(h / size.height),
      "imgW": Double(size.width), "imgH": Double(size.height),
      "yaw": yawS, "pitch": pitchDown, "roll": roll,
      // Mesma escala do "nariz" do Vision (0,14 ≈ cabeça bem virada, ~25°).
      "nose": 0.32 * yawS,
    ]
    if let frame = sceneView.session.currentFrame, let light = Self.brightness(frame) { payload["light"] = light }
    DispatchQueue.main.async { [weak self] in self?.onFace(payload) }
  }

  // MARK: - Foto

  func takePhoto(_ promise: Promise) {
    let finish = { [weak self] (buffer: CVPixelBuffer?) in
      guard let self, let buffer else {
        promise.reject("E_AR_PHOTO", "Sem quadro da câmera")
        return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        let image = Self.upright(CIImage(cvPixelBuffer: buffer))
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let data = self.ciContext.jpegRepresentation(
                of: image, colorSpace: space,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.92]
              )
        else {
          promise.reject("E_AR_PHOTO", "Falha ao gerar a foto")
          return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("niks-ar-\(UUID().uuidString).jpg")
        do {
          try data.write(to: url)
          promise.resolve(["uri": url.absoluteString, "width": image.extent.width, "height": image.extent.height])
        } catch {
          promise.reject("E_AR_PHOTO", "Falha ao salvar a foto")
        }
      }
    }
    // Quadro ao vivo: silencioso (o `captureHighResolutionFrame` toca o obturador).
    finish(sceneView.session.currentFrame?.capturedImage)
  }

  /// Quadro cru do sensor (deitado) → em pé, SEM espelhar. Confere com o Vision qual giro
  /// deixa o rosto de pé (o padrão da frontal em retrato é `.right`).
  private static func upright(_ raw: CIImage) -> CIImage {
    for orientation in [CGImagePropertyOrientation.right, .left] {
      let candidate = raw.oriented(orientation)
      let request = VNDetectFaceRectanglesRequest()
      try? VNImageRequestHandler(ciImage: candidate, options: [:]).perform([request])
      if let face = request.results?.first, abs(face.roll?.doubleValue ?? 0) < 0.6 { return candidate }
    }
    return raw.oriented(.right)
  }
}

// MARK: - Topologia da malha (calculada uma vez — a do ARKit não muda)

private struct Topology {
  let lines: SCNGeometryElement
  let fade: [Float]          // 0 na borda de fora → 1 por dentro
  let glint: [Bool]          // vértices que podem brilhar no rastro (~35%)
  let outer: [Int]           // vértices da borda de fora
  let minY: Float
  let maxY: Float

  init(_ geo: ARFaceGeometry) {
    let verts = geo.vertices
    let tri = geo.triangleIndices.map { Int($0) }
    let n = verts.count
    struct Key: Hashable { let a: Int; let b: Int }
    let key = { (a: Int, b: Int) in a < b ? Key(a: a, b: b) : Key(a: b, b: a) }
    var count: [Key: Int] = [:]
    var longest: [Key: Int] = [:]      // em quantos triângulos a aresta é a maior
    var k = 0
    while k + 2 < tri.count {
      let ids = [tri[k], tri[k + 1], tri[k + 2]]
      k += 3
      var best = 0
      var bestLen: Float = -1
      for e in 0..<3 {
        let a = ids[e], b = ids[(e + 1) % 3]
        count[key(a, b), default: 0] += 1
        let l = simd_length(verts[a] - verts[b])
        if l > bestLen { bestLen = l; best = e }
      }
      longest[key(ids[best], ids[(best + 1) % 3]), default: 0] += 1
    }
    // Diagonal de um "quadradinho" = aresta interna que é a MAIOR nos dois triângulos.
    var indices: [UInt16] = []
    var boundary: [Int: [Int]] = [:]
    for (e, c) in count {
      if c == 2, longest[e] == 2 { continue }
      indices.append(UInt16(e.a)); indices.append(UInt16(e.b))
      if c == 1 {
        boundary[e.a, default: []].append(e.b)
        boundary[e.b, default: []].append(e.a)
      }
    }
    lines = SCNGeometryElement(indices: indices, primitiveType: .line)

    // Laços da borda (o de fora é o maior; os outros são olhos e boca — esses não esmaecem).
    var seen = Set<Int>()
    var loops: [[Int]] = []
    for start in boundary.keys where !seen.contains(start) {
      var loop: [Int] = []
      var stack = [start]
      while let v = stack.popLast() {
        if seen.contains(v) { continue }
        seen.insert(v)
        loop.append(v)
        stack.append(contentsOf: boundary[v] ?? [])
      }
      loops.append(loop)
    }
    let outerLoop = loops.max(by: { $0.count < $1.count }) ?? []
    outer = outerLoop

    // Distância (em arestas) até a borda de fora → esmaecimento suave em 3 arestas.
    var adj = [[Int]](repeating: [], count: n)
    for (e, _) in count { adj[e.a].append(e.b); adj[e.b].append(e.a) }
    var hops = [Int](repeating: Int.max, count: n)
    var queue = outerLoop
    for v in outerLoop { hops[v] = 0 }
    var head = 0
    while head < queue.count {
      let v = queue[head]; head += 1
      for w in adj[v] where hops[w] == Int.max {
        hops[w] = hops[v] + 1
        queue.append(w)
      }
    }
    fade = hops.map { h in
      let x = min(1, Float(h == Int.max ? 3 : h) / 3)
      return x * x * (3 - 2 * x)
    }
    glint = (0..<n).map { i in
      let s = sinf(Float(i) * 12.9898) * 43758.5453
      return s - floorf(s) < 0.35
    }
    minY = verts.map { $0.y }.min() ?? -0.1
    maxY = verts.map { $0.y }.max() ?? 0.1
  }
}
