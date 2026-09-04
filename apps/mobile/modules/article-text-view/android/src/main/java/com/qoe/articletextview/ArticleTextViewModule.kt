package com.qoe.articletextview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ArticleTextViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ArticleTextView")

    View(ArticleTextView::class) {
      Events("onSelectionChange", "onContentHeight")

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

      OnViewDidUpdateProps { view: ArticleTextView ->
        view.update()
      }
    }
  }
}
