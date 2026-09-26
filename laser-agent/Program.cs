using System.Text.Json;

namespace DevinXLaserAgent;

internal static class Program
{
    public static async Task Main(string[] args)
    {
        Console.Title = "DevinX Laser Agent";
        Console.WriteLine("DevinX Laser Agent — safe foundation");
        Console.WriteLine("Remote machine commands are OFF.");
        Console.WriteLine();

        using var rest = new LightBurnRestClient();
        if (await rest.IsAvailableAsync())
        {
            Console.WriteLine("LightBurn REST API: AVAILABLE");

            if (args.Contains("--pair-rest", StringComparer.OrdinalIgnoreCase))
            {
                Console.WriteLine("A LightBurn consent dialog should appear on this PC.");
                try
                {
                    var secret = await rest.PairReadOnlyAsync();
                    SecureSecretStore.Save(secret);
                    Console.WriteLine("Read-only LightBurn pairing saved securely for this Windows user.");
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Pairing failed: " + ex.Message);
                }
            }

            var storedSecret = SecureSecretStore.Load();
            if (!string.IsNullOrWhiteSpace(storedSecret))
            {
                var status = await rest.GetStatusJsonAsync(storedSecret);
                if (status is null)
                {
                    Console.WriteLine("Stored LightBurn pairing is no longer authorized.");
                }
                else
                {
                    Console.WriteLine("LightBurn REST pairing: AUTHORIZED");
                    PrintCompact("Status", status);
                    var project = await rest.GetProjectJsonAsync(storedSecret);
                    if (project is not null)PrintCompact("Project", project);
                }
            }
            else
            {
                Console.WriteLine("LightBurn REST pairing: NOT PAIRED");
                Console.WriteLine("Run with --pair-rest to request read-only pairing.");
            }
        }
        else
        {
            Console.WriteLine("LightBurn REST API: NOT AVAILABLE");
            Console.WriteLine("Trying legacy UDP diagnostics on localhost...");
            var udp = new LightBurnUdpClient();
            var ping = await udp.PingAsync();
            Console.WriteLine("LightBurn UDP: " + ((ping.Received && ping.Response == "OK") ? "ONLINE" : "OFFLINE") + " (" + ping.Response + ")");
            if (ping.Received)
            {
                var status = await udp.StatusAsync();
                Console.WriteLine("Laser status: " + (status.Response == "OK" ? "IDLE" : status.Response == "!" ? "BUSY OR UNAVAILABLE" : status.Response));
            }
        }

        Console.WriteLine();
        Console.WriteLine("No Start, Stop, Pause, Frame, mouse, keyboard, shell, or remote desktop capability exists in this build.");
    }

    private static void PrintCompact(string label, string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            Console.WriteLine(label + ": " + JsonSerializer.Serialize(doc.RootElement));
        }
        catch { Console.WriteLine(label + ": received"); }
    }
}
