import "./storefront-theme.css";
// @ts-ignore -- Interaction bridge remains in JavaScript during the staged migration.
import StorefrontInteractionBridge from "./StorefrontInteractionBridge";

export default function StorefrontLayout({children}:{children:React.ReactNode}){
  return <div className="storefrontThemeRoot"><StorefrontInteractionBridge/>{children}</div>;
}
