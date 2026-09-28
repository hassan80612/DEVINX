$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$test = Join-Path $root 'artifacts/distribution-tests'
New-Item $test -ItemType Directory -Force | Out-Null
@'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType><TargetFramework>net8.0-windows</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable>
  </PropertyGroup>
  <PropertyGroup Condition="'StoreDistribution' == 'true'">
    <DefineConstants>$(DefineConstants);DEVINX_STORE</DefineConstants>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="../../laser-agent/AgentDistribution.cs" Link="AgentDistribution.cs" />
    <Compile Include="../../laser-agent/AgentRuntime.cs" Link="AgentRuntime.cs" />
    <Compile Include="../../laser-agent/StartupRegistration.cs" Link="StartupRegistration.cs" />
    <Compile Include="../../laser-agent/AgentInstallation.cs" Link="AgentInstallation.cs" />
  </ItemGroup>
</Project>
'@ | Set-Content "$test/DistributionTests.csproj"
@'
using DevinXLaserAgent;
using Microsoft.Win32;

bool expectedStore = args.Contains("store");
if (AgentDistribution.IsStoreBuild != expectedStore) throw new Exception("Wrong distribution build.");
AgentRuntime.Configure(Array.Empty<string>());
var normalDirectory = AgentRuntime.StateDirectory;
var expectedDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    expectedStore ? "DevinXLaserAgentStore" : "DevinXLaserAgent");
if (normalDirectory != expectedDirectory) throw new Exception("Permanent state isolation failed.");
AgentRuntime.Configure(new[] { "--mentor" });
if (!AgentRuntime.MentorMode || normalDirectory == AgentRuntime.StateDirectory) throw new Exception("Mentor state isolation failed.");
if (expectedStore)
{
    const string value = "DevinXLaserAgent";
    using var run = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
    var prior = run.GetValue(value);
    try
    {
        run.SetValue(value, "portable-agent-test-sentinel");
        StartupRegistration.EnsureRegistered();
        StartupRegistration.Remove();
        if (!Equals(run.GetValue(value), "portable-agent-test-sentinel")) throw new Exception("Store modified portable startup.");
        if (AgentInstallation.TryInstallAndRelaunch(Array.Empty<string>())) throw new Exception("Store attempted self-install.");
    }
    finally
    {
        if (prior is null) run.DeleteValue(value, false); else run.SetValue(value, prior);
    }
}
Console.WriteLine($"PASS: {(expectedStore ? "Store" : "Portable")} state and installation behavior");

namespace DevinXLaserAgent
{
    internal static class AgentLocalState { public static void ResetAll() => throw new Exception("Unexpected state deletion."); }
}
'@ | Set-Content "$test/Program.cs"
foreach ($distribution in @('portable', 'store')) {
    $storeBuild = if ($distribution -eq 'store') { 'true' } else { 'false' }
    & dotnet build "$test/DistributionTests.csproj" -c Release -t:Rebuild "-p:StoreDistribution=$storeBuild"
    if ($LASTEXITCODE -ne 0) { throw "$distribution test compilation failed." }
    & dotnet "$test/bin/Release/net8.0-windows/DistributionTests.dll" $distribution
    if ($LASTEXITCODE -ne 0) { throw "$distribution isolation check failed." }
}
