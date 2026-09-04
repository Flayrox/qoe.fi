package com.qoe.articletextview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ArticleTextViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ArticleTextView")

    View(ArticleTextView::class) {
      Events("onSelectionChange")

      Prop("text") { view: ArticleTextView, text: String ->
        view.setContent(text)
      }

      Prop("runs") { view: ArticleTextView, runs: List<Map<String, Any>> ->
        view.setRuns(runs)
      }

      Prop("marks") { view: ArticleTextView, marks: List<Map<String, Any>> ->
        view.setMarks(marks)
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

      OnViewDidUpdateProps { view: ArticleTextView ->
        view.update()
      }
    }
  }
}
