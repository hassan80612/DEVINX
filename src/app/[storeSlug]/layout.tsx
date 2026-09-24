import "./storefront-theme.css";
import StorefrontInteractionBridge from "./StorefrontInteractionBridge";

export default function StorefrontLayout({children}:{children:React.ReactNode}){
  return <div className="storefrontThemeRoot"><StorefrontInteractionBridge/>{children}</div>;
}
