package com.qoe.articletextview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ArticleTextViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ArticleTextView")

    View(ArticleTextView::class) {
      Events("onSelectionChange", "onContentHeight", "onSpotlightMeasured")

      Prop("text") { view: ArticleTextView, text: String ->
        view.setContent(text)
      }

      // Runs homogènes de peinture (buildPaintSpans — partagés iOS/Android).
      Prop("spans") { view: ArticleTextView, spans: List<Map<String, Any>> ->
        view.setSpans(spans)
      }

      // Layout de bloc par paragraphe (buildParagraphLayouts).
      Prop("paragraphs") { view: ArticleTextView, paragraphs: List<Map<String, Any>> ->
        view.setParagraphs(paragraphs)
      }

      Prop("textColor") { view: ArticleTextView, color: Int ->
        view.setTextColorValue(color)
      }

      // Couleur des liens (thème) — URLSpan est peint avec cette couleur.
      Prop("linkColor") { view: ArticleTextView, color: Int ->
        view.setLinkColorValue(color)
      }

      // Couleur de sélection et des poignées (thème).
      Prop("selectionColor") { view: ArticleTextView, color: Int ->
        view.setSelectionColorValue(color)
      }

      Prop("fontSize") { view: ArticleTextView, size: Float ->
        view.setFontSizeSp(size)
      }

      Prop("lineHeight") { view: ArticleTextView, lineHeight: Float ->
        view.setLineHeightSp(lineHeight)
      }

      // Largeur de mesure (dp) — la hauteur du contenu est mesurée côté
      // natif (StaticLayout) puis remontée par l'événement onContentHeight.
      Prop("measureWidth") { view: ArticleTextView, width: Float ->
        view.setMeasureWidthDp(width)
      }

      // 🔦 Spotlight (4-d) : offset UTF-16 du début du passage à mettre en
      // avant (-1 = inactif). Le natif mesure la position window de la 1re
      // ligne et l'émet via onSpotlightMeasured (une fois par passage).
      Prop("spotlightStart") { view: ArticleTextView, start: Int ->
        view.setSpotlightStart(start)
      }

      OnViewDidUpdateProps { view: ArticleTextView ->
        view.update()
      }
    }
  }
}
