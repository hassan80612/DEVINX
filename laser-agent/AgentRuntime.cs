namespace DevinXLaserAgent;

internal static class AgentRuntime
{
    public static bool MentorMode { get; private set; }

    public static void Configure(string[] args)
    {
        var exeName=Path.GetFileNameWithoutExtension(Environment.ProcessPath??"");
        MentorMode=args.Contains("--mentor",StringComparer.OrdinalIgnoreCase)
            ||exeName.Contains("Mentoria",StringComparison.OrdinalIgnoreCase)
            ||exeName.Contains("Mentor",StringComparison.OrdinalIgnoreCase);
    }

    public static string StateDirectory=>Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        MentorMode?"DevinXLaserMentor":"DevinXLaserAgent");
}
