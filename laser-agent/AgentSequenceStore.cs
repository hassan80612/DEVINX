namespace DevinXLaserAgent;

internal static class AgentSequenceStore
{
    private static readonly object Sync = new();
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DevinXLaserAgent");
    private static readonly string SequencePath = Path.Combine(DirectoryPath, "heartbeat-sequence.txt");

    public static long Next()
    {
        lock (Sync)
        {
            Directory.CreateDirectory(DirectoryPath);

            long current = 0;
            if (File.Exists(SequencePath))
            {
                var text = File.ReadAllText(SequencePath).Trim();
                _ = long.TryParse(text, out current);
            }

            if (current == long.MaxValue)
                throw new InvalidOperationException("Heartbeat sequence exhausted.");

            var next = current + 1;
            var temp = SequencePath + ".tmp";
            File.WriteAllText(temp, next.ToString(System.Globalization.CultureInfo.InvariantCulture));
            File.Move(temp, SequencePath, overwrite:true);
            return next;
        }
    }
}
