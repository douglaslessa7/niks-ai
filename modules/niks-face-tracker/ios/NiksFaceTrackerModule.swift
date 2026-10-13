import ExpoModulesCore
import UIKit
import Vision

public class NiksFaceTrackerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NiksFaceTracker")

    // Confere se a FOTO já tirada tem um rosto (segunda garantia, depois da detecção
    // ao vivo). Recebe o `uri` que o `ImageManipulator` devolve — já com a orientação
    // EXIF aplicada, então a imagem está em pé.
    AsyncFunction("detectFaceInImage") { (uri: String) -> Bool in
      let path = uri.hasPrefix("file://") ? (URL(string: uri)?.path ?? uri) : uri
      guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
        return false
      }
      let request = VNDetectFaceRectanglesRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
      try handler.perform([request])
      return !(request.results ?? []).isEmpty
    }

    // Pontos do rosto NA FOTO já tirada (Vision, no aparelho — bem mais preciso que os
    // `face_landmarks` estimados pela IA). Frações da imagem, origem no topo à esquerda, no
    // mesmo formato dos `face_landmarks`: eye_left = olho mais à ESQUERDA da imagem. A testa
    // é estimada acima do meio das sobrancelhas. Sem rosto → nil. Usado pelos pontinhos do
    // relatório do scan (`resultado-scan.tsx`).
    AsyncFunction("faceLandmarksInImage") { (uri: String) -> [String: [String: Double]]? in
      let path = uri.hasPrefix("file://") ? (URL(string: uri)?.path ?? uri) : uri
      guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else { return nil }
      let W = Double(cgImage.width), H = Double(cgImage.height)
      let request = VNDetectFaceLandmarksRequest()
      try VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:]).perform([request])
      // O rosto maior da foto (é o dela).
      guard let face = request.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }),
            let lm = face.landmarks else { return nil }
      let size = CGSize(width: W, height: H)
      // Vision: origem EMBAIXO à esquerda, em pixels → frações com origem no topo.
      func pts(_ r: VNFaceLandmarkRegion2D?) -> [CGPoint] {
        guard let r else { return [] }
        return r.pointsInImage(imageSize: size).map { CGPoint(x: $0.x / W, y: 1 - $0.y / H) }
      }
      func mid(_ p: [CGPoint]) -> CGPoint? {
        guard !p.isEmpty else { return nil }
        return CGPoint(x: p.map(\.x).reduce(0, +) / Double(p.count), y: p.map(\.y).reduce(0, +) / Double(p.count))
      }
      guard let e1 = mid(pts(lm.leftEye)), let e2 = mid(pts(lm.rightEye)),
            let mouth = mid(pts(lm.outerLips)),
            let chin = pts(lm.faceContour).max(by: { $0.y < $1.y }) else { return nil }
      let (eyeL, eyeR) = e1.x <= e2.x ? (e1, e2) : (e2, e1)
      let crest = pts(lm.noseCrest)
      guard let nose = crest.max(by: { $0.y < $1.y }) ?? mid(pts(lm.nose)) else { return nil }
      let eyeMid = CGPoint(x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2)
      // Distância entre os olhos em pixels (para a testa ficar proporcional ao rosto).
      let edPx = hypot((eyeR.x - eyeL.x) * W, (eyeR.y - eyeL.y) * H)
      let brows = pts(lm.leftEyebrow) + pts(lm.rightEyebrow)
      let browMid = mid(brows) ?? CGPoint(x: eyeMid.x, y: eyeMid.y - 0.35 * edPx / H)
      let forehead = CGPoint(x: browMid.x, y: browMid.y - 0.55 * edPx / H)
      func d(_ p: CGPoint) -> [String: Double] { ["x": Double(p.x), "y": Double(p.y)] }
      return [
        "eye_left": d(eyeL), "eye_right": d(eyeR), "nose_tip": d(nose),
        "mouth_center": d(mouth), "chin": d(chin), "forehead": d(forehead),
      ]
    }

    // Acessório no rosto NA FOTO de frente (classificador de imagens da própria Apple, no
    // aparelho, sobre o rosto recortado com folga). → "glasses" (grau ou sol), "hat" (chapéu,
    // boné, gorro, capacete), "mask" ou nil. Testado em out/2026: óculos 0,92 × sem óculos
    // 0,00 — o limiar `minConfidence` é ponto de partida, calibrar no iPhone.
    AsyncFunction("detectAccessoryInImage") { (uri: String, minConfidence: Double) -> String? in
      let path = uri.hasPrefix("file://") ? (URL(string: uri)?.path ?? uri) : uri
      guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else { return nil }
      let W = CGFloat(cgImage.width), H = CGFloat(cgImage.height)
      let faces = VNDetectFaceRectanglesRequest()
      try VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:]).perform([faces])
      guard let face = faces.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else { return nil }
      var r = CGRect(x: face.boundingBox.minX * W, y: (1 - face.boundingBox.maxY) * H,
                     width: face.boundingBox.width * W, height: face.boundingBox.height * H)
      // Folga para cima (chapéu/boné) e para os lados (hastes dos óculos).
      r = CGRect(x: r.minX - r.width * 0.25, y: r.minY - r.height * 0.45,
                 width: r.width * 1.5, height: r.height * 1.75).intersection(CGRect(x: 0, y: 0, width: W, height: H))
      guard let crop = cgImage.cropping(to: r) else { return nil }
      let classify = VNClassifyImageRequest()
      try VNImageRequestHandler(cgImage: crop, orientation: .up, options: [:]).perform([classify])
      let groups: [String: String] = [
        "eyeglasses": "glasses", "sunglasses": "glasses",
        "hat": "hat", "baseball_hat": "hat", "sunhat": "hat", "cowboy_hat": "hat", "beanie": "hat",
        "helmet": "hat", "hardhat": "hat",
        "mask": "mask", "gas_mask": "mask",
      ]
      let hit = (classify.results ?? [])
        .filter { groups[$0.identifier] != nil && Double($0.confidence) >= minConfidence }
        .max(by: { $0.confidence < $1.confidence })
      return hit.flatMap { groups[$0.identifier] }
    }

    View(NiksFaceTrackerView.self) {
      Events("onFace")

      // Furo do oval no fundo desfocado: [x, y, largura, altura] em pontos.
      Prop("hole") { (view: NiksFaceTrackerView, value: [Double]) in
        view.setHole(value)
      }
      // Escurecimento por cima do desfoque (0…1). Calibrável do JS, sem build novo.
      Prop("dim") { (view: NiksFaceTrackerView, value: Double) in
        view.setDim(value)
      }
      // Foto silenciosa do último quadro ao vivo (em pé, sem espelhar). → { uri, width, height }
      AsyncFunction("takePhoto") { (view: NiksFaceTrackerView, promise: Promise) in
        view.takePhoto(promise)
      }
    }
  }
}
