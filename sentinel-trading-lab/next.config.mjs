import {readFileSync} from 'node:fs';
const currentAgentRelease=JSON.parse(readFileSync(new URL('./agent/release.json',import.meta.url),'utf8'));
const agentDownloadHeaders=[
  {key:'Content-Type',value:'application/octet-stream'},
  {key:'Content-Disposition',value:'attachment; filename="sentinel-agent-windows.exe"'},
  {key:'Cache-Control',value:'private, no-store'}
];
const versionedAgentDownloadHeaders=[
  {key:'Content-Type',value:'application/octet-stream'},
  {key:'Content-Disposition',value:'attachment; filename="Sentinel-Agent-'+currentAgentRelease.version+'.exe"'},
  {key:'Cache-Control',value:'private, no-store'}
];
const nextConfig={
  reactStrictMode:true,
  async redirects(){return [{source:'/console',destination:'/painel',permanent:false},
    // Verified original 13.9.221 EXE on immutable GitHub commit.
    // Same download fix used for original 218: site redirects to archived EXE.
    {source:'/downloads/Sentinel-Agent-13.9.221.exe',destination:'https://raw.githubusercontent.com/hassan80612/DEVINX/339fe90f17d6ab2d8cef4660c8a0cc5c7a8bdd34/sentinel-trading-lab/public/downloads/Sentinel-Agent-13.9.221.exe',permanent:false},
    // Immutable original 207 Windows installer, served by GitHub instead of Vercel.
    {source:'/downloads/Sentinel-Agent-13.9.207.exe',destination:'https://raw.githubusercontent.com/hassan80612/DEVINX/58557bef13d3a9a87eda9e3f0bd601b914a56ef4/sentinel-trading-lab/public/downloads/Sentinel-Agent-13.9.207.exe',permanent:false},
    // Retain compatibility for open legacy tabs without bundling old installers.
    ...['13.8.0','13.8.1','13.8.2','13.8.3','13.8.4','13.8.5','13.8.6','13.8.7','13.8.8'].map(version=>({source:'/downloads/Sentinel-Agent-'+version+'.exe',destination:'/downloads/Sentinel-Agent-Windows.exe',permanent:false}))]},
  async headers(){return[
    {source:'/downloads/sentinel-agent-windows.exe',headers:agentDownloadHeaders},
    {source:'/downloads/Sentinel-Agent-Windows.exe',headers:agentDownloadHeaders},
    // A redirect response must not advertise itself as a downloadable EXE.
    {source:'/downloads/Sentinel-Agent-'+currentAgentRelease.version+'-Alternativo.zip',headers:[
      {key:'Content-Type',value:'application/zip'},
      {key:'Content-Disposition',value:'attachment'},
      {key:'Cache-Control',value:'private, no-store'}
    ]},
    {source:'/(.*)',headers:[{key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},{key:'X-Content-Type-Options',value:'nosniff'}]}
  ]}
};
export default nextConfig;
