/** @type {import('next').NextConfig} */
const agentDownloadHeaders=[
  {key:'Content-Type',value:'application/octet-stream'},
  {key:'Content-Disposition',value:'attachment; filename="sentinel-agent-windows.exe"'},
  {key:'Cache-Control',value:'public, max-age=0, must-revalidate'}
];
const nextConfig={
  reactStrictMode:true,
  async headers(){return[
    {source:'/downloads/sentinel-agent-windows.exe',headers:agentDownloadHeaders},
    {source:'/downloads/Sentinel-Agent-Windows.exe',headers:agentDownloadHeaders},
    {source:'/(.*)',headers:[{key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},{key:'X-Content-Type-Options',value:'nosniff'}]}
  ]}
};
export default nextConfig;
