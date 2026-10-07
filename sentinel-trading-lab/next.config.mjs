/** @type {import('next').NextConfig} */
const downloadHeaders=[
  {key:'Content-Disposition',value:'attachment; filename="Sentinel-Agent-Windows.exe"'},
  {key:'Cache-Control',value:'no-store, max-age=0, must-revalidate'},
  {key:'X-Content-Type-Options',value:'nosniff'}
];
const nextConfig={
  reactStrictMode:true,
  async headers(){return[
    {source:'/downloads/Sentinel-Agent-Windows.exe',headers:downloadHeaders},
    {source:'/downloads/sentinel-agent-windows.exe',headers:downloadHeaders},
    {source:'/(.*)',headers:[{key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},{key:'X-Content-Type-Options',value:'nosniff'}]}
  ]}
};
export default nextConfig;
