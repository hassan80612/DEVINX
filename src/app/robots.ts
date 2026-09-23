import type {MetadataRoute} from 'next';

export default function robots():MetadataRoute.Robots{
  return {
    rules:{
      userAgent:'*',
      allow:'/',
      disallow:[
        '/api/',
        '/painel',
        '/entrar',
        '/onboarding',
        '/redefinir-senha',
        '/auth/'
      ]
    },
    sitemap:'https://devinx.com.br/sitemap.xml',
    host:'https://devinx.com.br'
  };
}
