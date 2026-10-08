package main

import (
    _ "embed"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
)

//go:embed public/downloads/install-agent-v88.ps1
var installerPS1 []byte

//go:embed public/downloads/agent_payload_v88.zip
var payloadZIP []byte

func fail(msg string, err error) {
    text := msg
    if err != nil {
        text += ": " + err.Error()
    }
    // On Windows CI / install verification, never show a modal error dialog:
    // report the real installer failure to stderr and exit instead of hanging.
    if os.Getenv("SENTINEL_INSTALL_TEST") != "1" && os.Getenv("CI") != "true" {
        dlg := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
            "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:SENTINEL_ERROR,'Sentinel Agent') | Out-Null",
        )
        dlg.Env = append(os.Environ(), "SENTINEL_ERROR="+text)
        _ = dlg.Run()
    }
    fmt.Fprintln(os.Stderr, text)
    os.Exit(1)
}

func main() {
    tmpRoot, err := os.MkdirTemp("", "SentinelAgentV88-")
    if err != nil {
        fail("Não foi possível preparar a instalação", err)
    }

    defer os.RemoveAll(tmpRoot)

    installerPath := filepath.Join(tmpRoot, "install-agent-v88.ps1")
    payloadPath := filepath.Join(tmpRoot, "agent_payload_v88.zip")

    if err := os.WriteFile(installerPath, installerPS1, 0o600); err != nil {
        fail("Não foi possível preparar o instalador", err)
    }
    if err := os.WriteFile(payloadPath, payloadZIP, 0o600); err != nil {
        fail("Não foi possível preparar os arquivos do Agent", err)
    }

    cmd := exec.Command(
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", installerPath,
        "-LocalPayload", payloadPath,
    )
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Stdin = os.Stdin
    cmd.Env = append(os.Environ(), "SENTINEL_INSTALL_SOURCE=embedded-exe")

    if err := cmd.Run(); err != nil {
        fail("A instalação do Sentinel Agent não foi concluída", err)
    }

    // Open the product after a successful install.
    if os.Getenv("SENTINEL_INSTALL_TEST") != "1" {
        _ = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", "https://sentinel-trading-lab.vercel.app").Start()
    }

    _ = os.Remove(installerPath)
    _ = os.Remove(payloadPath)
    _ = os.Remove(tmpRoot)
}
