using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Text.Json;
using UIA=Interop.UIAutomationClient;

namespace DevinXLaserAgent;

internal sealed record LightBurnControlField(
    string Key,string Label,string Kind,string? Value,bool? Checked,bool Writable);
internal sealed record LightBurnControlLayer(
    string Id,string Label,bool Selected);
internal sealed record LightBurnControlSnapshot(
    string? WindowTitle,LightBurnControlLayer[] Layers,LightBurnControlField[] Fields);
internal sealed record LightBurnControlBridgeResult(
    bool Ok,string? Reason,LightBurnControlSnapshot? Snapshot);

internal static class LightBurnControlBridge
{
    private const int InvokePatternId=10000;
    private const int ValuePatternId=10002;
    private const int RangeValuePatternId=10003;
    private const int SelectionItemPatternId=10010;
    private const int TogglePatternId=10015;
    private const int LegacyPatternId=10018;
    private const int StateSystemSelected=0x2;
    private const int StateSystemFocused=0x4;
    private const int StateSystemChecked=0x10;
    private const int SelFlagTakeSelection=0x2;

    private sealed record FieldSpec(string Key,string Label,string Kind,string[] Aliases);
    private sealed record Bounds(double Left,double Top,double Right,double Bottom)
    {
        public double Width=>Math.Max(0,Right-Left);
        public double Height=>Math.Max(0,Bottom-Top);
        public bool IsEmpty=>Width<=0||Height<=0;
    }
    private sealed record Node(
        object Element,string Name,string SearchText,int ControlType,Bounds Rect,bool Enabled,bool Offscreen);

    private static readonly FieldSpec[] Specs=
    [
        new("speed","Velocidade","number",["Speed","Velocidade","Velocidad","Vitesse","Geschwindigkeit","السرعة"]),
        new("powerMax","Potência","number",["Power Max","Max Power","Maximum Power","Potência Máx","Potencia Máx","Puissance Max","Max Leistung","الطاقة"]),
        new("powerMin","Potência mín.","number",["Power Min","Min Power","Minimum Power","Potência Mín","Potencia Mín","Puissance Min","Min Leistung"]),
        new("passes","Passes","number",["Pass Count","Passes","Number of Passes","Número de Passes","Pasadas","Passages","Durchgänge"]),
        new("interval","Intervalo","number",["Line Interval","Interval","Intervalo","Intervalle","Linienabstand"]),
        new("frequency","Frequência","number",["Frequency","Frequência","Frecuencia","Fréquence","Frequenz","التردد"]),
        new("qPulse","Q-Pulse","number",["Q-Pulse","Q Pulse","Pulse Width","Q-Pulse Width"]),
        new("scanAngle","Ângulo","number",["Scan Angle","Angle","Ângulo","Ángulo","Angle de balayage","Scanwinkel"]),
        new("angleIncrement","Incremento ângulo","number",["Angle Increment","Incremento de Ângulo","Incremento de ángulo","Winkelinkrement"]),
        new("overscan","Overscan","toggle",["Overscanning","Overscan"]),
        new("crossHatch","Cross-hatch","toggle",["Cross-Hatch","Cross Hatch","Hachura cruzada","Tramado cruzado"]),
        new("airAssist","Air Assist","toggle",["Air Assist","Assistência de ar","Asistencia de aire"]),
        new("output","Saída","toggle",["Output","Saída","Salida","Sortie","Ausgabe"]),
        new("rotaryEnabled","Ativar rotativo","toggle",["Enable Rotary","Enable Rotary Mode","Rotary Enable","Ativar rotativo","Habilitar rotativo"]),
        new("stepsPerRotation","Passos por rotação","number",["Steps Per Rotation","Steps per rev","Passos por rotação","Pasos por rotación"]),
        new("mmPerRotation","MM por rotação","number",["MM Per Rotation","mm per rotation","MM/Rotation","MM por rotação"]),
        new("rollerDiameter","Diâmetro do rolete","number",["Roller Diameter","Diâmetro do rolete","Diámetro del rodillo"]),
        new("objectDiameter","Diâmetro do objeto","number",["Object Diameter","Diâmetro do objeto","Diámetro del objeto"]),
        new("circumference","Circunferência","number",["Circumference","Circunferência","Circunferencia"]),
        new("splitSize","Tamanho da divisão","number",["Split Size","Split size","Tamanho do split","Tamanho da divisão"]),
        new("overlap","Sobreposição","number",["Overlap","Sobreposição","Superposición"]),
        new("minSpeed","Velocidade mínima","number",["Min Speed","Minimum Speed","Velocidade mínima","Velocidade mín.","Velocidade min."]),
        new("maxSpeed","Velocidade máxima","number",["Max Speed","Maximum Speed","Velocidade máxima","Velocidade máx.","Velocidade max."]),
        new("accelerationTime","Aceleração","number",["Acceleration Time","Acceleration","Tempo de aceleração"]),
        new("returnSpeed","Velocidade de retorno","number",["Return Speed","Velocidade de retorno","Veloc. de retorno"]),
        new("outputCenter","Centro de saída","number",["Output Center","Centro de saída"]),
        new("reverseRotary","Inverter direção","toggle",["Reverse Rotary Direction","Reverse Direction","Inverter direção","Inverter sentido do rotativo","Inverter sentido"]),
        new("returnToStart","Retornar ao início","toggle",["Return to Starting Point","Return to Start","Retornar ao início","Retornar ao ponto de partida"])
    ];

    private static readonly dynamic Automation=new UIA.CUIAutomation8();

    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);
    private const uint LeftDown=0x0002;
    private const uint LeftUp=0x0004;
    private const uint WmKeyDown=0x0100;
    private const uint WmKeyUp=0x0101;
    private const int VkEscape=0x1B;

    public static LightBurnControlBridgeResult Inspect()
    {
        try
        {
            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var uiLayers=FindLayers(nodes);
            var uiFields=Specs
                .Select(spec=>BuildField(spec,nodes))
                .Where(field=>field is not null)
                .Select(field=>field!)
                .ToArray();
            string? title=null;
            try{title=Convert.ToString(((dynamic)root).CurrentName);}catch{}

            var api=TryReadApiSnapshot();
            var layers=api?.Layers is {Length:>0}?api.Layers:uiLayers;
            var fields=MergeFields(api?.Fields??Array.Empty<LightBurnControlField>(),uiFields);

            // LightBurn 1.7 Galvo may owner-draw the layer row without exposing it
            // through ControlView. If fields are visible but no layer row is exposed,
            // show C00 as a safe default rather than an empty selector. The user can
            // still use the live view + mobile keyboard for any other layer.
            if(layers.Length==0&&fields.Any(field=>
                field.Key is "speed" or "powerMax" or "passes" or "frequency"))
                layers=[new("C00","C00",true)];

            return new(true,null,new(title??api?.WindowTitle,layers,fields));
        }
        catch(COMException){return Fail("lightburn_ui_changed");}
        catch(Exception ex){return Fail("inspect_error:"+ex.GetType().Name);}
    }

    public static LightBurnControlBridgeResult SetField(string key,string? value,bool? toggle)
    {
        try
        {
            var spec=Specs.FirstOrDefault(x=>string.Equals(x.Key,key,StringComparison.Ordinal));
            if(spec is null)return Fail("unsupported_field");

            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var target=FindFieldElement(spec,nodes);
            if(target is null)return Fail("field_not_found");
            if(!target.Enabled)return Fail("field_disabled");

            if(spec.Kind=="toggle")
            {
                if(!toggle.HasValue)return Fail("toggle_value_required");
                if(!SetToggle(target.Element,toggle.Value))return Fail("toggle_failed");
            }
            else
            {
                if(string.IsNullOrWhiteSpace(value))return Fail("value_required");
                if(!SetValue(target.Element,value.Trim()))return Fail("value_write_failed");
            }

            Thread.Sleep(80);
            return Inspect();
        }
        catch(COMException){return Fail("lightburn_ui_changed");}
        catch(Exception ex){return Fail("set_error:"+ex.GetType().Name);}
    }

    public static LightBurnControlBridgeResult SelectLayer(string layerId,bool openEditor)
    {
        try
        {
            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var layer=FindLayerNode(nodes,layerId);
            if(layer is null)return Fail("layer_not_found");
            if(!layer.Enabled)return Fail("layer_disabled");

            if(!Select(layer.Element)&&!Click(layer,false))
                return Fail("layer_select_failed");

            Thread.Sleep(80);
            if(openEditor)
            {
                if(!Click(layer,true))return Fail("layer_editor_open_failed");
                Thread.Sleep(220);
            }
            return Inspect();
        }
        catch(COMException){return Fail("lightburn_ui_changed");}
        catch(Exception ex){return Fail("layer_error:"+ex.GetType().Name);}
    }

    public static LightBurnControlBridgeResult OpenSelectedLayer()
    {
        try
        {
            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var selected=FindLayerNode(nodes,null,true);
            if(selected is null)
            {
                var unique=nodes
                    .Select(node=>(node,id:LayerIdFromNode(node)))
                    .Where(x=>x.id is not null)
                    .GroupBy(x=>x.id!,StringComparer.OrdinalIgnoreCase)
                    .Select(group=>group.OrderByDescending(x=>IsSelected(x.node.Element)).First().node)
                    .ToArray();
                if(unique.Length==1)selected=unique[0];
            }
            if(selected is null)return Fail("selected_layer_not_found");
            if(!Click(selected,true))return Fail("layer_editor_open_failed");
            Thread.Sleep(220);
            return Inspect();
        }
        catch(Exception ex){return Fail("layer_editor_error:"+ex.GetType().Name);}
    }

    public static LightBurnControlBridgeResult DialogAction(string action)
    {
        try
        {
            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var aliases=action switch
            {
                "confirm"=>new[]{"OK","Apply","Aplicar","Aceptar"},
                "cancel"=>new[]{"Cancel","Cancelar"},
                "close"=>new[]{"Close","Fechar","Cerrar"},
                _=>Array.Empty<string>()
            };
            foreach(var alias in aliases)
            {
                var node=nodes.FirstOrDefault(x=>Normalize(x.Name)==Normalize(alias));
                if(node is not null&&(Invoke(node.Element)||Click(node,false)))
                {
                    Thread.Sleep(180);
                    return Inspect();
                }
            }

            var hwnd=GetActiveLightBurnWindow();
            if(hwnd!=IntPtr.Zero&&action is "cancel" or "close")
            {
                var down=PostMessage(hwnd,WmKeyDown,(IntPtr)VkEscape,IntPtr.Zero);
                var up=PostMessage(hwnd,WmKeyUp,(IntPtr)VkEscape,IntPtr.Zero);
                if(down||up)
                {
                    Thread.Sleep(150);
                    return Inspect();
                }
            }
            return Fail("dialog_action_not_found");
        }
        catch(Exception ex){return Fail("dialog_action_error:"+ex.GetType().Name);}
    }

    private static object? GetRoot()
    {
        var hwnd=GetActiveLightBurnWindow();
        if(hwnd==IntPtr.Zero)return null;
        try{return Automation.ElementFromHandle(hwnd);}
        catch{return null;}
    }

    private static IntPtr GetActiveLightBurnWindow()
    {
        var main=LightBurnWindowCapture.FindLightBurnWindow();
        if(main==IntPtr.Zero)return IntPtr.Zero;
        var foreground=GetForegroundWindow();
        if(foreground==IntPtr.Zero)return main;
        GetWindowThreadProcessId(main,out var mainPid);
        GetWindowThreadProcessId(foreground,out var foregroundPid);
        return mainPid!=0&&foregroundPid==mainPid?foreground:main;
    }

    private static List<Node> ReadNodes(object rootObject)
    {
        var result=new List<Node>();
        try
        {
            dynamic root=rootObject;
            dynamic condition=Automation.CreateTrueCondition();
            dynamic all=root.FindAll(UIA.TreeScope.TreeScope_Descendants,condition);
            var length=Math.Min(Convert.ToInt32(all.Length),3000);
            for(var i=0;i<length;i++)
            {
                try
                {
                    dynamic e=all.GetElement(i);
                    string name=(Convert.ToString(e.CurrentName)??"").Trim();
                    int controlType=Convert.ToInt32(e.CurrentControlType);
                    bool enabled=Convert.ToBoolean(e.CurrentIsEnabled);
                    bool offscreen=Convert.ToBoolean(e.CurrentIsOffscreen);
                    dynamic r=e.CurrentBoundingRectangle;
                    var rect=new Bounds(
                        Convert.ToDouble(r.left),Convert.ToDouble(r.top),
                        Convert.ToDouble(r.right),Convert.ToDouble(r.bottom));

                    var searchParts=new List<string>();
                    if(!string.IsNullOrWhiteSpace(name))searchParts.Add(name);
                    try
                    {
                        var automationId=(Convert.ToString(e.CurrentAutomationId)??"").Trim();
                        if(!string.IsNullOrWhiteSpace(automationId))searchParts.Add(automationId);
                    }catch{}
                    try
                    {
                        var help=(Convert.ToString(e.CurrentHelpText)??"").Trim();
                        if(!string.IsNullOrWhiteSpace(help))searchParts.Add(help);
                    }catch{}

                    if(string.IsNullOrWhiteSpace(name)||controlType is 50004 or 50007 or 50016 or 50020 or 50025 or 50029 or 50036)
                    {
                        try
                        {
                            var legacy=Pattern((object)e,LegacyPatternId);
                            if(legacy is not null)
                            {
                                var legacyName=(Convert.ToString(((dynamic)legacy).CurrentName)??"").Trim();
                                var legacyValue=(Convert.ToString(((dynamic)legacy).CurrentValue)??"").Trim();
                                if(!string.IsNullOrWhiteSpace(legacyName))searchParts.Add(legacyName);
                                if(!string.IsNullOrWhiteSpace(legacyValue))searchParts.Add(legacyValue);
                            }
                        }catch{}
                    }

                    var searchText=string.Join(" ",searchParts.Distinct(StringComparer.OrdinalIgnoreCase));
                    result.Add(new Node((object)e,name,searchText,controlType,rect,enabled,offscreen));
                }
                catch{}
            }
        }
        catch{}

        ReadRawNodes(rootObject,result);
        return result;
    }

    private static void ReadRawNodes(object rootObject,List<Node> result)
    {
        try
        {
            dynamic walker=Automation.RawViewWalker;
            var queue=new Queue<object>();
            var first=walker.GetFirstChildElement((dynamic)rootObject);
            if(first is not null)queue.Enqueue((object)first);

            var visited=0;
            while(queue.Count>0&&visited<5000)
            {
                var current=queue.Dequeue();
                visited++;
                AppendRawNode(current,result);

                try
                {
                    var child=walker.GetFirstChildElement((dynamic)current);
                    if(child is not null)queue.Enqueue((object)child);
                }catch{}

                try
                {
                    var sibling=walker.GetNextSiblingElement((dynamic)current);
                    if(sibling is not null)queue.Enqueue((object)sibling);
                }catch{}
            }
        }
        catch{}
    }

    private static void AppendRawNode(object element,List<Node> result)
    {
        try
        {
            dynamic e=element;
            string name=(Convert.ToString(e.CurrentName)??"").Trim();
            int controlType=Convert.ToInt32(e.CurrentControlType);
            bool enabled=Convert.ToBoolean(e.CurrentIsEnabled);
            bool offscreen=Convert.ToBoolean(e.CurrentIsOffscreen);
            dynamic r=e.CurrentBoundingRectangle;
            var rect=new Bounds(
                Convert.ToDouble(r.left),Convert.ToDouble(r.top),
                Convert.ToDouble(r.right),Convert.ToDouble(r.bottom));

            var searchParts=new List<string>();
            if(!string.IsNullOrWhiteSpace(name))searchParts.Add(name);
            try
            {
                var automationId=(Convert.ToString(e.CurrentAutomationId)??"").Trim();
                if(!string.IsNullOrWhiteSpace(automationId))searchParts.Add(automationId);
            }catch{}
            try
            {
                var help=(Convert.ToString(e.CurrentHelpText)??"").Trim();
                if(!string.IsNullOrWhiteSpace(help))searchParts.Add(help);
            }catch{}
            try
            {
                var legacy=Pattern(element,LegacyPatternId);
                if(legacy is not null)
                {
                    var legacyName=(Convert.ToString(((dynamic)legacy).CurrentName)??"").Trim();
                    var legacyValue=(Convert.ToString(((dynamic)legacy).CurrentValue)??"").Trim();
                    if(!string.IsNullOrWhiteSpace(legacyName))searchParts.Add(legacyName);
                    if(!string.IsNullOrWhiteSpace(legacyValue))searchParts.Add(legacyValue);
                }
            }catch{}

            var searchText=string.Join(" ",searchParts.Distinct(StringComparer.OrdinalIgnoreCase));
            var duplicate=result.Any(node=>
                node.ControlType==controlType
                &&Math.Abs(node.Rect.Left-rect.Left)<1
                &&Math.Abs(node.Rect.Top-rect.Top)<1
                &&string.Equals(node.SearchText,searchText,StringComparison.OrdinalIgnoreCase));
            if(!duplicate)
                result.Add(new Node(element,name,searchText,controlType,rect,enabled,offscreen));
        }
        catch{}
    }

    private static LightBurnControlField? BuildField(FieldSpec spec,List<Node> nodes)
    {
        var target=FindFieldElement(spec,nodes);
        if(target is null)return null;

        if(spec.Kind=="toggle")
        {
            var current=ReadToggle(target.Element);
            return new(spec.Key,spec.Label,spec.Kind,null,current,target.Enabled&&CanToggle(target.Element));
        }

        var value=ReadValue(target.Element);
        return new(spec.Key,spec.Label,spec.Kind,value,null,target.Enabled&&CanSetValue(target.Element));
    }

    private static Node? FindFieldElement(FieldSpec spec,List<Node> nodes)
    {
        var interactive=nodes.Where(IsInteractive).ToArray();

        var direct=interactive
            .Select(node=>(node,score:AliasScore(node.SearchText,spec.Aliases)))
            .Where(x=>x.score>0)
            .OrderByDescending(x=>x.score)
            .ThenBy(x=>x.node.Offscreen)
            .FirstOrDefault();
        if(direct.node is not null)return direct.node;

        foreach(var label in nodes
            .Select(node=>(node,score:AliasScore(node.SearchText,spec.Aliases)))
            .Where(x=>x.score>0&&!IsInteractive(x.node))
            .OrderByDescending(x=>x.score))
        {
            if(label.node.Rect.IsEmpty)continue;
            var centerY=label.node.Rect.Top+label.node.Rect.Height/2;
            var candidate=interactive
                .Where(x=>!x.Rect.IsEmpty&&!x.Offscreen)
                .Select(x=>{
                    var y=Math.Abs((x.Rect.Top+x.Rect.Height/2)-centerY);
                    var gap=x.Rect.Right<label.node.Rect.Left
                        ?label.node.Rect.Left-x.Rect.Right
                        :label.node.Rect.Right<x.Rect.Left
                            ?x.Rect.Left-label.node.Rect.Right
                            :0;
                    var controlPenalty=x.ControlType is 50004 or 50016 or 50003?0:40;
                    return(node:x,y,gap,dist:gap+y*4+controlPenalty);
                })
                .Where(x=>x.y<=42&&x.gap<=320)
                .OrderBy(x=>x.dist)
                .FirstOrDefault();
            if(candidate.node is not null)return candidate.node;
        }
        return null;
    }

    private static int AliasScore(string name,string[] aliases)
    {
        if(string.IsNullOrWhiteSpace(name))return 0;
        var n=Normalize(name);
        var best=0;
        foreach(var alias in aliases)
        {
            var a=Normalize(alias);
            if(n==a)best=Math.Max(best,100);
            else if(n.StartsWith(a+" ",StringComparison.Ordinal)||n.EndsWith(" "+a,StringComparison.Ordinal))best=Math.Max(best,80);
            else if(n.Contains(a,StringComparison.Ordinal))best=Math.Max(best,60);
        }
        return best;
    }

    private static string Normalize(string value)=>Regex.Replace(value.Trim().ToLowerInvariant(),@"\s+"," ");

    private static bool IsInteractive(Node node)
    {
        if(node.Offscreen||!node.Enabled)return false;
        if(Pattern(node.Element,ValuePatternId) is not null)return true;
        if(Pattern(node.Element,RangeValuePatternId) is not null)return true;
        if(Pattern(node.Element,TogglePatternId) is not null)return true;

        var legacy=Pattern(node.Element,LegacyPatternId);
        if(legacy is null)return false;

        return node.ControlType is
            50000 or // button
            50002 or // checkbox
            50003 or // combo
            50004 or // edit
            50013 or // radio
            50016 or // spinner
            50025;   // custom Qt editor
    }

    private static object? Pattern(object element,int patternId)
    {
        try{return ((dynamic)element).GetCurrentPattern(patternId);}
        catch{return null;}
    }

    private static bool Invoke(object element)
    {
        try
        {
            var invoke=Pattern(element,InvokePatternId);
            if(invoke is null)return false;
            ((dynamic)invoke).Invoke();
            return true;
        }
        catch{return false;}
    }

    private static string? ReadValue(object element)
    {
        try
        {
            var value=Pattern(element,ValuePatternId);
            if(value is not null)return Convert.ToString(((dynamic)value).CurrentValue);
            var range=Pattern(element,RangeValuePatternId);
            if(range is not null)return Convert.ToDouble(((dynamic)range).CurrentValue)
                .ToString(System.Globalization.CultureInfo.InvariantCulture);
            var legacy=Pattern(element,LegacyPatternId);
            if(legacy is not null)return Convert.ToString(((dynamic)legacy).CurrentValue);
        }catch{}
        return null;
    }

    private static bool? ReadToggle(object element)
    {
        try
        {
            var toggle=Pattern(element,TogglePatternId);
            if(toggle is not null)return Convert.ToInt32(((dynamic)toggle).CurrentToggleState)==1;
            var legacy=Pattern(element,LegacyPatternId);
            if(legacy is not null)
                return (Convert.ToInt32(((dynamic)legacy).CurrentState)&StateSystemChecked)!=0;
        }catch{}
        return null;
    }

    private static bool CanSetValue(object element)
    {
        try
        {
            var value=Pattern(element,ValuePatternId);
            if(value is not null)return !Convert.ToBoolean(((dynamic)value).CurrentIsReadOnly);
            var range=Pattern(element,RangeValuePatternId);
            if(range is not null)return !Convert.ToBoolean(((dynamic)range).CurrentIsReadOnly);
            return Pattern(element,LegacyPatternId) is not null;
        }catch{return false;}
    }

    private static bool CanToggle(object element)
    {
        try{return Pattern(element,TogglePatternId) is not null||Pattern(element,LegacyPatternId) is not null;}
        catch{return false;}
    }

    private static bool SetValue(object element,string value)
    {
        try
        {
            ((dynamic)element).SetFocus();
            var valuePattern=Pattern(element,ValuePatternId);
            if(valuePattern is not null)
            {
                dynamic p=valuePattern;
                if(Convert.ToBoolean(p.CurrentIsReadOnly))return false;
                p.SetValue(value);
                return true;
            }

            var rangePattern=Pattern(element,RangeValuePatternId);
            if(rangePattern is not null)
            {
                dynamic p=rangePattern;
                if(Convert.ToBoolean(p.CurrentIsReadOnly))return false;
                if(!double.TryParse(value,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var number)
                   &&!double.TryParse(value,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.CurrentCulture,out number))
                    return false;
                var min=Convert.ToDouble(p.CurrentMinimum);
                var max=Convert.ToDouble(p.CurrentMaximum);
                if(number<min||number>max)return false;
                p.SetValue(number);
                return true;
            }

            var legacyPattern=Pattern(element,LegacyPatternId);
            if(legacyPattern is not null)
            {
                ((dynamic)legacyPattern).SetValue(value);
                return true;
            }
        }catch{}
        return false;
    }

    private static bool SetToggle(object element,bool desired)
    {
        try
        {
            ((dynamic)element).SetFocus();
            var togglePattern=Pattern(element,TogglePatternId);
            if(togglePattern is not null)
            {
                dynamic p=togglePattern;
                var current=Convert.ToInt32(p.CurrentToggleState)==1;
                if(current!=desired)p.Toggle();
                return true;
            }

            var legacyPattern=Pattern(element,LegacyPatternId);
            if(legacyPattern is not null)
            {
                dynamic p=legacyPattern;
                var current=(Convert.ToInt32(p.CurrentState)&StateSystemChecked)!=0;
                if(current!=desired)p.DoDefaultAction();
                return true;
            }
        }catch{}
        return false;
    }

    private static LightBurnControlLayer[] FindLayers(List<Node> nodes)
    {
        var found=new Dictionary<string,LightBurnControlLayer>(StringComparer.OrdinalIgnoreCase);
        foreach(var node in nodes)
        {
            var id=LayerIdFromNode(node);
            if(id is null)continue;
            var selected=IsSelected(node.Element);
            if(!found.ContainsKey(id)||selected)
                found[id]=new(id,id,selected);
        }
        return found.Values.OrderBy(x=>x.Id).ToArray();
    }

    private static Node? FindLayerNode(List<Node> nodes,string? layerId,bool selectedOnly=false)
    {
        foreach(var node in nodes)
        {
            var id=LayerIdFromNode(node);
            if(id is null)continue;
            if(layerId is not null&&!string.Equals(id,layerId,StringComparison.OrdinalIgnoreCase))
                continue;
            if(selectedOnly&&!IsSelected(node.Element))continue;
            return node;
        }
        return null;
    }

    private static string? LayerIdFromNode(Node node)
    {
        var match=Regex.Match(node.SearchText,@"(?:^|\b)([CT]\d{2})(?:\b|$)",RegexOptions.IgnoreCase);
        return match.Success?match.Groups[1].Value.ToUpperInvariant():null;
    }

    private static bool IsSelected(object element)
    {
        try
        {
            var selection=Pattern(element,SelectionItemPatternId);
            if(selection is not null&&Convert.ToBoolean(((dynamic)selection).CurrentIsSelected))
                return true;

            var legacy=Pattern(element,LegacyPatternId);
            if(legacy is not null)
            {
                var state=Convert.ToInt32(((dynamic)legacy).CurrentState);
                return (state&(StateSystemSelected|StateSystemFocused))!=0;
            }
        }catch{}
        return false;
    }

    private static bool Select(object element)
    {
        try
        {
            var selection=Pattern(element,SelectionItemPatternId);
            if(selection is not null)
            {
                ((dynamic)selection).Select();
                return true;
            }
            var legacy=Pattern(element,LegacyPatternId);
            if(legacy is not null)
            {
                ((dynamic)legacy).Select(SelFlagTakeSelection);
                return true;
            }
        }catch{}
        return false;
    }

    private static bool Click(Node node,bool doubleClick)
    {
        if(node.Rect.IsEmpty)return false;
        var x=(int)Math.Round(node.Rect.Left+node.Rect.Width/2);
        var y=(int)Math.Round(node.Rect.Top+node.Rect.Height/2);
        if(!LightBurnRemoteInput.FocusLightBurn())return false;
        if(!SetCursorPos(x,y))return false;
        Thread.Sleep(40);
        mouse_event(LeftDown,0,0,0,UIntPtr.Zero);
        mouse_event(LeftUp,0,0,0,UIntPtr.Zero);
        if(doubleClick)
        {
            Thread.Sleep(85);
            mouse_event(LeftDown,0,0,0,UIntPtr.Zero);
            mouse_event(LeftUp,0,0,0,UIntPtr.Zero);
        }
        return true;
    }

    private static LightBurnControlSnapshot? TryReadApiSnapshot()
    {
        try
        {
            var secret=SecureSecretStore.Load();
            if(string.IsNullOrWhiteSpace(secret))return null;
            using var rest=new LightBurnRestClient();
            using var cts=new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var layersJson=rest.GetLayersJsonAsync(secret,cts.Token).GetAwaiter().GetResult();
            var cutsJson=rest.GetCutsJsonAsync(secret,cts.Token).GetAwaiter().GetResult();
            if(string.IsNullOrWhiteSpace(layersJson))return null;

            using var layersDoc=JsonDocument.Parse(layersJson);
            var root=layersDoc.RootElement;
            var active=root.TryGetProperty("active_index",out var activeEl)&&activeEl.TryGetInt32(out var ai)?ai:-1;
            var layers=new List<LightBurnControlLayer>();
            if(root.TryGetProperty("layers",out var array)&&array.ValueKind==JsonValueKind.Array)
            {
                foreach(var item in array.EnumerateArray())
                {
                    if(!item.TryGetProperty("index",out var indexEl)||!indexEl.TryGetInt32(out var index))continue;
                    var inUse=item.TryGetProperty("in_use",out var useEl)&&useEl.ValueKind==JsonValueKind.True;
                    if(!inUse&&index!=active)continue;
                    var id=LayerId(index);
                    var name=item.TryGetProperty("name",out var nameEl)&&nameEl.ValueKind==JsonValueKind.String
                        ?nameEl.GetString():"";
                    var label=string.IsNullOrWhiteSpace(name)||string.Equals(name,id,StringComparison.OrdinalIgnoreCase)
                        ?id:$"{id} · {name}";
                    layers.Add(new(id,label,index==active));
                }
            }

            var fields=new List<LightBurnControlField>();
            if(active>=0&&!string.IsNullOrWhiteSpace(cutsJson))
            {
                using var cutsDoc=JsonDocument.Parse(cutsJson);
                if(cutsDoc.RootElement.TryGetProperty("cuts",out var cuts)&&cuts.ValueKind==JsonValueKind.Array)
                {
                    foreach(var cut in cuts.EnumerateArray())
                    {
                        if(!cut.TryGetProperty("layer_index",out var layerEl)||!layerEl.TryGetInt32(out var layer)||layer!=active)continue;
                        if(!cut.TryGetProperty("params",out var p)||p.ValueKind!=JsonValueKind.Object)break;
                        AddNumber(fields,p,"speed","speed","Velocidade");
                        AddNumber(fields,p,"max_power","powerMax","Potência");
                        AddNumber(fields,p,"min_power","powerMin","Potência mín.");
                        AddNumber(fields,p,"num_passes","passes","Passes");
                        AddNumber(fields,p,"frequency","frequency","Frequência");
                        AddToggle(fields,p,"cross_hatch","crossHatch","Cross-hatch");
                        break;
                    }
                }
            }
            return new("LightBurn",layers.ToArray(),fields.ToArray());
        }
        catch{return null;}
    }

    private static LightBurnControlField[] MergeFields(
        LightBurnControlField[] api,
        LightBurnControlField[] ui)
    {
        var map=new Dictionary<string,LightBurnControlField>(StringComparer.Ordinal);
        foreach(var field in api)map[field.Key]=field;
        foreach(var field in ui)
        {
            if(map.TryGetValue(field.Key,out var existing))
            {
                map[field.Key]=field with
                {
                    Value=field.Value??existing.Value,
                    Checked=field.Checked??existing.Checked
                };
            }
            else map[field.Key]=field;
        }
        return map.Values.ToArray();
    }

    private static void AddNumber(
        List<LightBurnControlField> fields,JsonElement p,string jsonKey,string key,string label)
    {
        if(!p.TryGetProperty(jsonKey,out var el)||el.ValueKind!=JsonValueKind.Number)return;
        fields.Add(new(key,label,"number",el.ToString(),null,false));
    }

    private static void AddToggle(
        List<LightBurnControlField> fields,JsonElement p,string jsonKey,string key,string label)
    {
        if(!p.TryGetProperty(jsonKey,out var el)||el.ValueKind is not (JsonValueKind.True or JsonValueKind.False))return;
        fields.Add(new(key,label,"toggle",null,el.GetBoolean(),false));
    }

    private static string LayerId(int index)=>
        index switch
        {
            >=0 and <=29=>$"C{index:00}",
            30=>"T1",
            31=>"T2",
            _=>$"L{index}"
        };

    private static LightBurnControlBridgeResult Fail(string reason)=>new(false,reason,null);
}
