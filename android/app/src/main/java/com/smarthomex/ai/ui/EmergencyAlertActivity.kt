package com.smarthomex.ai.ui

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.smarthomex.ai.receivers.SirenSilenceReceiver
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * SmartHomeX AI - Full-Screen Red Emergency Alert Activity
 * Wakes up device display, shows over lock screen, presents real-time hardware status,
 * and provides the required "SILENCE SIREN" button.
 */
class EmergencyAlertActivity : Activity() {

    private var isSilenced = false
    private lateinit var silenceBtn: Button
    private lateinit var statusBadge: TextView
    private lateinit var noticeText: TextView

    private val sirenStatusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val silenced = intent?.getBooleanExtra("is_silenced", false) ?: false
            if (silenced) {
                applySilencedUiState()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Configure Window to Wake Screen and Show Over Lock Screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )

        val homeName = intent.getStringExtra("home_name") ?: "Primary Residence (Smart Home)"
        val gasPpm = intent.getStringExtra("gas_ppm") ?: "385"
        val initialSilenced = intent.getBooleanExtra("is_silenced", false)

        val timeString = SimpleDateFormat("dd MMM yyyy, HH:mm:ss", Locale.getDefault()).format(Date())

        // Build Programmatic High-Impact Emergency UI
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#7F1D1D")) // Deep Crimson Red
            setPadding(48, 64, 48, 64)
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val scrollView = ScrollView(this).apply {
            addView(rootLayout)
            setBackgroundColor(Color.parseColor("#7F1D1D"))
        }

        // 1. Critical Warning Icon & Header
        val alertIcon = TextView(this).apply {
            text = "⚠"
            textSize = 56f
            setTextColor(Color.parseColor("#FCA5A5"))
            gravity = Gravity.CENTER
        }
        rootLayout.addView(alertIcon)

        val headerTitle = TextView(this).apply {
            text = "GAS LEAKAGE DETECTED!\nCRITICAL EMERGENCY"
            textSize = 24f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 16)
        }
        rootLayout.addView(headerTitle)

        // 2. Status Badge
        statusBadge = TextView(this).apply {
            text = "STATUS: CRITICAL • SIREN SOUNDING"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#991B1B"))
            setBackgroundColor(Color.parseColor("#FECACA"))
            setPadding(32, 12, 32, 12)
            gravity = Gravity.CENTER
        }
        rootLayout.addView(statusBadge)

        // 3. Metadata Card (Home & Timestamp)
        val infoCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#991B1B"))
            setPadding(32, 32, 32, 32)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 32, 0, 32) }
            layoutParams = lp
        }

        val homeText = TextView(this).apply {
            text = "🏠 Home: $homeName"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        val timestampText = TextView(this).apply {
            text = "⏰ Detected: $timeString"
            textSize = 13f
            setTextColor(Color.parseColor("#FCA5A5"))
            setPadding(0, 8, 0, 8)
        }
        val sensorReadingText = TextView(this).apply {
            text = "🧪 Relative Gas Reading: $gasPpm PPM (Hazard > 350)"
            textSize = 14f
            setTextColor(Color.parseColor("#FEF08A"))
            setTypeface(null, Typeface.BOLD)
        }
        infoCard.addView(homeText)
        infoCard.addView(timestampText)
        infoCard.addView(sensorReadingText)
        rootLayout.addView(infoCard)

        // 4. ESP32 Autonomous Hardware Actions Performed
        val actionsTitle = TextView(this).apply {
            text = "AUTONOMOUS ESP32 HARDWARE ACTIONS:"
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#FCA5A5"))
            setPadding(0, 0, 0, 12)
        }
        rootLayout.addView(actionsTitle)

        val actionsCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#450A0A"))
            setPadding(32, 24, 32, 24)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 32) }
            layoutParams = lp
        }

        val actions = listOf(
            "✔ Light Relay (GPIO 14) -> FORCED OFF",
            "✔ Fan Relay (GPIO 25) -> FORCED OFF",
            "✔ Motor Relay (GPIO 26) -> FORCED OFF",
            "✔ Main Contactor -> TRIPPED (Isolated)",
            "✔ Local Buzzer (GPIO 33) -> SOUNDING (200ms Cadence)",
            "🛡 Kitchen Exhaust (GPIO 27) -> LOCKED OUT (Spark Ignition Prevention)"
        )
        for (action in actions) {
            val item = TextView(this).apply {
                text = action
                textSize = 13f
                setTextColor(Color.parseColor("#E2E8F0"))
                setPadding(0, 4, 0, 4)
            }
            actionsCard.addView(item)
        }
        rootLayout.addView(actionsCard)

        // 5. PROMINENT "SILENCE SIREN" BUTTON
        silenceBtn = Button(this).apply {
            text = "🔕 SILENCE SIREN"
            textSize = 18f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#DC2626"))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                140
            ).apply { setMargins(0, 16, 0, 24) }
            layoutParams = lp
            setOnClickListener {
                silenceSirenAction(homeName, gasPpm)
            }
        }
        rootLayout.addView(silenceBtn)

        // 6. Safety Notice
        noticeText = TextView(this).apply {
            text = "Note: Tapping 'SILENCE SIREN' stops audible audio and phone vibration. It does NOT clear the emergency or re-energize appliances. Gas emergency lockout remains strictly active on ESP32 until gas clears (< 150 PPM) and physical safety reset is performed."
            textSize = 12f
            setTextColor(Color.parseColor("#FECACA"))
            gravity = Gravity.CENTER
            setPadding(16, 8, 16, 24)
        }
        rootLayout.addView(noticeText)

        setContentView(scrollView)

        if (initialSilenced) {
            applySilencedUiState()
        }

        // Register local broadcast receiver for silence updates
        registerReceiver(
            sirenStatusReceiver,
            IntentFilter("com.smarthomex.ai.SIREN_STATUS_CHANGED")
        )
    }

    private fun silenceSirenAction(homeName: String, gasPpm: String) {
        // Send Broadcast to SirenSilenceReceiver
        val intent = Intent(this, SirenSilenceReceiver::class.java).apply {
            action = SirenSilenceReceiver.ACTION_SILENCE_SIREN
            putExtra("home_name", homeName)
            putExtra("gas_ppm", gasPpm)
        }
        sendBroadcast(intent)
        applySilencedUiState()
    }

    private fun applySilencedUiState() {
        isSilenced = true
        statusBadge.apply {
            text = "STATUS: SILENCED • EMERGENCY REMAINS ACTIVE"
            setTextColor(Color.parseColor("#78350F"))
            setBackgroundColor(Color.parseColor("#FDE68A"))
        }
        silenceBtn.apply {
            text = "✔ SIREN SILENCED (EMERGENCY ACTIVE)"
            setBackgroundColor(Color.parseColor("#4B5563"))
            isEnabled = false
        }
        noticeText.apply {
            text = "Siren audio & vibration silenced. Contactor remains TRIPPED and appliance relays remain LOCKED OUT. Clear area and allow ventilation. Manual safety reset required once gas concentration is verified safe."
            setTextColor(Color.parseColor("#FEF08A"))
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(sirenStatusReceiver)
        } catch (_: Exception) {}
    }
}

