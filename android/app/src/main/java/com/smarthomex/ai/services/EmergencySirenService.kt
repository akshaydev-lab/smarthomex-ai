package com.smarthomex.ai.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.smarthomex.ai.receivers.SirenSilenceReceiver
import com.smarthomex.ai.ui.EmergencyAlertActivity

/**
 * SmartHomeX AI - Emergency Siren Foreground Service
 * Plays looping emergency siren audio and vibration pattern until explicitly silenced.
 * Holds partial wake lock to guarantee operation when phone display is sleeping.
 */
class EmergencySirenService : Service() {

    companion object {
        private const val TAG = "EmergencySirenService"
        const val SIREN_SERVICE_CHANNEL_ID = "emergency_siren_service_v1"
        const val SIREN_NOTIFICATION_ID = 9002
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var isPlaying = false

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Creating EmergencySirenService...")

        // Acquire WakeLock
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "SmartHomeX:EmergencySirenWakeLock"
        ).apply {
            acquire(15 * 60 * 1000L /* 15 minutes safety timeout */)
        }

        // Initialize Vibrator
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.getStringExtra("action") ?: "START_SIREN"
        Log.i(TAG, "Received command: $action")

        if (action == "STOP_SIREN") {
            stopSirenAudioAndVibration()
            stopSelf()
            return START_NOT_STICKY
        }

        // Start Foreground Notification immediately
        val notification = createForegroundNotification()
        startForeground(SIREN_NOTIFICATION_ID, notification)

        // Start Siren Audio and Vibration
        startSirenAudioAndVibration()

        return START_STICKY
    }

    private fun startSirenAudioAndVibration() {
        if (isPlaying) return
        isPlaying = true

        try {
            // Set device volume to high for emergency alert
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

            // Setup Custom Siren Sound (falls back to default alarm ringtone)
            val customSirenUri = Uri.parse("android.resource://$packageName/raw/emergency_siren")
            val alarmToneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)

            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                        .build()
                )
                try {
                    setDataSource(this@EmergencySirenService, customSirenUri)
                } catch (e: Exception) {
                    setDataSource(this@EmergencySirenService, alarmToneUri)
                }
                isLooping = true
                prepare()
                start()
            }
            Log.i(TAG, "Emergency siren audio looping started.")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting siren audio: ${e.message}")
        }

        // Start Looping Vibration Pattern: [0ms delay, 500ms vibrate, 200ms rest, 500ms vibrate, 200ms rest, 1000ms rest]
        val pattern = longArrayOf(0, 500, 200, 500, 200, 1000)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0)) // 0 = loop from start
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
            Log.i(TAG, "Emergency vibration pattern active.")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting vibration: ${e.message}")
        }
    }

    private fun stopSirenAudioAndVibration() {
        Log.i(TAG, "Stopping siren audio and vibration.")
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing MediaPlayer: ${e.message}")
        }

        try {
            vibrator?.cancel()
        } catch (e: Exception) {
            Log.w(TAG, "Error cancelling vibrator: ${e.message}")
        }
        isPlaying = false
    }

    private fun createForegroundNotification(): Notification {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                SIREN_SERVICE_CHANNEL_ID,
                "Emergency Siren Audio Service",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Controls looping emergency siren audio and vibration"
                setSound(null, null) // Audio is handled by MediaPlayer directly
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Intent to launch full screen Emergency Alert Activity
        val openIntent = Intent(this, EmergencyAlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action to silence the siren
        val silenceIntent = Intent(this, SirenSilenceReceiver::class.java).apply {
            action = SirenSilenceReceiver.ACTION_SILENCE_SIREN
        }
        val silencePendingIntent = PendingIntent.getBroadcast(
            this,
            1,
            silenceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, SIREN_SERVICE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("EMERGENCY SIREN ACTIVE")
            .setContentText("Continuous alarm sounding for detected combustible gas leak.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setColor(android.graphics.Color.RED)
            .setOngoing(true)
            .setContentIntent(openPendingIntent)
            .addAction(
                android.R.drawable.ic_lock_silent_mode,
                "SILENCE SIREN",
                silencePendingIntent
            )
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "Destroying EmergencySirenService...")
        stopSirenAudioAndVibration()
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

