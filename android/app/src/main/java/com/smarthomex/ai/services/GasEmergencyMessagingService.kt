package com.smarthomex.ai.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.smarthomex.ai.R
import com.smarthomex.ai.receivers.SirenSilenceReceiver
import com.smarthomex.ai.ui.EmergencyAlertActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * SmartHomeX AI - Gas Emergency Firebase Messaging Service
 * Listens for high-priority emergency pushes, triggers heads-up emergency notification,
 * starts looping siren audio and vibration via foreground service, and opens full-screen alert.
 */
class GasEmergencyMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "GasEmergencyFCM"
        const val EMERGENCY_CHANNEL_ID = "gas_emergency_channel_v1"
        const val NOTIFICATION_ID = 9001
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.w(TAG, "FCM Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val notificationTitle = remoteMessage.notification?.title ?: data["title"] ?: "GAS LEAKAGE DETECTED – CRITICAL EMERGENCY!"
        val notificationBody = remoteMessage.notification?.body ?: data["body"] ?: "Immediate action required! Relays disconnected and contactor tripped."
        val homeName = data["home_name"] ?: "Primary Smart Residence"
        val gasPpm = data["gas_ppm"] ?: "350+"
        val emergencyStatus = data["emergency_status"] ?: "CRITICAL"

        // Check if message is a gas emergency alert
        val isGasEmergency = emergencyStatus.equals("CRITICAL", ignoreCase = true) || 
                             notificationTitle.contains("GAS LEAKAGE", ignoreCase = true)

        if (isGasEmergency) {
            Log.e(TAG, "LIFE-SAFETY EMERGENCY TRIGGERED! Starting Siren & Alert UI.")

            // 1. Start Looping Audio & Vibration Foreground Service
            val sirenIntent = Intent(this, EmergencySirenService::class.java).apply {
                putExtra("action", "START_SIREN")
                putExtra("title", notificationTitle)
                putExtra("body", notificationBody)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(sirenIntent)
            } else {
                startService(sirenIntent)
            }

            // 2. Display Heads-Up High-Importance Notification
            showEmergencyNotification(notificationTitle, notificationBody, homeName, gasPpm)

            // 3. Launch Full-Screen Emergency Activity
            val activityIntent = Intent(this, EmergencyAlertActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("home_name", homeName)
                putExtra("gas_ppm", gasPpm)
                putExtra("emergency_status", emergencyStatus)
                putExtra("timestamp", System.currentTimeMillis())
            }
            startActivity(activityIntent)
        }
    }

    private fun showEmergencyNotification(title: String, body: String, homeName: String, gasPpm: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create High-Importance Notification Channel for Android O+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                EMERGENCY_CHANNEL_ID,
                "Gas Leakage Emergency Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical life-safety alerts for combustible gas detection"
                enableLights(true)
                lightColor = android.graphics.Color.RED
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 1000)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                setBypassDnd(true) // Emergency alarm bypasses Do-Not-Disturb
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Full Screen Intent to wake screen and present red emergency display
        val fullScreenIntent = Intent(this, EmergencyAlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("home_name", homeName)
            putExtra("gas_ppm", gasPpm)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            0,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action Intent for "SILENCE SIREN" Button
        val silenceIntent = Intent(this, SirenSilenceReceiver::class.java).apply {
            action = SirenSilenceReceiver.ACTION_SILENCE_SIREN
            putExtra("home_name", homeName)
            putExtra("gas_ppm", gasPpm)
        }
        val silencePendingIntent = PendingIntent.getBroadcast(
            this,
            1,
            silenceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, EMERGENCY_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "$body\n\nLocation: $homeName\nGas Level: $gasPpm PPM\nMain Contactor: TRIPPED\nRelays: OFF (Locked Out)"
            ))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setColor(android.graphics.Color.RED)
            .setColorized(true)
            .setOngoing(true) // Cannot be casually swiped away during active danger
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(
                android.R.drawable.ic_lock_silent_mode,
                "SILENCE SIREN",
                silencePendingIntent
            )
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Device Token generated: $token")
        // Persist token to SharedPreferences and push to Supabase Edge Function
        val prefs = getSharedPreferences("smarthomex_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()

        // Background thread token registration with Supabase Edge Function
        Thread {
            try {
                val gatewayUrl = prefs.getString("gateway_url", "https://pacejovitiwmoucyzkzy.supabase.co/functions/v1/esp32-gateway?action=fcm_register")
                val deviceToken = prefs.getString("device_token", "smarthomex_esp32_hw_token_sec2026")

                val url = URL(gatewayUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("x-device-token", deviceToken)
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("fcm_token", token)
                    put("device_model", "${Build.MANUFACTURER} ${Build.MODEL}")
                    put("app_version", "2.5.0")
                }

                conn.outputStream.use { os ->
                    os.write(payload.toString().toByteArray())
                }

                val responseCode = conn.responseCode
                Log.i(TAG, "FCM token registered with Supabase Edge Function: HTTP $responseCode")
            } catch (e: Exception) {
                Log.w(TAG, "Failed registering FCM token with gateway: ${e.message}")
            }
        }.start()
    }
}

