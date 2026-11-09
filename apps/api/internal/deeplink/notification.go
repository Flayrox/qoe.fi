// Package deeplink construit les liens internes des notifications.
//
// Un lien de notification doit ouvrir la bonne page ET, quand la cible
// appartient à un média, le bon workspace : le studio lit `?ws=<mediaId>`
// avant de rendre la page. La règle est centralisée ici pour que les
// notifications in-app et les emails produisent exactement la même URL.
package deeplink

import (
	"net/url"
	"strings"
)

// Target décrit la cible d'une notification.
type Target struct {
	Type            string
	ThoughtID       string
	ArticleID       string
	ArticleSlug     string
	PublicationID   string
	PublicationSlug string
	// PublicationType vaut PERSONAL ou MEDIA.
	PublicationType string
	// MediaID est requis pour ajouter ?ws= (publication de type MEDIA).
	MediaID string
	// SenderUsername sert aux pensées (route /<username>/thought/<id>).
	SenderUsername string
}

// Notification retourne le chemin interne d'une notification.
func Notification(t Target) string {
	path := "/notifications"
	switch t.Type {
	case "LIKE", "REPOST", "REPLY", "MENTION", "COMMENT":
		switch {
		case t.ThoughtID != "" && t.SenderUsername != "":
			path = "/" + url.PathEscape(strings.TrimPrefix(t.SenderUsername, "@")) +
				"/thought/" + url.PathEscape(t.ThoughtID)
		case t.ThoughtID != "":
			path = "/thought/" + url.PathEscape(t.ThoughtID)
		case t.ArticleID != "":
			path = "/articles/" + url.PathEscape(t.ArticleID)
		case t.ArticleSlug != "":
			path = "/article/" + url.PathEscape(t.ArticleSlug)
		}
	case "FOLLOW":
		if t.PublicationSlug != "" {
			path = "/" + url.PathEscape(t.PublicationSlug)
		}
	case "MEDIA_ARTICLE_PUBLISHED":
		// Fan-out aux abonnés : c'est une lecture publique, pas une édition.
		if t.ArticleSlug != "" {
			path = "/article/" + url.PathEscape(t.ArticleSlug)
		} else if t.ArticleID != "" {
			path = "/articles/" + url.PathEscape(t.ArticleID)
		}
	case "MEDIA_INVITE", "MEDIA_MEMBER_JOINED":
		path = "/media"
	case "ARTICLE_CONTRIBUTOR_INVITED":
		path = "/advanced"
	default:
		switch {
		case t.ArticleID != "":
			path = "/articles/" + url.PathEscape(t.ArticleID)
		case t.ArticleSlug != "":
			path = "/article/" + url.PathEscape(t.ArticleSlug)
		case t.PublicationSlug != "":
			path = "/" + url.PathEscape(t.PublicationSlug)
		case t.PublicationID != "":
			path = "/" + url.PathEscape(t.PublicationID)
		}
	}

	// `?ws=` n'a de sens que sur les pages du studio : un article public ou
	// une pensée se lisent hors workspace (et une pensée n'appartient qu'à
	// une personne).
	if t.PublicationType == "MEDIA" && t.MediaID != "" && isStudioPath(path) {
		path += "?ws=" + url.QueryEscape(t.MediaID)
	}
	return path
}

func isStudioPath(path string) bool {
	return strings.HasPrefix(path, "/articles/") ||
		path == "/media" ||
		strings.HasPrefix(path, "/advanced")
}

// Origines publiques utilisées par les emails. Le studio et le lecteur sont
// deux applications distinctes : un lien d'édition doit ouvrir le studio, un
// lien de lecture reste sur le domaine public.
const (
	PublicBaseURL = "https://qoe.fi"
	StudioBaseURL = "https://studio.qoe.fi"
)

// AbsoluteURL préfixe un chemin interne par l'origine correspondante.
func AbsoluteURL(path string) string {
	if isStudioPath(path) {
		return StudioBaseURL + path
	}
	return PublicBaseURL + path
}
