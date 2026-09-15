'use client';

import {useI18n} from '@/i18n/provider';

type PageKey=keyof ReturnType<typeof useI18n>['messages']['pages'];

export function PageLead({textKey}:{textKey:PageKey}){
  const {messages}=useI18n();
  return <p className="lead">{messages.pages[textKey]}</p>;
}
