package com.qoe.articletextview

import android.content.Context
import android.graphics.Typeface
import android.os.Build
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.BackgroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.QuoteSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import android.text.style.UnderlineSpan
import android.text.style.URLSpan
import android.util.TypedValue
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.widget.TextView
import expo.modules.core.interfaces.DoNotStrip
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.viewevent.ViewEventCallback
import kotlin.math.ceil

/**
 * ArticleTextView — le « ReactTextView maison » de la tranche 4 (4-b).
 *
 * Un vrai [TextView] Android avec `textIsSelectable = true` : la sélection
 * native (poignées, double-tap, drag continu) est fournie par le système.
 * Le JS envoie :
 *   - `text` : le texte plat continu (modèle C1) ;
 *   - `spans` : les runs homogènes de peinture (gras/italique/souligné/
 *     mono/lien + fond ARGB) produits par buildPaintSpans — mêmes runs que
 *     le rendu iOS, parité par construction ;
 *   - `paragraphs` : le layout de bloc (h1..h4/blockquote/code/liste +
 *     marqueur) produit par buildParagraphLayouts.
 * Tout est aplati en [SpannableStringBuilder] — spans CONTINUS, jamais de
 * « pills » séparées.
 *
 * L'ActionMode système (barre Android Copier/Partager/…) est neutralisé :
 * nos actions vivent dans la surface morphée (décision produit rév. 6).
 * Les poignées et la sélection restent natives (le callback retourne
 * false à la création de l'ActionMode, pas à la sélection elle-même).
 *
 * La hauteur du contenu est MESURÉE ici (StaticLayout sur le texte
 * spané — les titres agrandis comptent) puis remontée via
 * [onContentHeight] : plus besoin du « jumeau » RN pour la mesure.
 */
@DoNotStrip
class ArticleTextView(context: Context) : TextView(context) {

  internal val onSelectionChange: ViewEventCallback<Map<String, Any>> by EventDispatcher()
  internal val onContentHeight: ViewEventCallback<Map<String, Any>> by EventDispatcher()

  private var updatingText = false
  private var pendingText: String? = null
  private var pendingSpans: List<Map<String, Any>>? = null
  private var pendingParagraphs: List<Map<String, Any>>? = null
  private var pendingTextColor: Int = 0xFF111111.toInt()
  private var pendingLinkColor: Int = 0xFF0B6BCB.toInt()
  private var pendingFontSizeSp: Float = 17f
  private var pendingLineHeightSp: Float = 0f
  /** Largeur (dp) de mesure fournie par le JS — la vue est mesurée par
   *  Yoga (RN), on ne peut pas s'auto-dimensionner côté natif. */
  private var pendingMeasureWidthDp: Float = 0f
  private var lastReportedHeightDp: Int = -1

  init {
    // Sélection native sur un TextView non éditable.
    setTextIsSelectable(true)
    // ActionMode système neutralisé (nos actions = surface morphée).
    // L'ActionMode reste ACTIF (sinon le framework dé-sélectionne) mais son
    // menu est vidé à la création ET à chaque prepare — la barre flottante
    // n'a alors aucun item à afficher.
    customSelectionActionModeCallback = object : ActionMode.Callback {
      override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
        menu.clear()
        return true
      }
      override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
        menu.clear()
        return true
      }
      override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean = false
      override fun onDestroyActionMode(mode: ActionMode) {}
    }
    setTextColor(pendingTextColor)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, pendingFontSizeSp)
  }

  private val density: Float
    get() = resources.displayMetrics.density

  /** dp → px (les spans Android exigent des px). */
  private fun pxFromDp(dp: Float): Float = dp * density

  private fun spToPx(sp: Float): Float =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, resources.displayMetrics)

  /** Applique tous les props accumulés (appelé par OnViewDidUpdateProps). */
  @DoNotStrip
  fun update() {
    val text = pendingText ?: return
    updatingText = true
    try {
      setTextColor(pendingTextColor)
      setLinkTextColor(pendingLinkColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, pendingFontSizeSp)
      val textSizePx = paint.textSize
      val extraPx =
        if (pendingLineHeightSp > 0f) spToPx(pendingLineHeightSp) - textSizePx else 0f
      setLineSpacing(extraPx.coerceAtLeast(0f), 1f)

      val sb = SpannableStringBuilder(text)
      applyInlineSpans(sb, text)
      applyParagraphLayout(sb, text)
      setText(sb)

      maybeReportContentHeight(sb)
    } finally {
      updatingText = false
    }
  }

  /** Spans de peinture homogènes (runs partagés iOS/Android). */
  private fun applyInlineSpans(sb: SpannableStringBuilder, text: String) {
    for (span in pendingSpans ?: return) {
      val start = (span["start"] as? Number)?.toInt() ?: continue
      val end = (span["end"] as? Number)?.toInt() ?: continue
      if (start < 0 || end > text.length || start >= end) continue
      if (span["bold"] == true) sb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      if (span["italic"] == true) sb.setSpan(StyleSpan(Typeface.ITALIC), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      if (span["underline"] == true) sb.setSpan(UnderlineSpan(), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      if (span["mono"] == true) sb.setSpan(TypefaceSpan("monospace"), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      if (span["link"] == true) sb.setSpan(URLSpan((span["href"] as? String) ?: ""), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      val bg = (span["bg"] as? Number)?.toInt() ?: -1
      if (bg >= 0) sb.setSpan(BackgroundColorSpan(bg), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
  }

  /** Layout de bloc : titres, blockquote, code, retrait suspendu des listes. */
  private fun applyParagraphLayout(sb: SpannableStringBuilder, text: String) {
    val paragraphs = pendingParagraphs ?: return
    for (p in paragraphs) {
      val start = (p["start"] as? Number)?.toInt() ?: continue
      val end = (p["end"] as? Number)?.toInt() ?: continue
      if (start < 0 || end > text.length || start >= end) continue
      val kind = p["kind"] as? String ?: continue

      // Titres : échelle relative + graisse.
      val scale = when (kind) {
        "h1" -> 1.5f
        "h2" -> 1.28f
        "h3" -> 1.14f
        "h4" -> 1.05f
        else -> null
      }
      if (scale != null) {
        sb.setSpan(RelativeSizeSpan(scale), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (kind == "h1" || kind == "h2") {
          sb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
      }

      when (kind) {
        "blockquote" -> {
          if (Build.VERSION.SDK_INT >= 28) {
            sb.setSpan(
              QuoteSpan(0xFF6B7280.toInt(), pxFromDp(3f).toInt(), pxFromDp(10f).toInt()),
              start,
              end,
              Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
          } else {
            sb.setSpan(QuoteSpan(), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
          }
        }
        "code" -> {
          sb.setSpan(TypefaceSpan("monospace"), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
          sb.setSpan(
            BackgroundColorSpan(0x14000000.toInt()),
            start,
            end,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
          )
        }
      }

      // Liste : retrait suspendu (continuation alignée après le marqueur).
      if (p["listItem"] == true) {
        val marker = p["markerText"] as? String
        if (!marker.isNullOrEmpty()) {
          val tp = TextPaint(paint)
          val markerWidthPx = tp.measureText(marker)
          sb.setSpan(
            LeadingMarginSpan.Standard(0, ceil(markerWidthPx).toInt()),
            start,
            end,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
          )
        }
      }
    }
  }

  /** Mesure la hauteur du contenu spané et la remonte en dp (si changée). */
  private fun maybeReportContentHeight(sb: SpannableStringBuilder) {
    val widthDp = pendingMeasureWidthDp
    if (widthDp <= 0f) return
    val widthPx = (widthDp * density).toInt()
    if (widthPx <= 0) return

    if (sb.length == 0) return
    // Forme 5-arg : ALIGN_NORMAL, spacing 1/0, includePad=true (défauts
    // TextView) — l'extra de ligne est ajouté manuellement ci-dessous.
    val layout = StaticLayout.Builder
      .obtain(sb, 0, sb.length, paint, widthPx)
      .build()

    var heightPx = layout.height.toFloat()
    if (pendingLineHeightSp > 0f) {
      val extra = spToPx(pendingLineHeightSp) - paint.textSize
      if (extra > 0f) heightPx += extra * layout.lineCount
    }
    val heightDp = ceil(heightPx / density).toInt()
    if (heightDp != lastReportedHeightDp) {
      lastReportedHeightDp = heightDp
      onContentHeight.invoke(mapOf("height" to heightDp))
    }
  }

  // ── Setters de props (accumulation avant update()) ────────────────────
  fun setContent(text: String) {
    pendingText = text
  }

  fun setSpans(spans: List<Map<String, Any>>) {
    pendingSpans = spans
  }

  fun setParagraphs(paragraphs: List<Map<String, Any>>) {
    pendingParagraphs = paragraphs
  }

  fun setTextColorValue(color: Int) {
    pendingTextColor = color
  }

  fun setLinkColorValue(color: Int) {
    pendingLinkColor = color
  }

  fun setFontSizeSp(size: Float) {
    pendingFontSizeSp = size
  }

  fun setLineHeightSp(lineHeight: Float) {
    pendingLineHeightSp = lineHeight
  }

  fun setMeasureWidthDp(width: Float) {
    pendingMeasureWidthDp = width
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
      val lo = minOf(selStart, selEnd)
      val hi = maxOf(selStart, selEnd)
      val payload = mutableMapOf<String, Any>("location" to lo, "length" to (hi - lo))
      // Géométrie (4-c) : centre vertical de la 1re ligne sélectionnée, en
      // dp relatif au haut de la vue — même sémantique que yCenter du
      // moteur tokens → la pill de la surface morphée s'ancre au même
      // endroit que sur le moteur hérité.
      val l = layout
      if (l != null && hi > lo) {
        val line = l.getLineForOffset(lo)
        val topPx = l.getLineTop(line).toFloat()
        val bottomPx = l.getLineBottom(line).toFloat()
        val yDp = (topPx + bottomPx) / 2f / density
        val lineHeightDp = (bottomPx - topPx) / density
        val xDp = l.getPrimaryHorizontal(lo) / density
        payload["y"] = yDp
        payload["lineHeight"] = lineHeightDp
        payload["x"] = xDp
      }
      onSelectionChange.invoke(payload)
    } else {
      onSelectionChange.invoke(mapOf("location" to -1, "length" to 0))
    }
  }
}
