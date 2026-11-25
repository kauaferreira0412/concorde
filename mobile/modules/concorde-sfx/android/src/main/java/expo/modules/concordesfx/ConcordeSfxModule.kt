package expo.modules.concordesfx

import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android: sons curtos da call (entrar, sair, mutar...) via SoundPool e o serviço em primeiro plano
 * que mantém a call viva com o app minimizado.
 */
class ConcordeSfxModule : Module() {
  private var soundPool: SoundPool? = null
  private val soundIds = mutableMapOf<String, Int>()
  private val loaded = mutableSetOf<Int>()
  private val pendingPlay = mutableSetOf<Int>()

  private val context
    get() = requireNotNull(appContext.reactContext) { "Contexto do app indisponível" }

  private fun pool(): SoundPool {
    soundPool?.let { return it }
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val created = SoundPool.Builder().setMaxStreams(4).setAudioAttributes(attributes).build()
    created.setOnLoadCompleteListener { p, id, status ->
      if (status == 0) {
        loaded.add(id)
        if (pendingPlay.remove(id)) p.play(id, 1f, 1f, 1, 0, 1f)
      }
    }
    soundPool = created
    return created
  }

  override fun definition() = ModuleDefinition {
    Name("ConcordeSfx")

    Function("play") { uri: String ->
      val p = pool()
      val existing = soundIds[uri]
      if (existing != null) {
        if (loaded.contains(existing)) p.play(existing, 1f, 1f, 1, 0, 1f) else pendingPlay.add(existing)
        return@Function
      }
      val path = Uri.parse(uri).path ?: uri
      val id = p.load(path, 1)
      soundIds[uri] = id
      pendingPlay.add(id)
    }

    Function("startCallService") { title: String, text: String ->
      CallForegroundService.start(context, title, text)
    }

    Function("stopCallService") {
      CallForegroundService.stop(context)
    }

    OnDestroy {
      soundPool?.release()
      soundPool = null
      soundIds.clear()
      loaded.clear()
      pendingPlay.clear()
    }
  }
}
