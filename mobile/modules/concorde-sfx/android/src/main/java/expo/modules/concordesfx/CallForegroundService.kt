package expo.modules.concordesfx

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Serviço em primeiro plano enquanto você está numa call: sem ele o Android corta o microfone
 * e a conexão quando o app vai pro segundo plano (e a call cai). Mostra a notificação "Em call".
 */
class CallForegroundService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Em call no Concorde"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Toque pra voltar pra call"
    val notification = buildNotification(title, text)

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        // o tipo "microfone" só pode ser usado com a permissão do mic já concedida
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && hasMicPermission()) {
          type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
        startForeground(NOTIFICATION_ID, notification, type)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // o sistema recusou (ex.: app já em segundo plano): sem serviço, a call segue como antes
      stopSelf()
    }
    return START_NOT_STICKY
  }

  /** Fechou o app pelos recentes: encerra junto. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopForegroundCompat()
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun hasMicPermission(): Boolean =
    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun buildNotification(title: String, text: String): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(CHANNEL_ID, "Call em andamento", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Aparece enquanto você está numa call de voz"
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    }
    val pending = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_CALL)
      .apply { if (pending != null) setContentIntent(pending) }
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "concorde-call"
    private const val NOTIFICATION_ID = 4210
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"

    fun start(context: Context, title: String, text: String) {
      val intent = Intent(context, CallForegroundService::class.java)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, CallForegroundService::class.java))
    }
  }
}
