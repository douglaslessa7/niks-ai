import ExpoModulesCore

// Scan com o MediaPipe Face Landmarker (câmera comum, SEM ARKit). O porquê e o que a view
// faz: cabeçalho de `NiksFaceMPView.swift`.
public class NiksFaceMPModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NiksFaceMP")

    // Câmera frontal + modelo e grade no binário.
    Function("isSupported") { () -> Bool in
      NiksFaceMPView.isSupported
    }

    View(NiksFaceMPView.self) {
      Events("onFace", "onReady")

      // Furo do oval no fundo desfocado: [x, y, largura, altura] em pontos.
      Prop("hole") { (view: NiksFaceMPView, value: [Double]) in
        view.setHole(value)
      }
      // Escurecimento por cima do desfoque (0…1).
      Prop("dim") { (view: NiksFaceMPView, value: Double) in
        view.setDim(value)
      }
      // Intensidade da malha em repouso e logo atrás da linha de scan (0…1).
      Prop("meshBase") { (view: NiksFaceMPView, value: Double) in
        view.setMeshBase(value)
      }
      Prop("meshPeak") { (view: NiksFaceMPView, value: Double) in
        view.setMeshPeak(value)
      }

      // Foto do quadro ao vivo: sem som, em pé, sem espelhar. → { uri, width, height }
      AsyncFunction("takePhoto") { (view: NiksFaceMPView, promise: Promise) in
        view.takePhoto(promise)
      }
    }
  }
}
