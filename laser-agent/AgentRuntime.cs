namespace DevinXLaserAgent;

internal static class AgentRuntime
{
#if DEVINX_MENTOR_ONLY
    public const bool MentorMode = true;
#else
    public const bool MentorMode = false;
#endif

    public static void Configure(string[] args)
    {
        // The executable role is fixed at build time. Renaming the file or
        // passing command-line flags cannot turn Mentoria into the permanent Agent.
        _ = args;
    }

    public static string StateDirectory=>Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        MentorMode?"DevinXLaserMentor":"DevinXLaserAgent");
}
