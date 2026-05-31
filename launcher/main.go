package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Version is injected at build time: -ldflags="-X main.Version=1.3.0"
var Version = "dev"

const (
	repoOwner  = "hbkdad"
	repoName   = "selfclawy"
	dashURL    = "http://localhost:3001"
	composeRaw = "https://raw.githubusercontent.com/hbkdad/selfclawy/main/docker-compose.yml"
	envRaw     = "https://raw.githubusercontent.com/hbkdad/selfclawy/main/.env.example"
)

type ghRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

func main() {
	banner()
	go checkUpdate()
	step("Checking Docker", checkDocker)
	// Always re-fetch compose file so fixes/updates are picked up on every run
	step("Downloading docker-compose.yml", func() error { return download("docker-compose.yml", composeRaw) })
	downloadIfMissing(".env", envRaw)
	promptFirstRun()
	runCompose("pull")
	runCompose("up", "-d")
	waitForDash()
	openBrowser(dashURL)
	fmt.Println()
	fmt.Println("  ✓  Beacon is running at", dashURL)
	fmt.Println("  Press Ctrl+C to stop.\n")
	select {}
}

func banner() {
	fmt.Printf(`
  ▸ beacon  v%s
  AI that works for you, 24/7.
  Self-hosted control plane for OpenClaw + Hermes + Ollama.

`, Version)
}

func checkUpdate() {
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", repoOwner, repoName))
	if err != nil {
		return
	}
	defer resp.Body.Close()
	var r ghRelease
	if json.NewDecoder(resp.Body).Decode(&r) != nil {
		return
	}
	latest := strings.TrimPrefix(r.TagName, "v")
	if latest != "" && latest != Version && Version != "dev" {
		fmt.Printf("  ⬆  Update available: v%s → v%s\n  Download: %s\n\n", Version, latest, r.HTMLURL)
	}
}

func step(label string, fn func() error) {
	fmt.Printf("  %-30s", label+"...")
	if err := fn(); err != nil {
		fmt.Println("✗")
		fmt.Fprintln(os.Stderr, "\n  Error:", err)
		os.Exit(1)
	}
	fmt.Println("✓")
}

func checkDocker() error {
	cmd := exec.Command("docker", "info")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Docker is not running.\n\n  Please start Docker Desktop and try again.\n  Install Docker: https://docs.docker.com/get-docker/")
	}
	return nil
}

func download(dst, url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func downloadIfMissing(dst, url string) {
	if _, err := os.Stat(dst); err == nil {
		return
	}
	step("Downloading "+dst, func() error { return download(dst, url) })
}

func promptFirstRun() {
	data, err := os.ReadFile(".env")
	if err != nil {
		return
	}
	content := string(data)

	// Only prompt if ANTHROPIC_API_KEY is unset (no value after =)
	if !strings.Contains(content, "ANTHROPIC_API_KEY=\n") &&
		!strings.Contains(content, "ANTHROPIC_API_KEY= \n") {
		return
	}

	fmt.Println("\n  ── First-run setup ────────────────────────────────────")
	fmt.Println("  You need an AI API key to start. Get one free at:")
	fmt.Println("  https://console.anthropic.com/\n")
	fmt.Print("  Anthropic API key (sk-ant-...): ")

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	key := strings.TrimSpace(scanner.Text())

	if strings.HasPrefix(key, "sk-") {
		updated := strings.Replace(content, "ANTHROPIC_API_KEY=", "ANTHROPIC_API_KEY="+key, 1)
		if err := os.WriteFile(".env", []byte(updated), 0600); err != nil {
			fmt.Println("  Warning: could not write .env:", err)
		} else {
			fmt.Println("  ✓ API key saved to .env\n")
		}
	} else {
		fmt.Println("  Skipping — edit .env manually before starting.\n")
	}
}

func runCompose(args ...string) {
	full := append([]string{"compose"}, args...)
	if args[0] == "pull" {
		fmt.Println("  Pulling latest images (this may take a minute on first run)...")
	} else {
		fmt.Println("  Starting Beacon stack...")
	}
	cmd := exec.Command("docker", full...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
}

func waitForDash() {
	fmt.Print("  Waiting for dashboard ")
	client := &http.Client{Timeout: 3 * time.Second}
	for i := 0; i < 90; i++ {
		resp, err := client.Get(dashURL + "/api/setup/status")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			fmt.Println(" ✓")
			return
		}
		fmt.Print(".")
		time.Sleep(2 * time.Second)
	}
	fmt.Println(" (timeout — try opening manually)")
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
