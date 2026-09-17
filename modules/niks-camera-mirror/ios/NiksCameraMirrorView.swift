import ExpoModulesCore
import AVFoundation
import CoreImage
import UIKit

// ── Espelho da câmera ─────────────────────────────────────────────────────────
// Fundo AO VIVO, borrado, da MESMA câmera que o `expo-camera` já está exibindo — as
// células vazias da grade de colagem (molde da tela "Layout" do Instagram).
//
// ⚠️ POR QUE ISTO PRECISA SER NATIVO. O `expo-camera` cria uma sessão NOVA para cada
// `<CameraView>` (`CameraSessionManager`, `let session = AVCaptureSession()`), e o iOS
// só deixa UMA sessão segurar a câmera: dois `<CameraView>` = a segunda derruba a
// primeira. Este módulo não abre sessão nenhuma — ele se PENDURA na que já roda.
//
// ⚠️⚠️ AS DUAS ARMADILHAS QUE JÁ MORDERAM NO DEVICE — não repetir nenhuma:
//
//  1. `AVCaptureVideoPreviewLayer(session:)` para a segunda camada ROUBA A CONEXÃO da
//     primeira (esse init cria a conexão automática de prévia).
//  2. `init(sessionWithNoConnection:)` + `AVCaptureConnection` à mão **TAMBÉM não
//     resolve**: uma `AVCaptureSession` comum sustenta **UMA ÚNICA conexão de
//     prévia**. O `addConnection` é ACEITO (`canAddConnection` devolve `true`) e mesmo
//     assim a prévia do expo-camera para de receber quadros.
//
//  Sintoma idêntico nos dois casos: a célula da vez fica TRANSPARENTE e a tela toda
//  vira o borrão — o que se vê ali é o nosso fundo, através dela.
//
// ⚠️ A SAÍDA: não disputar a prévia. Um `AVCaptureVideoDataOutput` é um canal
// SEPARADO (o mesmo que apps de filtro usam), convive com a prévia e com o
// `AVCapturePhotoOutput` do disparo, e entrega os quadros crus. Desenhamos o fundo a
// partir deles.
//
// ⚠️ O BORRÃO É DE GRAÇA: cada quadro é reduzido a ~80px de largura e depois esticado
// pela `contentsGravity` da camada. A perda de resolução É o desfoque — não há filtro
// caro por quadro. Uma gaussiana mínima entra só para o esticamento não sair
// quadriculado.

final class NiksCameraMirrorView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let imageLayer = CALayer()
  private let blurView = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
  private let dimView = UIView()

  private let output = AVCaptureVideoDataOutput()
  private var attachedSession: AVCaptureSession?

  private var attempts = 0
  private var watchdog: Timer?
  private var lastFrame: CFTimeInterval = 0

  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  // A prévia do expo-camera só é inserida no `layoutSubviews` dele, e a sessão demora
  // mais ainda para rodar. A busca reagenda em vez de desistir; esperar é barato,
  // porque enquanto se espera NADA é feito na sessão.
  private static let maxAttempts = 60
  private static let retryDelay: TimeInterval = 0.15
  /// Espera maior quando a sessão está ocupada (recusou, ou acabou de trocar de
  /// câmera) — insistir de 0,15 em 0,15 s só piora a briga.
  private static let backoffDelay: TimeInterval = 0.5

  /// ~12 quadros por segundo. É fundo borrado: mais que isso é gasto de bateria sem
  /// nenhum ganho perceptível.
  private static let minFrameInterval: CFTimeInterval = 1.0 / 12.0
  /// Largura em pixels do quadro reduzido. É ela que define o quanto o fundo borra.
  private static let downscaleWidth: CGFloat = 80

  // Configuração de sessão nunca na main thread (recomendação da Apple).
  private static let sessionQueue = DispatchQueue(label: "niks.camera.mirror.session")
  private let videoQueue = DispatchQueue(label: "niks.camera.mirror.video")

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    // Puramente decorativo: o toque tem de continuar chegando na grade.
    isUserInteractionEnabled = false
    // Mesmo cinza do placeholder do JS: se nada der certo, degrada para o visual antigo
    // em vez de um buraco preto.
    backgroundColor = UIColor(red: 0.106, green: 0.106, blue: 0.114, alpha: 1)

    imageLayer.contentsGravity = .resizeAspectFill
    imageLayer.magnificationFilter = .trilinear
    imageLayer.masksToBounds = true
    layer.insertSublayer(imageLayer, at: 0)

    dimView.backgroundColor = .black
    dimView.alpha = 0
    dimView.isUserInteractionEnabled = false

    addSubview(blurView)
    addSubview(dimView)
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

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    imageLayer.frame = bounds
    CATransaction.commit()
    blurView.frame = bounds
    dimView.frame = bounds
  }

  deinit {
    watchdog?.invalidate()
  }

  // MARK: - Props

  /// Escurecimento extra por cima do blur (0…1). Existe para o JS calibrar o quanto as
  /// células inativas ficam escuras SEM exigir um build nativo novo.
  func setDim(_ value: Double) {
    dimView.alpha = CGFloat(max(0, min(1, value)))
  }

  // MARK: - Pendurar na sessão

  private func attach() {
    guard attachedSession == nil, let window else { return }

    let root: UIView = window.rootViewController?.view ?? window
    guard let session = Self.findSession(in: root) else {
      scheduleRetry()
      return
    }

    // ⚠️ NÃO TOCAR NA CONFIGURAÇÃO ENQUANTO A SESSÃO NÃO ESTIVER RODANDO. Configurar em
    // paralelo com o expo-camera (ele na fila dele, nós na nossa) fazia a câmera levar
    // ~10 SEGUNDOS para abrir — bug já visto no device.
    guard session.isRunning else {
      scheduleRetry()
      return
    }

    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
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
          // A sessão recusou o canal de quadros. Nada foi quebrado — a prévia do
          // expo-camera continua intacta — e a tela degrada para o fundo escuro liso.
          self.scheduleRetry(after: Self.backoffDelay)
        }
      }
    }
  }

  /// Orientação e espelhamento do canal de quadros. O app é travado em retrato
  /// (`app.json`); sem fixar, os quadros chegam deitados. O espelhamento acompanha a
  /// câmera frontal só por coerência com a prévia — num fundo borrado ninguém veria.
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
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    imageLayer.contents = nil
    CATransaction.commit()
  }

  // MARK: - Watchdog
  //
  // ⚠️ Virar a câmera (frontal ↔ traseira) faz o expo-camera reconfigurar a sessão, e o
  // nosso canal de quadros pode sair junto — o fundo congelaria. Este relógio percebe a
  // saída e se pendura de novo; enquanto está tudo certo, só reafirma orientação e
  // espelhamento, que é barato e não mexe na configuração da sessão.

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
      // Espera a troca de câmera terminar antes de reconfigurar: entrar junto é a
      // mesma briga que causava a tela preta longa.
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

    let source = CIImage(cvPixelBuffer: buffer)
    guard source.extent.width > 0 else { return }

    // A REDUÇÃO é o desfoque. A gaussiana mínima entra só para o esticamento posterior
    // não sair quadriculado; `clampedToExtent` evita a borda escura que a gaussiana
    // cria ao chegar no limite da imagem.
    let scale = Self.downscaleWidth / source.extent.width
    let small = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let softened = small
      .clampedToExtent()
      .applyingGaussianBlur(sigma: 1.4)
      .cropped(to: small.extent)

    guard let cgImage = ciContext.createCGImage(softened, from: small.extent) else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      // Sem animação implícita: o cross-fade padrão do CALayer a cada quadro deixaria
      // o fundo com rastro.
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      self.imageLayer.contents = cgImage
      CATransaction.commit()
    }
  }

  // MARK: - Busca

  /// Acha a sessão que o `expo-camera` já tem rodando, pela prévia dele.
  /// ⚠️ De propósito NÃO importamos o `ExpoCamera` nem lemos campos privados por
  /// reflexão: `AVCaptureVideoPreviewLayer.session` é API pública da Apple e não quebra
  /// quando o expo-camera muda por dentro.
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
