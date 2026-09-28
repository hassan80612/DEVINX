using System.Windows.Forms;

namespace DevinXLaserAgent;

internal static class MentorMode
{
    public static async Task RunAsync()
    {
        var identity=AgentIdentityStore.GetOrCreate();
        var proof=MentorProofFactory.Create(TimeSpan.FromMinutes(30));

        using var pairing=new DevinXMentorPairingClient();
        PairingOfferResult offered;
        try{offered=await pairing.PublishAsync(proof);}
        catch(Exception ex)
        {
            MessageBox.Show("Não foi possível iniciar a mentoria.\n\n"+ex.Message,"DevinX Mentoria",MessageBoxButtons.OK,MessageBoxIcon.Error);
            return;
        }

        if(!offered.Accepted)
        {
            MessageBox.Show(
                offered.Reason=="rate_limited"
                    ?"Muitas tentativas foram feitas neste computador. Aguarde alguns minutos e tente novamente."
                    :"Não foi possível gerar o código de mentoria.",
                "DevinX Mentoria",MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return;
        }

        using var codeWindow=new MentorCodeWindow(proof.PairingCode);
        await codeWindow.WaitUntilReadyAsync();

        var paired=false;
        while(DateTimeOffset.UtcNow<proof.ExpiresAt)
        {
            await Task.Delay(TimeSpan.FromSeconds(2));
            MentorStatusResult status;
            try{status=await pairing.GetStatusAsync(proof);}catch{continue;}

            if(status.Paired&&status.SessionActive)
            {
                paired=true;
                codeWindow.SetConnected();
                break;
            }

            if(!status.OfferPending)
            {
                codeWindow.Close();
                MessageBox.Show("Este código expirou. Abra a Mentoria novamente para gerar outro.","DevinX Mentoria",MessageBoxButtons.OK,MessageBoxIcon.Information);
                return;
            }
        }

        if(!paired)
        {
            codeWindow.Close();
            MessageBox.Show("O código expirou. Abra a Mentoria novamente.","DevinX Mentoria",MessageBoxButtons.OK,MessageBoxIcon.Information);
            return;
        }

        await Task.Delay(650);
        codeWindow.Close();

        using var tray=new TrayHost(mentorMode:true);
        await tray.WaitUntilReadyAsync();
        tray.SetStatus("DevinX Mentoria — professor conectado");
        tray.ShowInfo("DevinX Mentoria","Sessão conectada. Ao encerrar, o acesso temporário será revogado.");

        tray.UninstallRequested+=()=>{
            _=Task.Run(async()=>{
                try
                {
                    using var commandClient=new DevinXCommandClient();
                    using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    await commandClient.NotifyUninstallAsync(identity,timeout.Token);
                }catch{}
                tray.RequestExit();
            });
        };

        var continuous=new ContinuousAgent(identity,tray,temporarySession:true);
        try{await continuous.RunAsync(tray.ExitToken);}
        finally
        {
            try
            {
                using var commandClient=new DevinXCommandClient();
                using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(4));
                await commandClient.NotifyUninstallAsync(identity,timeout.Token);
            }catch{}
            try{AgentLocalState.ResetAll();}catch{}
        }
    }
}
