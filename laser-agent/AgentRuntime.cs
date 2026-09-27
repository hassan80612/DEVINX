namespace DevinXLaserAgent;

internal static class AgentRuntime
{
    public static bool MentorMode { get; private set; }

    public static void Configure(string[] args)
    {
        MentorMode=args.Contains("--mentor",StringComparer.OrdinalIgnoreCase);
    }

    public static string StateDirectory=>Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        MentorMode?"DevinXLaserMentor":"DevinXLaserAgent");
}
