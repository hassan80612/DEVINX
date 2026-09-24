import "./storefront-theme.css";
// @ts-expect-error Interaction bridge is intentionally kept in JavaScript during the staged migration.\nimport StorefrontInteractionBridge from "./StorefrontInteractionBridge";

export default function StorefrontLayout({children}:{children:React.ReactNode}){
  return <div className="storefrontThemeRoot"><StorefrontInteractionBridge/>{children}</div>;
}
