using System.Threading;

namespace DevinXLaserAgent;

internal sealed class SingleInstanceGuard : IDisposable
{
    private readonly Mutex _mutex;
    public bool IsPrimary { get; }

    public SingleInstanceGuard(string name=@"Local\DevinXLaserAgent")
    {
        _mutex = new Mutex(initiallyOwned:true, name:name, createdNew:out var createdNew);
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
