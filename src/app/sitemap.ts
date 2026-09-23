import type {MetadataRoute} from 'next';

export default function sitemap():MetadataRoute.Sitemap{
  const lastModified=new Date();
  return [
    {
      url:'https://devinx.com.br',
      lastModified,
      changeFrequency:'weekly',
      priority:1
    },
    {
      url:'https://devinx.com.br/controle-financeiro-motorista-app',
      lastModified,
      changeFrequency:'monthly',
      priority:0.9
    },
    {
      url:'https://devinx.com.br/meta-diaria-financeira',
      lastModified,
      changeFrequency:'monthly',
      priority:0.9
    },
    {
      url:'https://devinx.com.br/controle-financeiro-autonomo',
      lastModified,
      changeFrequency:'monthly',
      priority:0.9
    }
  ];
}
