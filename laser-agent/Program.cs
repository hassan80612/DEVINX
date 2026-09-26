using System.Diagnostics;
using System.Text.Json;

namespace DevinXLaserAgent;

internal static class Program
{
    public static async Task Main(string[] args)
    {
        using var singleInstance = new SingleInstanceGuard();
        if (!singleInstance.IsPrimary)
        {
            if (!args.Contains("--background", StringComparer.OrdinalIgnoreCase))
                OpenDashboard();
            return;
        }

        if (args.Contains("--reset-local-state", StringComparer.OrdinalIgnoreCase))
        {
            if (!args.Contains("--confirm-reset", StringComparer.OrdinalIgnoreCase))
            {
                Console.WriteLine("Para apagar o vínculo local, use também --confirm-reset.");
                return;
            }

            AgentLocalState.ResetAll();
            Console.WriteLine("Dados locais do DevinX Laser Agent removidos.");
            return;
        }

        var backgroundMode = args.Contains("--background", StringComparer.OrdinalIgnoreCase);
        var guidedMode = args.Length == 0 || backgroundMode;
        if (!guidedMode)
            ConsoleHost.AttachForTechnicalMode();

        var identity = AgentIdentityStore.GetOrCreate();

        if (guidedMode)
        {
            if (!AgentPairingStateStore.IsPaired(identity.DeviceId))
            {
                if (backgroundMode) return;

                Console.WriteLine("DevinX Laser Agent");
                Console.WriteLine("Preparando a conexão com sua conta DevinX...");
                if (!await GuidedPairing.RunAsync(identity))
                {
                    Console.WriteLine();
                    Console.WriteLine("Não foi possível concluir. Abra o Agent novamente para tentar.");
                    await Task.Delay(2200);
                    return;
                }
            }

            StartupRegistration.EnsureRegistered();
            ConsoleWindow.Hide();

            using var tray = new TrayHost();
            await tray.WaitUntilReadyAsync();
            tray.SetStatus("DevinX Laser Agent — iniciando");
            if (!backgroundMode)
                tray.ShowInfo("DevinX Laser Agent", "Conectado. O Agent continuará rodando em segundo plano.");

            var continuous = new ContinuousAgent(identity, tray);
            await continuous.RunAsync(tray.ExitToken);
            return;
        }

        Console.WriteLine("DevinX Laser Agent — modo técnico");
        Console.WriteLine("Comandos físicos remotos estão DESLIGADOS.");
        Console.WriteLine("Agent device: " + identity.DeviceId);
        Console.WriteLine("Agent fingerprint: " + identity.PublicKeyFingerprint);
        Console.WriteLine();

        if (args.Contains("--pair-devinx", StringComparer.OrdinalIgnoreCase))
        {
            await RunManualPairingAsync(identity);
            return;
        }

        if (args.Contains("--pair-rest", StringComparer.OrdinalIgnoreCase))
        {
            await RunRestPairingAsync();
            return;
        }

        if (args.Contains("--heartbeat-once", StringComparer.OrdinalIgnoreCase)
            || args.Contains("--json-status", StringComparer.OrdinalIgnoreCase))
        {
            await RunOneShotDiagnosticsAsync(args, identity);
            return;
        }

        Console.WriteLine("Nenhuma ação técnica informada.");
    }

    private static async Task RunManualPairingAsync(AgentIdentity identity)
    {
        var proof = PairingProofFactory.Create(TimeSpan.FromMinutes(5));
        Console.WriteLine("DevinX pairing code: " + proof.PairingCode);
        Console.WriteLine("Expires (UTC): " + proof.ExpiresAt.ToString("O"));

        using var pairingClient = new DevinXPairingClient();
        try
        {
            var result = await pairingClient.PublishAsync(proof);
            if (!result.Accepted)
            {
                Console.WriteLine("Pairing offer rejected: " + result.Reason);
                return;
            }

            Console.WriteLine("Pairing offer securely published.");
            Console.WriteLine("Waiting for the account to claim this PC...");

            while (DateTimeOffset.UtcNow < proof.ExpiresAt)
            {
                await Task.Delay(TimeSpan.FromSeconds(5));
                var status = await pairingClient.GetStatusAsync(proof);
                if (status.Paired)
                {
                    AgentPairingStateStore.MarkPaired(identity.DeviceId);
                    StartupRegistration.EnsureRegistered();
                    Console.WriteLine("PC linked to DevinX successfully.");
                    return;
                }

                if (!status.OfferPending)
                {
                    Console.WriteLine("Pairing offer is no longer pending.");
                    return;
                }
            }

            Console.WriteLine("Pairing code expired.");
        }
        catch (Exception ex)
        {
            Console.WriteLine("Could not publish pairing offer: " + ex.Message);
        }
    }

    private static async Task RunRestPairingAsync()
    {
        using var rest = new LightBurnRestClient();
        if (!await rest.IsAvailableAsync())
        {
            Console.WriteLine("LightBurn REST API: NOT AVAILABLE");
            return;
        }

        Console.WriteLine("Confirme a autorização de leitura no LightBurn.");
        try
        {
            var secret = await rest.PairReadOnlyAsync();
            SecureSecretStore.Save(secret);
            Console.WriteLine("LightBurn autorizado para leitura.");
        }
        catch (Exception ex)
        {
            Console.WriteLine("Não foi possível autorizar o LightBurn: " + ex.Message);
        }
    }

    private static async Task RunOneShotDiagnosticsAsync(string[] args, AgentIdentity identity)
    {
        AgentTelemetry telemetry;
        using var rest = new LightBurnRestClient();

        if (await rest.IsAvailableAsync())
        {
            var secret = SecureSecretStore.Load();
            if (!string.IsNullOrWhiteSpace(secret))
            {
                var status = await rest.GetStatusJsonAsync(secret);
                if (status is not null)
                {
                    var project = await rest.GetProjectJsonAsync(secret);
                    var poll = await rest.GetPollSnapshotJsonAsync(secret);
                    telemetry = AgentTelemetryFactory.FromRest(identity, status, project, poll);
                    await FinishOneShotAsync(args, identity, telemetry);
                    return;
                }
            }
        }

        var udp = new LightBurnUdpClient();
        var ping = await udp.PingAsync();
        if (!ping.Received)
            telemetry = AgentTelemetryFactory.Offline(identity);
        else
            telemetry = AgentTelemetryFactory.FromLegacyUdp(identity, ping, await udp.StatusAsync());

        await FinishOneShotAsync(args, identity, telemetry);
    }

    private static async Task FinishOneShotAsync(string[] args, AgentIdentity identity, AgentTelemetry telemetry)
    {
        Console.WriteLine("LightBurn: " + (telemetry.LightBurnOnline ? "CONECTADO" : "NÃO DETECTADO"));
        Console.WriteLine("Estado: " + telemetry.JobState);

        if (args.Contains("--json-status", StringComparer.OrdinalIgnoreCase))
            Console.WriteLine("Telemetry: " + JsonSerializer.Serialize(telemetry));

        if (!args.Contains("--heartbeat-once", StringComparer.OrdinalIgnoreCase)) return;

        using var heartbeat = new DevinXHeartbeatClient();
        try
        {
            var result = await heartbeat.SendAsync(identity, telemetry);
            Console.WriteLine(result.Accepted
                ? "Estado enviado ao DevinX."
                : "O DevinX recusou o estado: " + result.Reason);
        }
        catch (Exception ex)
        {
            Console.WriteLine("Não foi possível enviar o estado ao DevinX: " + ex.Message);
        }
    }

    private static void OpenDashboard()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "https://devinx.com.br/laser-control",
                UseShellExecute = true
            });
        }
        catch { }
    }
}
