using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace DevinXLaserAgent;

internal sealed class TrayHost : IDisposable
{
    private readonly Thread _thread;
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CancellationTokenSource _exit = new();
    private SynchronizationContext? _sync;
    private NotifyIcon? _icon;

    public CancellationToken ExitToken => _exit.Token;
    public event Action? RefreshRequested;

    public TrayHost()
    {
        _thread = new Thread(RunUi)
        {
            IsBackground = true,
            Name = "DevinX Laser Agent Tray"
        };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
    }

    public async Task WaitUntilReadyAsync() => await _ready.Task.ConfigureAwait(false);

    private void RunUi()
    {
        var sync = new WindowsFormsSynchronizationContext();
        SynchronizationContext.SetSynchronizationContext(sync);
        _sync = sync;

        var menu = new ContextMenuStrip();
        var open = new ToolStripMenuItem("Abrir Laser Control");
        open.Click += (_, _) => OpenDashboard();
        var refresh = new ToolStripMenuItem("Atualizar agora");
        refresh.Click += (_, _) => RefreshRequested?.Invoke();
        var exit = new ToolStripMenuItem("Sair");
        exit.Click += (_, _) =>
        {
            _exit.Cancel();
            _icon!.Visible = false;
            Application.ExitThread();
        };

        menu.Items.Add(open);
        menu.Items.Add(refresh);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exit);

        _icon = new NotifyIcon
        {
            Visible = true,
            Icon = SystemIcons.Application,
            Text = "DevinX Laser Agent",
            ContextMenuStrip = menu
        };
        _icon.DoubleClick += (_, _) => OpenDashboard();

        _ready.TrySetResult();
        Application.Run();

        _icon.Visible = false;
        _icon.Dispose();
        menu.Dispose();
    }

    public void SetStatus(string text)
    {
        var safe = string.IsNullOrWhiteSpace(text) ? "DevinX Laser Agent" : text.Trim();
        if (safe.Length > 63) safe = safe[..63];

        _sync?.Post(_ =>
        {
            if (_icon is not null) _icon.Text = safe;
        }, null);
    }

    public void ShowInfo(string title, string text)
    {
        _sync?.Post(_ =>
        {
            _icon?.ShowBalloonTip(3500, title, text, ToolTipIcon.Info);
        }, null);
    }

    private static void OpenDashboard()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "https://devinx.com.br/laser-control",
                UseShellExecute = true
            });
        }
        catch { }
    }

    public void Dispose()
    {
        try { _exit.Cancel(); } catch { }
        _sync?.Post(_ => Application.ExitThread(), null);
    }
}
