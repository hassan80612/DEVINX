import {readFileSync} from 'node:fs';
const currentAgentRelease=JSON.parse(readFileSync(new URL('./agent/release.json',import.meta.url),'utf8'));
const agentDownloadHeaders=[
  {key:'Content-Type',value:'application/octet-stream'},
  {key:'Content-Disposition',value:'attachment; filename="sentinel-agent-windows.exe"'},
  {key:'Cache-Control',value:'private, no-store'}
];
const nextConfig={
  reactStrictMode:true,
  async redirects(){return [{source:'/console',destination:'/painel',permanent:false},
    // Immutable original 207 Windows installer, served by GitHub instead of Vercel.
    {source:'/downloads/Sentinel-Agent-13.9.207.exe',destination:'https://raw.githubusercontent.com/hassan80612/DEVINX/58557bef13d3a9a87eda9e3f0bd601b914a56ef4/sentinel-trading-lab/public/downloads/Sentinel-Agent-13.9.207.exe',permanent:false}]},
  async headers(){return[
    {source:'/downloads/sentinel-agent-windows.exe',headers:agentDownloadHeaders},
    {source:'/downloads/Sentinel-Agent-Windows.exe',headers:agentDownloadHeaders},
    {source:'/downloads/Sentinel-Agent-'+currentAgentRelease.version+'.exe',headers:agentDownloadHeaders},
    {source:'/downloads/Sentinel-Agent-'+currentAgentRelease.version+'-Alternativo.zip',headers:[
      {key:'Content-Type',value:'application/zip'},
      {key:'Content-Disposition',value:'attachment'},
      {key:'Cache-Control',value:'private, no-store'}
    ]},
    {source:'/(.*)',headers:[{key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},{key:'X-Content-Type-Options',value:'nosniff'}]}
  ]}
};
export default nextConfig;
