// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

// TreeWalker DOM Range wrapping function matching requirements
export function applyHighlightToDOM(
  root: HTMLElement,
  textToHighlight: string,
  note?: string,
  isPublic: boolean = false,
  isOfficial: boolean = false,
  id?: string
) {
  if (!textToHighlight || !textToHighlight.trim()) return;

  root.normalize();
  const targetText = textToHighlight.trim();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodesToReplace: { textNode: Text; parent: HTMLElement; matches: { index: number; text: string }[] }[] = [];

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const textContent = textNode.textContent || "";
    const index = textContent.indexOf(targetText);

    if (index !== -1) {
      nodesToReplace.push({
        textNode,
        parent: textNode.parentElement!,
        matches: [{ index, text: targetText }],
      });
    }
  }

  nodesToReplace.forEach(({ textNode, parent, matches }) => {
    const textContent = textNode.textContent || "";
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach(({ index, text }) => {
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, index)));
      }

      const mark = document.createElement("mark");

      if (isOfficial) {
        mark.className =
          "bg-amber-500/20 text-foreground cursor-pointer border-b border-amber-500 hover:bg-amber-500/30 transition-all relative group rounded-xs font-medium";
      } else if (isPublic) {
        mark.className =
          "bg-primary/20 text-foreground cursor-pointer border-b border-primary/50 hover:bg-primary/30 transition-all relative group rounded-xs";
      } else {
        mark.className =
          "bg-amber-500/15 text-foreground cursor-pointer border-b border-dashed border-amber-400/60 hover:bg-amber-500/25 transition-all relative group rounded-xs";
      }

      mark.textContent = text;
      mark.setAttribute("data-highlight-text", text);
      if (id) mark.setAttribute("data-highlight-id", id);
      if (note) {
        mark.title = `${isOfficial ? "Annotation officielle" : isPublic ? "Annotation publique" : "Note privée"} : ${note}`;
      }

      fragment.appendChild(mark);
      lastIndex = index + text.length;
    });

    if (lastIndex < textContent.length) {
      fragment.appendChild(document.createTextNode(textContent.substring(lastIndex)));
    }

    parent.replaceChild(fragment, textNode);
  });
}

export function removeAllMarksFromDOM(root: HTMLElement) {
  const marks = root.querySelectorAll("mark[data-highlight-id]");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  });
  root.normalize();
}

describe("Tier 1 & 2: TreeWalker DOM Range Marking Engine", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.id = "article-content";
    container.innerHTML = `
      <p id="p1">L'intelligence artificielle transforme la création de contenu et le journalisme moderne.</p>
      <p id="p2">Les créateurs recherchent des outils de haute précision pour annoter leurs écrits.</p>
    `;
    document.body.appendChild(container);
  });

  it("should wrap Author/Official highlights with solid amber line styling", () => {
    applyHighlightToDOM(container, "création de contenu", "Note auteur", true, true, "official-1");

    const mark = container.querySelector("mark[data-highlight-id='official-1']");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("création de contenu");
    expect(mark?.className).toContain("bg-amber-500/20");
    expect(mark?.className).toContain("border-amber-500");
    expect(mark?.getAttribute("title")).toBe("Annotation officielle : Note auteur");
  });

  it("should wrap Public Genius highlights with primary line styling", () => {
    applyHighlightToDOM(container, "journalisme moderne", "Note publique", true, false, "public-1");

    const mark = container.querySelector("mark[data-highlight-id='public-1']");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("journalisme moderne");
    expect(mark?.className).toContain("bg-primary/20");
    expect(mark?.className).toContain("border-primary/50");
    expect(mark?.getAttribute("title")).toBe("Annotation publique : Note publique");
  });

  it("should wrap Private Reader notes with dashed line styling", () => {
    applyHighlightToDOM(container, "outils de haute précision", "Réflexion personnelle", false, false, "private-1");

    const mark = container.querySelector("mark[data-highlight-id='private-1']");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("outils de haute précision");
    expect(mark?.className).toContain("bg-amber-500/15");
    expect(mark?.className).toContain("border-dashed");
    expect(mark?.getAttribute("title")).toBe("Note privée : Réflexion personnelle");
  });

  it("should strip marks cleanly and normalize DOM nodes", () => {
    applyHighlightToDOM(container, "journalisme moderne", undefined, true, false, "mark-to-remove");
    expect(container.querySelectorAll("mark").length).toBe(1);

    removeAllMarksFromDOM(container);
    expect(container.querySelectorAll("mark").length).toBe(0);
    expect(container.querySelector("#p1")?.textContent).toBe(
      "L'intelligence artificielle transforme la création de contenu et le journalisme moderne."
    );
  });
});
