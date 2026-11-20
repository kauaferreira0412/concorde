import AudioToolbox
import ExpoModulesCore
import UIKit
import AVKit

// Sons curtos via System Sound Services: diferente de um player (AVAudioPlayer/expo-audio),
// isso NÃO altera nem desativa a AVAudioSession - então não derruba o áudio da call (WebRTC).
public class ConcordeSfxModule: Module {
  private var soundIds: [String: SystemSoundID] = [:]

  public func definition() -> ModuleDefinition {
    Name("ConcordeSfx")

    Function("play") { (uri: String) in
      DispatchQueue.main.async {
        self.playOnMain(uri)
      }
    }

    // O comando startIOSPIP da LiveKit não acha a view na arquitetura nova do React Native
    // (só o PiP automático ao minimizar funcionava). Aqui achamos a view de vídeo com PiP
    // ligado direto na hierarquia de telas e mandamos ela abrir o PiP.
    AsyncFunction("startPictureInPicture") { () -> Bool in
      return self.startPictureInPicture()
    }.runOnQueue(.main)

    /// O PiP de alguma live está aberto agora? (pra esconder a live original e não duplicar)
    AsyncFunction("isPictureInPictureActive") { () -> Bool in
      return self.pipViews().contains { self.isPipActive($0) }
    }.runOnQueue(.main)

    /// Fecha o PiP e volta a live pro app.
    AsyncFunction("stopPictureInPicture") { () -> Bool in
      let stopSel = NSSelectorFromString("stopPIP")
      var stopped = false
      for view in self.pipViews() where self.isPipActive(view) && view.responds(to: stopSel) {
        _ = view.perform(stopSel)
        stopped = true
      }
      return stopped
    }.runOnQueue(.main)

    OnDestroy {
      for (_, soundId) in self.soundIds {
        AudioServicesDisposeSystemSoundID(soundId)
      }
      self.soundIds.removeAll()
    }
  }

  /// Views de vídeo da LiveKit que têm PiP ligado (a live), em todas as janelas.
  private func pipViews() -> [UIView] {
    guard let videoClass = NSClassFromString("LKRNRTCVideoView") else { return [] }
    let pipSel = NSSelectorFromString("pipController")
    var found: [UIView] = []
    func visit(_ view: UIView) {
      if view.isKind(of: videoClass), view.window != nil, view.responds(to: pipSel), view.perform(pipSel) != nil {
        found.append(view)
      }
      for sub in view.subviews { visit(sub) }
    }
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows { visit(window) }
    }
    return found
  }

  /// Lê o AVPictureInPictureController que fica dentro do controlador de PiP da LiveKit.
  private func isPipActive(_ view: UIView) -> Bool {
    guard let wrapper = view.perform(NSSelectorFromString("pipController"))?.takeUnretainedValue() as? NSObject,
          let controller = wrapper.value(forKey: "pipController") as? AVPictureInPictureController else { return false }
    return controller.isPictureInPictureActive
  }

  private func startPictureInPicture() -> Bool {
    let startSel = NSSelectorFromString("startPIP")
    let candidates = pipViews().filter { !$0.isHidden && $0.alpha > 0.01 && $0.responds(to: startSel) }
    guard let target = candidates.max(by: { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }) else {
      return false
    }
    _ = target.perform(startSel)
    return true
  }

  private func playOnMain(_ uri: String) {
    if let cached = soundIds[uri] {
      AudioServicesPlaySystemSound(cached)
      return
    }
    let url: URL
    if let parsed = URL(string: uri), parsed.isFileURL {
      url = parsed
    } else {
      url = URL(fileURLWithPath: uri)
    }
    var soundId: SystemSoundID = 0
    let status = AudioServicesCreateSystemSoundID(url as CFURL, &soundId)
    guard status == kAudioServicesNoError else {
      return
    }
    soundIds[uri] = soundId
    AudioServicesPlaySystemSound(soundId)
  }
}
