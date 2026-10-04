/** @type {import('next').NextConfig} */
const nextConfig={
  reactStrictMode:true,
  async headers(){return[{source:'/(.*)',headers:[{key:'Permissions-Policy',value:'local-network=(self), loopback-network=(self)'},{key:'X-Content-Type-Options',value:'nosniff'}]}]}
};
export default nextConfig;
