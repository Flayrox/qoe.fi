package creator

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/umami"
)

// analyticsStats proxi Umami (stats + topPages) pour la publication du créateur.
func (h *Handler) analyticsStats(w http.ResponseWriter, r *http.Request) {
	websiteID, ok := middleware.UmamiWebsiteID(r.Context())
	if !ok || websiteID == "" {
		websiteID = h.defaultWeb
	}

	now := time.Now()
	startAt := r.URL.Query().Get("startAt")
	endAt := r.URL.Query().Get("endAt")

	start := now.AddDate(0, 0, -30).UnixMilli()
	end := now.UnixMilli()
	if startAt != "" {
		v, err := strconv.ParseInt(startAt, 10, 64)
		if err != nil {
			response.BadRequest(w, "startAt doit être un timestamp Unix en millisecondes")
			return
		}
		start = v
	}
	if endAt != "" {
		v, err := strconv.ParseInt(endAt, 10, 64)
		if err != nil {
			response.BadRequest(w, "endAt doit être un timestamp Unix en millisecondes")
			return
		}
		end = v
	}
	if start > end {
		response.BadRequest(w, "startAt doit précéder endAt")
		return
	}

	if websiteID == "" {
		response.OK(w, map[string]any{"data": map[string]any{
			"stats":    map[string]int{"pageviews": 0, "visitors": 0, "visits": 0, "bounces": 0, "totaltime": 0},
			"topPages": []umami.PageMetric{},
		}})
		return
	}

	if h.umami == nil {
		// Pas de client analytics branché : ne pas inventer des statistiques
		// nulles, dire que le service n'est pas disponible.
		response.Error(w, http.StatusServiceUnavailable, "Analytics indisponible")
		return
	}

	ctx := r.Context()
	stats, err := h.umami.WebsiteStats(ctx, websiteID, start, end)
	if err != nil {
		log.Printf("[creator] umami stats: %v", err)
		response.Error(w, http.StatusBadGateway, "Statistiques temporairement indisponibles")
		return
	}
	topPages, err := h.umami.TopPages(ctx, websiteID, start, end, 10)
	if err != nil {
		log.Printf("[creator] umami topPages: %v", err)
		response.Error(w, http.StatusBadGateway, "Statistiques temporairement indisponibles")
		return
	}
	if topPages == nil {
		topPages = []umami.PageMetric{}
	}

	response.OK(w, map[string]any{"data": map[string]any{"stats": stats, "topPages": topPages}})
}
