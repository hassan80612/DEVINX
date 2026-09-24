"use client";

import { useEffect } from "react";
import StorefrontClientV3 from "./StorefrontClientV3";

export default function StorefrontClient(props) {
  useEffect(() => {
    const closeNativeSelectAfterChoice = (event) => {
      const select = event.target?.closest?.('main[class*="storefront_page"] [class*="storefront_productBody"] select');
      if (!select) return;
      window.requestAnimationFrame(() => select.blur());
    };
    document.addEventListener("change", closeNativeSelectAfterChoice, true);

    return () => {
      document.removeEventListener("change", closeNativeSelectAfterChoice, true);
    };
  }, []);

  return <StorefrontClientV3 {...props} />;
}
