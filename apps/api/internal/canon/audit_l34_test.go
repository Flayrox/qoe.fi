package canon

import "testing"

// F770 — le parseur HTML5 referme implicitement un <mark> ou un <b> resté
// ouvert à la fin du bloc. Notre writer ne le faisait pas : la marque
// officielle du studio disparaissait de Blocks[].Spans (donc jamais persistée
// en Highlight par anchors.SyncOfficialMarks) et le style inline était perdu,
// alors que le navigateur affiche bien l'annotation.
func TestAuditL34_UnclosedInlineKeepsSpanAndNote(t *testing.T) {
	doc := Parse(`<p>avant <mark data-annotation-note="note">surligné</p>`)
	if len(doc.Blocks) != 1 {
		t.Fatalf("blocs = %d, attendu 1", len(doc.Blocks))
	}
	if got := doc.Blocks[0].Text; got != "avant surligné" {
		t.Fatalf("texte = %q", got)
	}
	if len(doc.Blocks[0].Spans) != 1 {
		t.Fatalf("spans = %d, attendu 1 (marque non refermée perdue)", len(doc.Blocks[0].Spans))
	}
	sp := doc.Blocks[0].Spans[0]
	if sp.Note != "note" || sp.Start != 6 || sp.End != 14 {
		t.Fatalf("span = %+v, attendu {Start:6 End:14 Note:note}", sp)
	}

	doc = Parse(`<p><b>gras non refermé</p>`)
	if len(doc.Blocks) != 1 || len(doc.Blocks[0].Inline) != 1 {
		t.Fatalf("inline = %+v, attendu un span bold", doc.Blocks)
	}
	if in := doc.Blocks[0].Inline[0]; in.Style != "bold" || in.Start != 0 || in.End != 16 {
		t.Fatalf("inline = %+v, attendu {0,16,bold}", in)
	}

	// Idempotence : refermer explicitement donne exactement le même document.
	open := Parse(`<p>avant <mark data-annotation-note="note">surligné</p>`)
	closed := Parse(`<p>avant <mark data-annotation-note="note">surligné</mark></p>`)
	if open.Sha != closed.Sha || len(open.Blocks[0].Spans) != len(closed.Blocks[0].Spans) {
		t.Fatalf("marque ouverte vs refermée divergent : %q vs %q", open.Sha, closed.Sha)
	}
}
