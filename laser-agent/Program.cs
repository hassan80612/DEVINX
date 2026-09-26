using System.Text.Json;

namespace DevinXLaserAgent;

internal static class Program
{
    public static async Task Main(string[] args)
    {
        Console.Title = "DevinX Laser Agent";
        var guidedMode = args.Length == 0;

        Console.WriteLine("DevinX Laser Agent");
        Console.WriteLine("Comandos físicos remotos estão DESLIGADOS.");
        Console.WriteLine();

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

        var identity = AgentIdentityStore.GetOrCreate();
        var autoHeartbeat = false;

        if (guidedMode)
        {
            if (!AgentPairingStateStore.IsPaired(identity.DeviceId))
            {
                Console.WriteLine("Preparando a conexão com sua conta DevinX...");
                if (!await GuidedPairing.RunAsync(identity))
                {
                    Console.WriteLine();
                    Console.WriteLine("Não foi possível concluir. Abra o Agent novamente para tentar.");
                    await Task.Delay(2500);
                    return;
                }
            }
            else
            {
                Console.WriteLine("Este PC já está vinculado ao DevinX.");
            }

            autoHeartbeat = true;
        }
        else
        {
            Console.WriteLine("Agent device: " + identity.DeviceId);
            Console.WriteLine("Agent fingerprint: " + identity.PublicKeyFingerprint);

            if (args.Contains("--pair-devinx", StringComparer.OrdinalIgnoreCase))
            {
                var proof = PairingProofFactory.Create(TimeSpan.FromMinutes(5));
                Console.WriteLine();
                Console.WriteLine("DevinX pairing code: " + proof.PairingCode);
                Console.WriteLine("Expires (UTC): " + proof.ExpiresAt.ToString("O"));

                using var pairingClient = new DevinXPairingClient();
                try
                {
                    var result = await pairingClient.PublishAsync(proof);
                    if (!result.Accepted)
                    {
                        Console.WriteLine("Pairing offer rejected: " + result.Reason);
                    }
                    else
                    {
                        Console.WriteLine("Pairing offer securely published.");
                        Console.WriteLine("Waiting for the account to claim this PC...");

                        while (DateTimeOffset.UtcNow < proof.ExpiresAt)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(5));
                            var status = await pairingClient.GetStatusAsync(proof);
                            if (status.Paired)
                            {
                                AgentPairingStateStore.MarkPaired(identity.DeviceId);
                                Console.WriteLine("PC linked to DevinX successfully.");
                                break;
                            }
                            if (!status.OfferPending)
                            {
                                Console.WriteLine("Pairing offer is no longer pending.");
                                break;
                            }
                        }

                        if (DateTimeOffset.UtcNow >= proof.ExpiresAt)
                            Console.WriteLine("Pairing code expired.");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Could not publish pairing offer: " + ex.Message);
                }
            }
        }

        Console.WriteLine();
        Console.WriteLine("Verificando o LightBurn...");

        using var rest = new LightBurnRestClient();
        var restAvailable = await rest.IsAvailableAsync();

        if (restAvailable && args.Contains("--pair-rest", StringComparer.OrdinalIgnoreCase))
        {
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

        var storedSecret = restAvailable ? SecureSecretStore.Load() : null;
        if (restAvailable && !string.IsNullOrWhiteSpace(storedSecret))
        {
            var status = await rest.GetStatusJsonAsync(storedSecret);
            if (status is not null)
            {
                Console.WriteLine("LightBurn: CONECTADO");
                var project = await rest.GetProjectJsonAsync(storedSecret);
                var poll = await rest.GetPollSnapshotJsonAsync(storedSecret);
                var telemetry = AgentTelemetryFactory.FromRest(identity, status, project, poll);
                if (args.Contains("--json-status", StringComparer.OrdinalIgnoreCase))
                    Console.WriteLine("Telemetry: " + JsonSerializer.Serialize(telemetry));
                await SendHeartbeatAsync(args, identity, telemetry, autoHeartbeat);

                if (guidedMode)
                {
                    Console.WriteLine();
                    Console.WriteLine("Tudo certo. O DevinX recebeu o estado deste PC.");
                    await Task.Delay(1800);
                }
                return;
            }

            Console.WriteLine("A autorização anterior do LightBurn não é mais válida.");
        }

        if (restAvailable)
            Console.WriteLine("LightBurn encontrado. Telemetria avançada ainda não foi autorizada.");

        await TryLegacyUdpAsync(args, identity, autoHeartbeat);

        Console.WriteLine();
        Console.WriteLine("Start, Stop, Pause e Frame remotos continuam indisponíveis nesta versão.");

        if (guidedMode)
        {
            Console.WriteLine("Pronto. O teste terminou.");
            await Task.Delay(1800);
        }
    }

    private static async Task TryLegacyUdpAsync(string[] args, AgentIdentity identity, bool autoHeartbeat)
    {
        Console.WriteLine("Tentando diagnóstico local compatível...");
        var udp = new LightBurnUdpClient();
        var ping = await udp.PingAsync();
        var online = ping.Received && ping.Response == "OK";
        Console.WriteLine("LightBurn: " + (online ? "CONECTADO" : "NÃO DETECTADO"));

        if (!ping.Received) return;

        var status = await udp.StatusAsync();
        var telemetry = AgentTelemetryFactory.FromLegacyUdp(identity, ping, status);
        if (args.Contains("--json-status", StringComparer.OrdinalIgnoreCase))
            Console.WriteLine("Telemetry: " + JsonSerializer.Serialize(telemetry));
        await SendHeartbeatAsync(args, identity, telemetry, autoHeartbeat);
    }

    private static async Task SendHeartbeatAsync(
        string[] args,
        AgentIdentity identity,
        AgentTelemetry telemetry,
        bool autoHeartbeat)
    {
        if (!autoHeartbeat && !args.Contains("--heartbeat-once", StringComparer.OrdinalIgnoreCase)) return;

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
}
