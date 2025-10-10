package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/starfederation/datastar-go/datastar"
)

const (
	port = ":8080"
)

func main() {
	mux := http.NewServeMux()

	// Serve static files (HTML, CSS) from current directory
	mux.HandleFunc("/", serveIndex)
	mux.HandleFunc("/styles.css", serveCSS)

	// Serve source files from ../src directory
	mux.Handle("/src/", http.StripPrefix("/src/", http.FileServer(http.Dir("../src"))))

	// Serve test files from ./tests directory
	mux.Handle("/tests/", http.StripPrefix("/tests/", http.FileServer(http.Dir("tests"))))

	// Test endpoints - various resilience scenarios
	mux.HandleFunc("/api/stable", stableSSE)
	mux.HandleFunc("/api/random-failures", randomFailuresSSE)
	mux.HandleFunc("/api/delayed-start", delayedStartSSE)
	mux.HandleFunc("/api/inactivity-test", inactivityTestSSE)
	mux.HandleFunc("/api/intermittent", intermittentSSE)

	log.Printf("🚀 Test server starting on http://localhost%s\n", port)
	log.Printf("📝 Testing resilient library with datastar-go\n")
	log.Printf("📂 Serving source files from ../src/\n")
	if err := http.ListenAndServe(port, mux); err != nil {
		log.Fatal(err)
	}
}

// serveIndex serves the main HTML test page
func serveIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, "index.html")
}

// serveCSS serves the CSS stylesheet
func serveCSS(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "styles.css")
}

// stableSSE - reliable connection that never fails
func stableSSE(w http.ResponseWriter, r *http.Request) {
	sse := datastar.NewSSE(w, r)
	count := 0
	logs := []string{}

	sse.PatchElementf(`<div id="stable-feed">Connection established at %s</div>`, time.Now().Format("15:04:05"))

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			log.Println("[stable] Client disconnected")
			return
		case <-ticker.C:
			count++
			logMsg := fmt.Sprintf("[%s] Event #%d", time.Now().Format("15:04:05"), count)
			logs = append(logs, logMsg)

			sse.MarshalAndPatchSignals(map[string]any{
				"count": count,
				"logs":  logs,
			})
		}
	}
}

// randomFailuresSSE - random failures on connect and mid-stream
func randomFailuresSSE(w http.ResponseWriter, r *http.Request) {
	// Random failure on connection
	if rand.Float32() < 0.50 {
		log.Println("[random-failures] Simulating connection failure")
		http.Error(w, "Random failure", http.StatusServiceUnavailable)
		return
	}

	sse := datastar.NewSSE(w, r)
	count := 0
	logs := []string{}

	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			log.Println("[random-failures] Client disconnected")
			return
		case <-ticker.C:
			count++
			logMsg := fmt.Sprintf("[%s] Event #%d", time.Now().Format("15:04:05"), count)
			logs = append(logs, logMsg)

			if count > 4 {
				log.Println("[random-failures] Simulating mid-stream failure")
				http.Error(w, "Random mid-stream failure", http.StatusServiceUnavailable)
				return
			}

			sse.MarshalAndPatchSignals(map[string]any{
				"count": count,
				"logs":  logs,
			})
			/*
				// Randomly disconnect mid-stream
				if rand.Float32() < 0.15 {
					failures++
					log.Println("[random-failures] Simulating silent mid-stream failure")
					return
				}
			*/
		}
	}
}

// delayedStartSSE - delays connection by 3 seconds
func delayedStartSSE(w http.ResponseWriter, r *http.Request) {
	log.Println("[delayed-start] Starting delayed connection...")
	time.Sleep(3 * time.Second)

	sse := datastar.NewSSE(w, r)
	count := 0
	logs := []string{}

	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			log.Println("[delayed-start] Client disconnected")
			return
		case <-ticker.C:
			count++
			logMsg := fmt.Sprintf("[%s] Event #%d", time.Now().Format("15:04:05"), count)
			logs = append(logs, logMsg)

			sse.MarshalAndPatchSignals(map[string]any{
				"count": count,
				"logs":  logs,
			})
		}
	}
}

// inactivityTestSSE - stops sending after 3 events
func inactivityTestSSE(w http.ResponseWriter, r *http.Request) {
	sse := datastar.NewSSE(w, r)
	count := 0
	logs := []string{}

	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			log.Println("[inactivity-test] Client disconnected")
			return
		case <-ticker.C:
			count++
			logMsg := fmt.Sprintf("[%s] Event #%d", time.Now().Format("15:04:05"), count)
			logs = append(logs, logMsg)

			sse.MarshalAndPatchSignals(map[string]any{
				"count": count,
				"logs":  logs,
			})

			// Stop after 3 events to trigger inactivity timeout
			if count >= 3 {
				log.Println("[inactivity-test] Stopping events (simulating inactivity)")
				// Just hang the connection without sending data
				<-r.Context().Done()
				return
			}
		}
	}
}
