/** @type {import('next').NextConfig} */
const agentDownloadHeaders=[
  {key:'Content-Type',value:'application/octet-stream'},
  {key:'Content-Disposition',value:'attachment; filename="sentinel-agent-windows.exe"'},
  {key:'Cache-Control',value:'public, max-age=0, must-revalidate'}
];
// Retired binaries no longer take up production deployment space. Existing
// authenticated direct download links still work via an explicit 307 redirect.
// Keep 67.1 rollback, 67.18-67.21, the signed update zip and stable aliases.
const retiredInstallerVersions=[2,3,4,5,6,7,9,10,11,12,13,14,15,16,17];
const nextConfig={
  reactStrictMode:true,
  async redirects(){return retiredInstallerVersions.map(n=>({
    source:'/downloads/Sentinel-Agent-13.4.67.'+n+'.exe',
    destination:'/downloads/Sentinel-Agent-13.4.67.21.exe',
    permanent:false
  }))},
  async headers(){return[
    {source:'/downloads/sentinel-agent-windows.exe',headers:agentDownloadHeaders},
    {source:'/downloads/Sentinel-Agent-Windows.exe',headers:agentDownloadHeaders},
    {source:'/(.*)',headers:[{key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},{key:'X-Content-Type-Options',value:'nosniff'}]}
  ]}
};
export default nextConfig;
