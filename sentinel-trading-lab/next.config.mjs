/** @type {import('next').NextConfig} */
const nextConfig={
  reactStrictMode:true,
  async redirects(){
    return[
      {source:'/downloads/Sentinel-Agent-V13.3.exe',destination:'/downloads/Sentinel-Agent-Windows.exe',permanent:false}
    ]
  },
  async headers(){
    return[
      {
        source:'/downloads/Sentinel-Agent-Windows.exe',
        headers:[
          {key:'Content-Type',value:'application/octet-stream'},
          {key:'Content-Disposition',value:'attachment; filename="Sentinel-Agent-V13.3.exe"'},
          {key:'Cache-Control',value:'no-store, no-cache, must-revalidate, no-transform'}
        ]
      },
      {
        source:'/downloads/Sentinel-Agent-V13.3.exe',
        headers:[
          {key:'Content-Type',value:'application/octet-stream'},
          {key:'Content-Disposition',value:'attachment; filename="Sentinel-Agent-V13.3.exe"'},
          {key:'Cache-Control',value:'no-store, no-cache, must-revalidate, no-transform'}
        ]
      },
      {
        source:'/(.*)',
        headers:[
          {key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},
          {key:'X-Content-Type-Options',value:'nosniff'}
        ]
      }
    ]
  }
};
export default nextConfig;
