using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
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
    private const int ValuePatternId=10002;
    private const int RangeValuePatternId=10003;
    private const int SelectionItemPatternId=10010;
    private const int TogglePatternId=10015;
    private const int LegacyPatternId=10018;
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
        object Element,string Name,int ControlType,Bounds Rect,bool Enabled,bool Offscreen);

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
        new("output","Saída","toggle",["Output","Saída","Salida","Sortie","Ausgabe"])
    ];

    private static readonly dynamic Automation=new UIA.CUIAutomation8();

    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
    private const uint LeftDown=0x0002;
    private const uint LeftUp=0x0004;

    public static LightBurnControlBridgeResult Inspect()
    {
        try
        {
            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var layers=FindLayers(nodes);
            var fields=Specs
                .Select(spec=>BuildField(spec,nodes))
                .Where(field=>field is not null)
                .Select(field=>field!)
                .ToArray();
            string? title=null;
            try{title=Convert.ToString(((dynamic)root).CurrentName);}catch{}
            return new(true,null,new(title,layers,fields));
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
            if(selected is null)return Fail("selected_layer_not_found");
            if(!Click(selected,true))return Fail("layer_editor_open_failed");
            Thread.Sleep(220);
            return Inspect();
        }
        catch(Exception ex){return Fail("layer_editor_error:"+ex.GetType().Name);}
    }

    private static object? GetRoot()
    {
        var hwnd=LightBurnWindowCapture.FindLightBurnWindow();
        if(hwnd==IntPtr.Zero)return null;
        try{return Automation.ElementFromHandle(hwnd);}
        catch{return null;}
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
                    result.Add(new Node((object)e,name,controlType,rect,enabled,offscreen));
                }
                catch{}
            }
        }
        catch{}
        return result;
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
            .Select(node=>(node,score:AliasScore(node.Name,spec.Aliases)))
            .Where(x=>x.score>0)
            .OrderByDescending(x=>x.score)
            .ThenBy(x=>x.node.Offscreen)
            .FirstOrDefault();
        if(direct.node is not null)return direct.node;

        foreach(var label in nodes
            .Select(node=>(node,score:AliasScore(node.Name,spec.Aliases)))
            .Where(x=>x.score>0&&!IsInteractive(x.node))
            .OrderByDescending(x=>x.score))
        {
            if(label.node.Rect.IsEmpty)continue;
            var centerY=label.node.Rect.Top+label.node.Rect.Height/2;
            var candidate=interactive
                .Where(x=>!x.Rect.IsEmpty&&!x.Offscreen)
                .Where(x=>x.Rect.Left>=label.node.Rect.Left-8)
                .Where(x=>Math.Abs((x.Rect.Top+x.Rect.Height/2)-centerY)<=36)
                .Select(x=>(node:x,dist:Math.Abs(x.Rect.Left-label.node.Rect.Right)+Math.Abs((x.Rect.Top+x.Rect.Height/2)-centerY)*4))
                .Where(x=>x.dist<650)
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

    private static bool IsInteractive(Node node)=>
        !node.Offscreen&&(CanSetValue(node.Element)||CanToggle(node.Element));

    private static object? Pattern(object element,int patternId)
    {
        try{return ((dynamic)element).GetCurrentPattern(patternId);}
        catch{return null;}
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
            var match=Regex.Match(node.Name,@"(?:^|\b)([CT]\d{2})(?:\b|$)",RegexOptions.IgnoreCase);
            if(!match.Success)continue;
            var id=match.Groups[1].Value.ToUpperInvariant();
            var selected=IsSelected(node.Element);
            if(!found.ContainsKey(id)||selected)
                found[id]=new(id,string.IsNullOrWhiteSpace(node.Name)?id:node.Name,selected);
        }
        return found.Values.OrderBy(x=>x.Id).ToArray();
    }

    private static Node? FindLayerNode(List<Node> nodes,string? layerId,bool selectedOnly=false)
    {
        foreach(var node in nodes)
        {
            var match=Regex.Match(node.Name,@"(?:^|\b)([CT]\d{2})(?:\b|$)",RegexOptions.IgnoreCase);
            if(!match.Success)continue;
            if(layerId is not null&&!string.Equals(match.Groups[1].Value,layerId,StringComparison.OrdinalIgnoreCase))
                continue;
            if(selectedOnly&&!IsSelected(node.Element))continue;
            return node;
        }
        return null;
    }

    private static bool IsSelected(object element)
    {
        try
        {
            var selection=Pattern(element,SelectionItemPatternId);
            return selection is not null&&Convert.ToBoolean(((dynamic)selection).CurrentIsSelected);
        }catch{return false;}
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

    private static LightBurnControlBridgeResult Fail(string reason)=>new(false,reason,null);
}
