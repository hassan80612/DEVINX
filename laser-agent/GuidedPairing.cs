using System.Diagnostics;

namespace DevinXLaserAgent;

internal static class GuidedPairing
{
    public static async Task<bool> RunAsync(AgentIdentity identity)
    {
        var proof = PairingProofFactory.Create(TimeSpan.FromMinutes(5));

        using var pairingClient = new DevinXPairingClient();
        PairingOfferResult published;
        try
        {
            published = await pairingClient.PublishAsync(proof);
        }
        catch (Exception ex)
        {
            Console.WriteLine("Não foi possível iniciar a conexão com o DevinX: " + ex.Message);
            return false;
        }

        if (!published.Accepted)
        {
            Console.WriteLine("Não foi possível iniciar a conexão com o DevinX: " + published.Reason);
            return false;
        }

        var machineName = string.IsNullOrWhiteSpace(Environment.MachineName) ? "PC Windows" : Environment.MachineName;
        var url = "https://devinx.com.br/laser-control/connect?code="
            + Uri.EscapeDataString(proof.PairingCode)
            + "&name="
            + Uri.EscapeDataString(machineName);

        Console.WriteLine();
        Console.WriteLine("Abrindo o DevinX no navegador...");
        Console.WriteLine("Confirme em \"Vincular este PC\". Não precisa copiar código.");

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }
        catch
        {
            Console.WriteLine("O navegador não abriu sozinho.");
            Console.WriteLine("Abra este endereço:");
            Console.WriteLine(url);
        }

        while (DateTimeOffset.UtcNow < proof.ExpiresAt)
        {
            await Task.Delay(TimeSpan.FromSeconds(2));
            PairingStatusResult status;
            try
            {
                status = await pairingClient.GetStatusAsync(proof);
            }
            catch
            {
                continue;
            }

            if (status.Paired)
            {
                AgentPairingStateStore.MarkPaired(identity.DeviceId);
                Console.WriteLine();
                Console.WriteLine("PC conectado ao DevinX com sucesso.");
                return true;
            }

            if (!status.OfferPending)
            {
                Console.WriteLine("A solicitação não está mais disponível. Abra o Agent novamente.");
                return false;
            }
        }

        Console.WriteLine("A solicitação expirou. Abra o Agent novamente.");
        return false;
    }
}
