using System.Drawing;
using System.Windows.Forms;

namespace DevinXLaserAgent;

internal sealed class MentorCodeWindow:IDisposable
{
    private readonly Thread _thread;
    private readonly TaskCompletionSource<bool> _ready=new(TaskCreationOptions.RunContinuationsAsynchronously);
    private SynchronizationContext? _sync;
    private Form? _form;
    private Label? _status;

    public MentorCodeWindow(string code)
    {
        _thread=new Thread(()=>Run(code)){IsBackground=true,Name="DevinX Mentor Code"};
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
    }

    public Task WaitUntilReadyAsync()=>_ready.Task;

    private void Run(string code)
    {
        var sync=new WindowsFormsSynchronizationContext();
        SynchronizationContext.SetSynchronizationContext(sync);
        _sync=sync;

        var form=new Form{
            Text="DevinX · Mentoria LightBurn",
            Width=520,Height=350,StartPosition=FormStartPosition.CenterScreen,
            FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=true,
            BackColor=Color.FromArgb(13,17,23),ForeColor=Color.White,
            Font=new Font("Segoe UI",10)
        };
        _form=form;

        var title=new Label{
            Text="CÓDIGO DE MENTORIA",Left=32,Top=30,Width=440,Height=28,
            ForeColor=Color.FromArgb(114,225,255),Font=new Font("Segoe UI",10,FontStyle.Bold)
        };
        var hint=new Label{
            Text="Envie este código ao professor. Válido por 30 minutos.",
            Left=32,Top=66,Width=440,Height=28,ForeColor=Color.FromArgb(190,199,212)
        };
        var codeLabel=new Label{
            Text=code,Left=32,Top=110,Width=440,Height=70,
            TextAlign=ContentAlignment.MiddleCenter,BackColor=Color.FromArgb(24,31,42),
            ForeColor=Color.White,Font=new Font("Consolas",28,FontStyle.Bold),
            BorderStyle=BorderStyle.FixedSingle
        };
        var copy=new Button{
            Text="Copiar código",Left=32,Top=196,Width=210,Height=42,
            FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(37,183,222),
            ForeColor=Color.FromArgb(4,15,20)
        };
        copy.Click+=(_,_)=>{try{Clipboard.SetText(code);}catch{}};

        _status=new Label{
            Text="Aguardando o professor conectar… Sessão: até 6 horas.",Left=32,Top=255,Width=440,Height=32,
            ForeColor=Color.FromArgb(141,151,166)
        };
        form.Controls.AddRange([title,hint,codeLabel,copy,_status]);
        _ready.TrySetResult(true);
        Application.Run(form);
    }

    public void SetConnected()
    {
        _sync?.Post(_=>{
            if(_status is not null){
                _status.Text="Professor conectado. Você pode fechar esta janela.";
                _status.ForeColor=Color.FromArgb(111,225,169);
            }
        },null);
    }

    public void Close()
    {
        _sync?.Post(_=>{try{_form?.Close();}catch{}},null);
    }

    public void Dispose()=>Close();
}
