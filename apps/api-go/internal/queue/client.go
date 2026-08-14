// Package queue — client asynq (enqueue) et helpers de connexion.
package queue

import (
	"encoding/json"
	"time"

	"github.com/hibiken/asynq"
)

// NewClient crée un client asynq pour enqueuer des tâches.
func NewClient(redisURL string) *asynq.Client {
	opt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil
	}
	return asynq.NewClient(opt)
}

// NewServer crée un serveur asynq (worker) avec une configuration VPS.
func NewServer(redisURL string, concurrency int) *asynq.Server {
	opt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil
	}
	if concurrency <= 0 {
		concurrency = 10
	}
	return asynq.NewServer(opt, asynq.Config{
		Concurrency: concurrency,
		Queues: map[string]int{
			"critical": 6,
			"default":  3,
			"low":      1,
		},
	})
}

// NewArticlePublishedTask construit la tâche asynq article.published.
func NewArticlePublishedTask(p ArticlePublishedPayload) (*asynq.Task, error) {
	payload, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TaskArticlePublished, payload, asynq.MaxRetry(3), asynq.Timeout(30*time.Second)), nil
}

// NewSubscriberCreatedTask construit la tâche asynq subscriber.created.
func NewSubscriberCreatedTask(p SubscriberCreatedPayload) (*asynq.Task, error) {
	payload, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TaskSubscriberCreated, payload, asynq.MaxRetry(3), asynq.Timeout(30*time.Second)), nil
}

// PublishArticlePublished enqueue l'événement article.published.
func PublishArticlePublished(c *asynq.Client, p ArticlePublishedPayload) error {
	if c == nil {
		return nil
	}
	task, err := NewArticlePublishedTask(p)
	if err != nil {
		return err
	}
	_, err = c.Enqueue(task, asynq.Queue("default"), asynq.ProcessIn(1*time.Second))
	return err
}

// PublishSubscriberCreated enqueue l'événement subscriber.created.
func PublishSubscriberCreated(c *asynq.Client, p SubscriberCreatedPayload) error {
	if c == nil {
		return nil
	}
	task, err := NewSubscriberCreatedTask(p)
	if err != nil {
		return err
	}
	_, err = c.Enqueue(task, asynq.Queue("default"))
	return err
}
