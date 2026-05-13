package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/config"
	"github.com/banzami/banzami/services/admin-api/internal/server"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	core := service.NewCoreAdminClient(cfg.CoreAPIURL)
	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := server.New(addr, cfg.AdminAPIKey, core)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("admin-api listening on %s", addr)
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	<-stop
	log.Println("shutting down gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
