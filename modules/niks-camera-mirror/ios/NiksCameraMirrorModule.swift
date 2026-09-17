import ExpoModulesCore

public class NiksCameraMirrorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NiksCameraMirror")

    View(NiksCameraMirrorView.self) {
      // Escurecimento por cima do blur (0…1). Calibrável do JS, sem build novo.
      Prop("dim") { (view: NiksCameraMirrorView, value: Double) in
        view.setDim(value)
      }
    }
  }
}
