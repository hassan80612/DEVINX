using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Windows.Automation;

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
    private sealed record FieldSpec(string Key,string Label,string Kind,string[] Aliases);

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

    private sealed record Node(
        AutomationElement Element,string Name,string Type,System.Windows.Rect Rect,
        bool Enabled,bool Offscreen);

    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
    private const uint LeftDown=0x0002;
    private const uint LeftUp=0x0004;
    private const int SelFlagTakeSelection=0x2;

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
            return new(true,null,new(root.Current.Name,layers,fields));
        }
        catch(ElementNotAvailableException){return Fail("lightburn_ui_changed");}
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

            Thread.Sleep(70);
            return Inspect();
        }
        catch(ElementNotAvailableException){return Fail("lightburn_ui_changed");}
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

            if(openEditor)
            {
                Thread.Sleep(90);
                if(!Click(layer,true))return Fail("layer_editor_open_failed");
                Thread.Sleep(180);
            }
            return Inspect();
        }
        catch(ElementNotAvailableException){return Fail("lightburn_ui_changed");}
        catch(Exception ex){return Fail("layer_error:"+ex.GetType().Name);}
    }

    public static LightBurnControlBridgeResult OpenSelectedLayer()
    {
        try
        {
            var root=GetRoot();
            if(root is null)return Fail("lightburn_window_not_found");
            var nodes=ReadNodes(root);
            var selected=FindLayerNode(nodes,null,selectedOnly:true);
            if(selected is null)return Fail("selected_layer_not_found");
            if(!Click(selected,true))return Fail("layer_editor_open_failed");
            Thread.Sleep(180);
            return Inspect();
        }
        catch(Exception ex){return Fail("layer_editor_error:"+ex.GetType().Name);}
    }

    private static AutomationElement? GetRoot()
    {
        var hwnd=LightBurnWindowCapture.FindLightBurnWindow();
        return hwnd==IntPtr.Zero?null:AutomationElement.FromHandle(hwnd);
    }

    private static List<Node> ReadNodes(AutomationElement root)
    {
        var result=new List<Node>();
        AutomationElementCollection all;
        try{all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);}
        catch{return result;}

        var limit=Math.Min(all.Count,3000);
        for(var i=0;i<limit;i++)
        {
            try
            {
                var e=all[i];
                var name=(e.Current.Name??"").Trim();
                var type=e.Current.ControlType?.ProgrammaticName??"";
                var rect=e.Current.BoundingRectangle;
                result.Add(new(e,name,type,rect,e.Current.IsEnabled,e.Current.IsOffscreen));
            }
            catch{}
        }
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
        var writable=nodes.Where(IsInteractive).ToArray();

        // Best case: Qt exposes the field's accessible name directly.
        var direct=writable
            .Select(node=>(node,score:AliasScore(node.Name,spec.Aliases)))
            .Where(x=>x.score>0)
            .OrderByDescending(x=>x.score)
            .ThenBy(x=>x.node.Offscreen)
            .FirstOrDefault();
        if(direct.node is not null)return direct.node;

        // Common Qt layout: a static label followed by an unnamed edit/spin box.
        foreach(var label in nodes
            .Select(node=>(node,score:AliasScore(node.Name,spec.Aliases)))
            .Where(x=>x.score>0&&!IsInteractive(x.node))
            .OrderByDescending(x=>x.score))
        {
            if(label.node.Rect.IsEmpty)continue;
            var centerY=label.node.Rect.Top+label.node.Rect.Height/2;
            var candidate=writable
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

    private static string Normalize(string value)=>
        Regex.Replace(value.Trim().ToLowerInvariant(),@"\s+"," ");

    private static bool IsInteractive(Node node)
    {
        if(node.Offscreen)return false;
        if(node.Type.EndsWith(".Edit",StringComparison.Ordinal)
           ||node.Type.EndsWith(".Spinner",StringComparison.Ordinal)
           ||node.Type.EndsWith(".CheckBox",StringComparison.Ordinal)
           ||node.Type.EndsWith(".ComboBox",StringComparison.Ordinal))
            return true;
        return CanSetValue(node.Element)||CanToggle(node.Element);
    }

    private static string? ReadValue(AutomationElement element)
    {
        try
        {
            if(element.TryGetCurrentPattern(ValuePattern.Pattern,out var vp))
                return ((ValuePattern)vp).Current.Value;
            if(element.TryGetCurrentPattern(RangeValuePattern.Pattern,out var rp))
                return ((RangeValuePattern)rp).Current.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if(element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out var lp))
                return ((LegacyIAccessiblePattern)lp).Current.Value;
        }catch{}
        return null;
    }

    private static bool? ReadToggle(AutomationElement element)
    {
        try
        {
            if(element.TryGetCurrentPattern(TogglePattern.Pattern,out var tp))
                return ((TogglePattern)tp).Current.ToggleState==ToggleState.On;
            if(element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out var lp))
            {
                var state=((LegacyIAccessiblePattern)lp).Current.State;
                const int StateSystemChecked=0x10;
                return (state&StateSystemChecked)!=0;
            }
        }catch{}
        return null;
    }

    private static bool CanSetValue(AutomationElement element)
    {
        try
        {
            if(element.TryGetCurrentPattern(ValuePattern.Pattern,out var vp))
                return !((ValuePattern)vp).Current.IsReadOnly;
            if(element.TryGetCurrentPattern(RangeValuePattern.Pattern,out var rp))
                return !((RangeValuePattern)rp).Current.IsReadOnly;
            if(element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out _))
                return true;
        }catch{}
        return false;
    }

    private static bool CanToggle(AutomationElement element)
    {
        try
        {
            return element.TryGetCurrentPattern(TogglePattern.Pattern,out _)
                   ||element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out _);
        }catch{return false;}
    }

    private static bool SetValue(AutomationElement element,string value)
    {
        try
        {
            element.SetFocus();
            if(element.TryGetCurrentPattern(ValuePattern.Pattern,out var vp))
            {
                var pattern=(ValuePattern)vp;
                if(pattern.Current.IsReadOnly)return false;
                pattern.SetValue(value);
                return true;
            }
            if(element.TryGetCurrentPattern(RangeValuePattern.Pattern,out var rp))
            {
                var pattern=(RangeValuePattern)rp;
                if(pattern.Current.IsReadOnly)return false;
                if(!double.TryParse(value,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var number)
                   &&!double.TryParse(value,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.CurrentCulture,out number))
                    return false;
                if(number<pattern.Current.Minimum||number>pattern.Current.Maximum)return false;
                pattern.SetValue(number);
                return true;
            }
            if(element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out var lp))
            {
                ((LegacyIAccessiblePattern)lp).SetValue(value);
                return true;
            }
        }catch{}
        return false;
    }

    private static bool SetToggle(AutomationElement element,bool desired)
    {
        try
        {
            element.SetFocus();
            if(element.TryGetCurrentPattern(TogglePattern.Pattern,out var tp))
            {
                var pattern=(TogglePattern)tp;
                var current=pattern.Current.ToggleState==ToggleState.On;
                if(current!=desired)pattern.Toggle();
                return true;
            }
            if(element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out var lp))
            {
                var pattern=(LegacyIAccessiblePattern)lp;
                const int StateSystemChecked=0x10;
                var current=(pattern.Current.State&StateSystemChecked)!=0;
                if(current!=desired)pattern.DoDefaultAction();
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
            var selected=false;
            try
            {
                if(node.Element.TryGetCurrentPattern(SelectionItemPattern.Pattern,out var sp))
                    selected=((SelectionItemPattern)sp).Current.IsSelected;
            }catch{}
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
            if(selectedOnly)
            {
                try
                {
                    if(!node.Element.TryGetCurrentPattern(SelectionItemPattern.Pattern,out var sp)
                       ||!((SelectionItemPattern)sp).Current.IsSelected)
                        continue;
                }catch{continue;}
            }
            return node;
        }
        return null;
    }

    private static bool Select(AutomationElement element)
    {
        try
        {
            if(element.TryGetCurrentPattern(SelectionItemPattern.Pattern,out var sp))
            {
                ((SelectionItemPattern)sp).Select();
                return true;
            }
            if(element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out var lp))
            {
                ((LegacyIAccessiblePattern)lp).Select(SelFlagTakeSelection);
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
