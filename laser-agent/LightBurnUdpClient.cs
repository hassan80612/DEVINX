using System.Net;
using System.Net.Sockets;
using System.Text;

namespace DevinXLaserAgent;

internal sealed class LightBurnUdpClient
{
    private const int CommandPort = 19840;
    private const int ResponsePort = 19841;
    private static readonly IPAddress Loopback = IPAddress.Loopback;

    public Task<LightBurnReply> PingAsync(CancellationToken cancellationToken = default) =>
        SendAsync("PING", cancellationToken);

    public Task<LightBurnReply> StatusAsync(CancellationToken cancellationToken = default) =>
        SendAsync("STATUS", cancellationToken);

    private static async Task<LightBurnReply> SendAsync(string command, CancellationToken cancellationToken)
    {
        // Safe foundation: only documented diagnostic commands are allowed.
        if (command is not ("PING" or "STATUS"))
            throw new InvalidOperationException("Command is not allowed by the safe foundation Agent.");

        using var receiver = new UdpClient(new IPEndPoint(Loopback, ResponsePort));
        using var sender = new UdpClient();

        var bytes = Encoding.ASCII.GetBytes(command);
        await sender.SendAsync(bytes, new IPEndPoint(Loopback, CommandPort), cancellationToken);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(2));

        try
        {
            var response = await receiver.ReceiveAsync(timeout.Token);
            var text = Encoding.ASCII.GetString(response.Buffer).Trim();
            return new LightBurnReply(command, text, true);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new LightBurnReply(command, "TIMEOUT", false);
        }
    }
}

internal sealed record LightBurnReply(string Command, string Response, bool Received);
