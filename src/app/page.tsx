import {HomeHub} from "@/components/HomeHub";
import {getPublicSiteVisibility} from "@/features/site-visibility/server";

export const dynamic='force-dynamic';

export default async function Home(){
  const visibility=await getPublicSiteVisibility();
  return <HomeHub
    laserVisible={visibility.laser}
    financeVisible={visibility.finance}
  />;
}
