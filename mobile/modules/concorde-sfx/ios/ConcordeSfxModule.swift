import AudioToolbox
import ExpoModulesCore

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

    OnDestroy {
      for (_, soundId) in self.soundIds {
        AudioServicesDisposeSystemSoundID(soundId)
      }
      self.soundIds.removeAll()
    }
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
