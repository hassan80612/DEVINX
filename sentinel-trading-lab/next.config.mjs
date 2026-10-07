/** @type {import('next').NextConfig} */
const nextConfig={
  reactStrictMode:true,
  async redirects(){
    return[
      {source:'/downloads/Sentinel-Agent-Windows.exe',destination:'/downloads/Sentinel-Agent-V13.3.exe',permanent:false}
    ]
  },
  async headers(){
    return[
      {
        source:'/downloads/Sentinel-Agent-V13.3.exe',
        headers:[
          {key:'Content-Type',value:'application/octet-stream'},
          {key:'Content-Disposition',value:'attachment; filename="Sentinel-Agent-V13.3.exe"'},
          {key:'Cache-Control',value:'public, max-age=0, must-revalidate'}
        ]
      },
      {
        source:'/downloads/Sentinel-Agent-Windows.exe',
        headers:[
          {key:'Content-Type',value:'application/octet-stream'},
          {key:'Content-Disposition',value:'attachment; filename="Sentinel-Agent-V13.3.exe"'},
          {key:'Cache-Control',value:'public, max-age=0, must-revalidate'}
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
