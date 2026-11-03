package com.smarthomex.ai.receivers

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.smarthomex.ai.services.EmergencySirenService
import com.smarthomex.ai.services.GasEmergencyMessagingService
import com.smarthomex.ai.ui.EmergencyAlertActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * SmartHomeX AI - Siren Silence Broadcast Receiver
 * Triggered when the user taps "SILENCE SIREN" on the mobile notification or emergency screen.
 * 
 * STRICT LIFE-SAFETY CONTRACT:
 * 1. Stops the alarm sound and vibration immediately.
 * 2. Keeps notification visible in the notification shade.
 * 3. Keeps emergency status ACTIVE / SILENCED.
 * 4. Keeps website emergency alert active.
 * 5. Does NOT clear the gas emergency.
 * 6. Does NOT reactivate any appliance.
 * 7. Does NOT reset the safety lockout.
 */
class SirenSilenceReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SirenSilenceReceiver"
        const val ACTION_SILENCE_SIREN = "com.smarthomex.ai.ACTION_SILENCE_SIREN"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.w(TAG, "SILENCE SIREN action received from user.")

        // 1. Stop Foreground Siren Service (terminates audio and vibration)
        val stopServiceIntent = Intent(context, EmergencySirenService::class.java).apply {
            putExtra("action", "STOP_SIREN")
        }
        context.startService(stopServiceIntent)

        // 2. Broadcast local intent so EmergencyAlertActivity can update UI state
        val localUpdateIntent = Intent("com.smarthomex.ai.SIREN_STATUS_CHANGED").apply {
            putExtra("is_silenced", true)
        }
        context.sendBroadcast(localUpdateIntent)

        // 3. Update the Persistent Notification in the Android Notification Shade:
        // Keep notification visible with "SIREN SILENCED (EMERGENCY STILL ACTIVE)" badge.
        val homeName = intent.getStringExtra("home_name") ?: "Primary Smart Residence"
        val gasPpm = intent.getStringExtra("gas_ppm") ?: "350+"
        updateNotificationSilenced(context, homeName, gasPpm)

        // 4. Notify Supabase Gateway of Silence Event
        // Informs cloud & web dashboard that mobile siren was silenced by occupant,
        // while preserving ACTIVE EMERGENCY LOCKOUT status.
        notifyGatewaySirenSilenced(context)
    }

    private fun updateNotificationSilenced(context: Context, homeName: String, gasPpm: String) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val fullScreenIntent = Intent(context, EmergencyAlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("home_name", homeName)
            putExtra("gas_ppm", gasPpm)
            putExtra("is_silenced", true)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            0,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val updatedNotification = NotificationCompat.Builder(context, GasEmergencyMessagingService.EMERGENCY_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("GAS LEAKAGE DETECTED – SIREN SILENCED")
            .setContentText("Emergency is ACTIVE. Contactor tripped & appliances remain locked out.")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "SIREN SILENCED BY USER\n" +
                "• Emergency Status: CRITICAL (Active)\n" +
                "• Gas Reading: $gasPpm PPM\n" +
                "• Main Contactor: TRIPPED (Isolated)\n" +
                "• Appliances: OFF (Locked Out)\n" +
                "• Manual safety reset required after gas clears (< 150 PPM)."
            ))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setColor(android.graphics.Color.parseColor("#E53E3E"))
            .setColorized(true)
            .setOngoing(true) // Notification remains pinned until safety reset is performed
            .setAutoCancel(false)
            .setContentIntent(fullScreenPendingIntent)
            .build()

        notificationManager.notify(GasEmergencyMessagingService.NOTIFICATION_ID, updatedNotification)
    }

    private fun notifyGatewaySirenSilenced(context: Context) {
        val prefs = context.getSharedPreferences("smarthomex_prefs", Context.MODE_PRIVATE)
        val gatewayUrl = prefs.getString(
            "gateway_url_silence",
            "https://pacejovitiwmoucyzkzy.supabase.co/functions/v1/esp32-gateway?action=silence_siren"
        )
        val deviceToken = prefs.getString("device_token", "smarthomex_esp32_hw_token_sec2026")

        Thread {
            try {
                val url = URL(gatewayUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("x-device-token", deviceToken)
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("silenced_by", "mobile_notification_action")
                    put("silenced_at", System.currentTimeMillis())
                }

                conn.outputStream.use { os ->
                    os.write(payload.toString().toByteArray())
                }

                val responseCode = conn.responseCode
                Log.i(TAG, "Notified gateway of siren silence: HTTP $responseCode")
            } catch (e: Exception) {
                Log.w(TAG, "Failed notifying gateway of siren silence: ${e.message}")
            }
        }.start()
    }
}

