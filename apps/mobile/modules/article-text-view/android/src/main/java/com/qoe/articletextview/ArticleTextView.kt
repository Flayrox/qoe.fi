package com.qoe.articletextview

import android.content.Context
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.BackgroundColorSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.util.TypedValue
import android.widget.TextView
import expo.modules.core.interfaces.DoNotStrip
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.viewevent.ViewEventCallback

/**
 * ArticleTextView — le « ReactTextView maison » de la tranche 4.
 *
 * Un vrai [TextView] Android avec `textIsSelectable = true` : la sélection
 * native (poignées, double-tap, drag continu) est fournie par le système.
 * Le texte plat + runs de styles + marques viennent du JS (modèle C1) et sont
 * aplatis en [SpannableStringBuilder] — spans continus, pas de « pills ».
 *
 * Les changements de sélection sont remontés via [onSelectionChange] en
 * offsets UTF-16 (location/length), mêmes unités que le framework Android et
 * que la conversion C1 (cpToUtf16).
 */
@DoNotStrip
class ArticleTextView(context: Context) : TextView(context) {

  internal val onSelectionChange: ViewEventCallback<Map<String, Any>> by EventDispatcher()

  private var updatingText = false
  private var pendingText: String? = null
  private var pendingRuns: List<Map<String, Any>>? = null
  private var pendingMarks: List<Map<String, Any>>? = null
  private var pendingTextColor: Int = 0xFF111111.toInt()
  private var pendingFontSizeSp: Float = 17f
  private var pendingLineHeightSp: Float = 0f

  init {
    // Active le mode sélection natif sur un TextView non éditable.
    setTextIsSelectable(true)
    setTextColor(pendingTextColor)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, pendingFontSizeSp)
  }

  /** Applique tous les props accumulés (appelé par OnViewDidUpdateProps). */
  @DoNotStrip
  fun update() {
    val text = pendingText ?: return
    updatingText = true
    try {
      val sb = SpannableStringBuilder(text)

      pendingRuns?.let { runs ->
        for (run in runs) {
          val start = (run["start"] as? Number)?.toInt() ?: continue
          val end = (run["end"] as? Number)?.toInt() ?: continue
          if (start < 0 || end > text.length || start >= end) continue
          when (run["style"] as? String) {
            "bold" -> sb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            "italic" -> sb.setSpan(StyleSpan(Typeface.ITALIC), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            "bold-italic" -> sb.setSpan(StyleSpan(Typeface.BOLD_ITALIC), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            "underline" -> sb.setSpan(UnderlineSpan(), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            "code" -> sb.setSpan(
              BackgroundColorSpan(0x14000000.toInt()),
              start,
              end,
              Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
            // "link" : pas de rendu particulier dans le spike (pas de tap).
          }
        }
      }

      pendingMarks?.let { marks ->
        for (mark in marks) {
          val start = (mark["start"] as? Number)?.toInt() ?: continue
          val end = (mark["end"] as? Number)?.toInt() ?: continue
          val color = (mark["color"] as? Number)?.toInt() ?: continue
          if (start < 0 || end > text.length || start >= end) continue
          sb.setSpan(BackgroundColorSpan(color), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
      }

      setText(sb)
      setTextColor(pendingTextColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, pendingFontSizeSp)
      if (pendingLineHeightSp > 0f) {
        setLineSpacing(pendingLineHeightSp - pendingFontSizeSp, 1f)
      }
    } finally {
      updatingText = false
    }
  }

  // ── Setters de props (accumulation avant update()) ────────────────────
  fun setContent(text: String) {
    pendingText = text
  }

  fun setRuns(runs: List<Map<String, Any>>) {
    pendingRuns = runs
  }

  fun setMarks(marks: List<Map<String, Any>>) {
    pendingMarks = marks
  }

  fun setTextColorValue(color: Int) {
    pendingTextColor = color
  }

  fun setFontSizeSp(size: Float) {
    pendingFontSizeSp = size
  }

  fun setLineHeightSp(lineHeight: Float) {
    pendingLineHeightSp = lineHeight
  }

  // ── Sélection ─────────────────────────────────────────────────────────
  /**
   * Hook framework : appelé quand la sélection change (drag des poignées,
   * double-tap, sélection de mot…). Émet l'événement JS en UTF-16.
   */
  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    if (updatingText) return
    if (hasSelection()) {
      onSelectionChange.invoke(mapOf("location" to selStart, "length" to (selEnd - selStart)))
    } else {
      onSelectionChange.invoke(mapOf("location" to -1, "length" to 0))
    }
  }
}
