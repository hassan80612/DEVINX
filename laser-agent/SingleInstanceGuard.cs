using System.Threading;

namespace DevinXLaserAgent;

internal sealed class SingleInstanceGuard : IDisposable
{
    private readonly Mutex _mutex;
    public bool IsPrimary { get; }

    public SingleInstanceGuard()
    {
        _mutex = new Mutex(initiallyOwned:true, name:@"Local\DevinXLaserAgent", createdNew:out var createdNew);
        IsPrimary = createdNew;
    }

    public void Dispose()
    {
        if (IsPrimary)
        {
            try { _mutex.ReleaseMutex(); } catch { }
        }
        _mutex.Dispose();
    }
}
