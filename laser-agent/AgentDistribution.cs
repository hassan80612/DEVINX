namespace DevinXLaserAgent;

internal static class AgentDistribution
{
    // Store builds are installed, updated and removed only by Windows.
    public static bool IsStoreBuild =>
#if DEVINX_STORE
        true;
#else
        false;
#endif
}
