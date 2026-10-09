import type {MetadataRoute} from 'next';
import {getPublicSiteVisibility} from '@/features/site-visibility/server';

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const lastModified=new Date();
  const visibility=await getPublicSiteVisibility();
  const pages:MetadataRoute.Sitemap=[
    {
      url:'https://devinx.com.br',
      lastModified,
      changeFrequency:'weekly',
      priority:1
    },
    {
      url:'https://devinx.com.br/loja',
      lastModified,
      changeFrequency:'weekly',
      priority:0.9
    }
  ];

  if(visibility.finance){
    pages.push(
      {
        url:'https://devinx.com.br/financeiro',
        lastModified,
        changeFrequency:'weekly',
        priority:0.9
      },
      {
        url:'https://devinx.com.br/controle-financeiro-motorista-app',
        lastModified,
        changeFrequency:'monthly',
        priority:0.8
      },
      {
        url:'https://devinx.com.br/meta-diaria-financeira',
        lastModified,
        changeFrequency:'monthly',
        priority:0.8
      },
      {
        url:'https://devinx.com.br/controle-financeiro-autonomo',
        lastModified,
        changeFrequency:'monthly',
        priority:0.8
      }
    );
  }



  return pages;
}
