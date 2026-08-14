// Package response centralise la sérialisation JSON des réponses API.
package response

import (
	"encoding/json"
	"net/http"
)

type ErrorBody struct {
	Error string `json:"error"`
}

// JSON écrit une réponse JSON avec le statut donné.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// OK écrit une réponse 200.
func OK(w http.ResponseWriter, v any) { JSON(w, http.StatusOK, v) }

// Created écrit une réponse 201.
func Created(w http.ResponseWriter, v any) { JSON(w, http.StatusCreated, v) }

// Error écrit une erreur JSON.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, ErrorBody{Error: msg})
}

// BadRequest écrit une erreur 400.
func BadRequest(w http.ResponseWriter, msg string) { Error(w, http.StatusBadRequest, msg) }

// NotFound écrit une erreur 404.
func NotFound(w http.ResponseWriter, msg string) { Error(w, http.StatusNotFound, msg) }

// Unauthorized écrit une erreur 401.
func Unauthorized(w http.ResponseWriter, msg string) { Error(w, http.StatusUnauthorized, msg) }

// Forbidden écrit une erreur 403.
func Forbidden(w http.ResponseWriter, msg string) { Error(w, http.StatusForbidden, msg) }

// Internal écrit une erreur 500 (message générique, détails en log).
func Internal(w http.ResponseWriter) { Error(w, http.StatusInternalServerError, "Internal Server Error") }
