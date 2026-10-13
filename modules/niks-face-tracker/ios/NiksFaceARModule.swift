import ExpoModulesCore

// Scan com a câmera do Face ID (ARKit). O porquê e o que a view faz: cabeçalho de
// `NiksFaceARView.swift`.
public class NiksFaceARModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NiksFaceAR")

    // Este iPhone tem a câmera do Face ID? (Sem ela, a tela usa o Vision.)
    Function("isSupported") { () -> Bool in
      NiksFaceARView.isSupported
    }

    View(NiksFaceARView.self) {
      Events("onFace", "onReady")

      // Furo do oval no fundo desfocado: [x, y, largura, altura] em pontos.
      Prop("hole") { (view: NiksFaceARView, value: [Double]) in
        view.setHole(value)
      }
      // Escurecimento por cima do desfoque (0…1).
      Prop("dim") { (view: NiksFaceARView, value: Double) in
        view.setDim(value)
      }
      // Intensidade da malha em repouso e logo atrás da linha de scan (0…1).
      Prop("meshBase") { (view: NiksFaceARView, value: Double) in
        view.setMeshBase(value)
      }
      Prop("meshPeak") { (view: NiksFaceARView, value: Double) in
        view.setMeshPeak(value)
      }

      // Foto de frente: alta resolução, sem som, em pé, sem espelhar. → { uri, width, height }
      AsyncFunction("takePhoto") { (view: NiksFaceARView, promise: Promise) in
        view.takePhoto(promise)
      }
    }
  }
}
