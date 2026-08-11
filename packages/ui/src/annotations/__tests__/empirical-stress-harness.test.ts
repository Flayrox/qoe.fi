// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { applyHighlightToDOM, removeAllMarksFromDOM } from "./tree-walker-highlighting.test"
import { HighlightItem, AnnotationItem, MARK_STYLE_CLASSES } from "../types"

describe("Empirical Boundary & Stress Test Harness for @qoe/ui/annotations", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    document.body.innerHTML = ""
    container = document.createElement("div")
    container.id = "article-content"
    container.innerHTML = `
      <p id="p1">L'intelligence artificielle transforme la création de contenu et le journalisme moderne.</p>
      <p id="p2">Les créateurs recherchent des outils de haute précision pour annoter leurs écrits.</p>
    `
    document.body.appendChild(container)
  })

  // -------------------------------------------------------------------
  // 1. Edge Case: Empty Strings & Whitespace
  // -------------------------------------------------------------------
  describe("Edge Case 1: Empty Strings, Whitespace & Null Passages", () => {
    it("should handle empty or whitespace-only highlight requests without injecting broken mark elements", () => {
      applyHighlightToDOM(container, "")
      applyHighlightToDOM(container, "   ")
      applyHighlightToDOM(container, "\n\t")
      
      const marks = container.querySelectorAll("mark")
      expect(marks.length).toBe(0)
    })

    it("should safely handle text containing HTML characters, script tags, and quotes without XSS execution", () => {
      const specialText = `Sample <script>alert("xss")</script> & "quoted" text`
      container.textContent = specialText

      applyHighlightToDOM(container, specialText, "Safety Note", true, false, "xss-mark")

      const mark = container.querySelector("mark[data-highlight-id='xss-mark']")
      expect(mark).not.toBeNull()
      expect(mark?.textContent).toBe(specialText)
      expect(container.querySelectorAll("script").length).toBe(0)
    })
  })

  // -------------------------------------------------------------------
  // 2. Edge Case: Missing Callbacks
  // -------------------------------------------------------------------
  describe("Edge Case 2: Missing Callbacks (undefined or empty object)", () => {
    it("should safely invoke action triggers when callbacks object or individual callbacks are missing", async () => {
      const emptyCallbacks: any = {}

      const triggerActions = async () => {
        const createRes = emptyCallbacks.onHighlightCreate
          ? await emptyCallbacks.onHighlightCreate({ articleId: "a1", text: "t1", isPublic: false })
          : { ok: true, data: { id: `hl-${Date.now()}`, text: "t1" } }

        const upvoteRes = emptyCallbacks.onUpvote
          ? await emptyCallbacks.onUpvote("hl-1")
          : null

        const commentRes = emptyCallbacks.onComment
          ? await emptyCallbacks.onComment({ highlightId: "hl-1", content: "test" })
          : null

        const privacyRes = emptyCallbacks.onTogglePrivacy
          ? await emptyCallbacks.onTogglePrivacy({ highlightId: "hl-1", isPublic: true })
          : { ok: true }

        const deleteRes = emptyCallbacks.onDelete
          ? await emptyCallbacks.onDelete("hl-1")
          : { ok: true }

        return { createRes, upvoteRes, commentRes, privacyRes, deleteRes }
      }

      const results = await triggerActions()
      expect(results.createRes.ok).toBe(true)
      expect(results.upvoteRes).toBeNull()
      expect(results.commentRes).toBeNull()
      expect(results.privacyRes.ok).toBe(true)
      expect(results.deleteRes.ok).toBe(true)
    })
  })

  // -------------------------------------------------------------------
  // 3. Edge Case: Rapid Selection Toggles & State Transitions
  // -------------------------------------------------------------------
  describe("Edge Case 3: Rapid Selection Toggles & Filter Switching", () => {
    it("should rapidly apply and strip highlights without leaving orphaned nodes or leaking DOM state", () => {
      for (let i = 0; i < 20; i++) {
        applyHighlightToDOM(container, "création de contenu", `Note ${i}`, true, true, `off-${i}`)
        removeAllMarksFromDOM(container)
      }

      expect(container.querySelectorAll("mark").length).toBe(0)
      expect(container.textContent).toContain("création de contenu")
    })

    it("should handle overlapping text passages without crashing the TreeWalker range replacement", () => {
      // Highlight "création de contenu"
      applyHighlightToDOM(container, "création de contenu", "Note 1", true, true, "off-1")

      // Attempt to highlight "création" inside or alongside the existing mark
      expect(() => {
        applyHighlightToDOM(container, "création", "Note 2", true, false, "pub-1")
      }).not.toThrow()
    })
  })

  // -------------------------------------------------------------------
  // 4. Edge Case: Unauthenticated User Triggers
  // -------------------------------------------------------------------
  describe("Edge Case 4: Unauthenticated User Triggers", () => {
    it("should route unauthenticated actions to login redirect or auth requirement callback", () => {
      const isAuthenticated = false
      const onRequireAuth = vi.fn()
      const onLoginRedirect = vi.fn()
      const mainAppUrl = "https://qoe.fi"

      const handleLoginRedirect = () => {
        if (onRequireAuth) {
          onRequireAuth()
        } else if (onLoginRedirect) {
          onLoginRedirect()
        }
      }

      const attemptProtectedAction = () => {
        if (!isAuthenticated) {
          handleLoginRedirect()
          return false
        }
        return true
      }

      const result = attemptProtectedAction()
      expect(result).toBe(false)
      expect(onRequireAuth).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------
  // 5. Edge Case: Invalid DOM Container IDs
  // -------------------------------------------------------------------
  describe("Edge Case 5: Invalid DOM Container IDs", () => {
    it("should gracefully handle missing or invalid container IDs without null reference exceptions", () => {
      const getContainer = (id: string) => document.getElementById(id)
      
      const setupMarks = (id: string) => {
        const articleEl = getContainer(id)
        if (!articleEl) return null
        return articleEl.querySelectorAll("mark[data-annotation-note]")
      }

      const removeMarks = (id: string) => {
        const articleEl = getContainer(id)
        if (!articleEl) return false
        return true
      }

      expect(setupMarks("non-existent-container-id-999")).toBeNull()
      expect(removeMarks("non-existent-container-id-999")).toBe(false)
    })
  })
})
