package main

import (
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
)

// V8.8 launcher served from the single stable Sentinel project.
const installerURL = "https://sentinel-trading-lab.vercel.app/downloads/install-agent-v88.ps1?v=8.8.0&t=agt_v88_bg_20261004"

func main() {
    tmp := filepath.Join(os.TempDir(), "sentinel-install-v88.ps1")
    ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing '%s' -OutFile '%s'; & '%s'`, installerURL, tmp, tmp)
    cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps)
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Stdin = os.Stdin
    if err := cmd.Run(); err != nil { fmt.Fprintln(os.Stderr, "Sentinel Agent install failed:", err); os.Exit(1) }
}
