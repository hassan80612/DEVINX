"use client";

import { useEffect } from "react";
import StorefrontClientV3 from "./StorefrontClientV3";

export default function StorefrontClient(props) {
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.storefrontEnhancements = "1";
    style.textContent = `
      @keyframes storefrontGoldShine {
        0%, 18% { background-position: 115% 50%; }
        55%, 100% { background-position: -35% 50%; }
      }
      main[class*="storefront_page"] [class*="storefront_identity"] strong {
        font-family: Georgia, "Times New Roman", serif !important;
        font-weight: 700 !important;
        letter-spacing: .035em !important;
        color: #f6c84c !important;
        background: linear-gradient(105deg,#a86d10 0%,#e3aa2f 25%,#fff2a6 42%,#ffd65b 51%,#fff7c8 57%,#d99a20 74%,#f4c84d 100%) !important;
        background-size: 240% 100% !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        text-shadow: 0 1px 0 rgba(255,236,154,.16), 0 0 12px rgba(242,187,50,.18) !important;
        animation: storefrontGoldShine 4.6s ease-in-out infinite !important;
      }
      main[class*="storefront_page"] [class*="storefront_productBody"] select {
        color-scheme: dark !important;
        background-color: #081a24 !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
      }
      main[class*="storefront_page"] [class*="storefront_productBody"] select option {
        background: #081a24 !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
      }
      main[class*="storefront_page"] [class*="storefront_productBody"] select:disabled {
        color: #82929a !important;
        -webkit-text-fill-color: #82929a !important;
      }

      main[class*="storefront_page"] [class*="storefront_videos"] {
        position: relative !important;
        overflow: hidden !important;
        padding: 30px !important;
        border: 1px solid rgba(92, 201, 188, .28) !important;
        background:
          radial-gradient(circle at 88% 10%, rgba(247,197,74,.12), transparent 26%),
          radial-gradient(circle at 10% 100%, rgba(54,205,185,.10), transparent 30%),
          linear-gradient(145deg, #0b2026, #07161d) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 20px 48px rgba(0,0,0,.22), 0 0 34px rgba(44,196,175,.05) !important;
      }
      main[class*="storefront_page"] [class*="storefront_videos"]:before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: linear-gradient(180deg, #f0c85c, #58d7c2, transparent);
        box-shadow: 0 0 18px rgba(88,215,194,.22);
      }
      main[class*="storefront_page"] [class*="storefront_videos"] > span {
        background: rgba(247,197,74,.07) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 0 18px rgba(247,197,74,.05) !important;
      }
      main[class*="storefront_page"] [class*="storefront_videos"] h2 {
        font-size: 22px !important;
        letter-spacing: -.3px !important;
        margin-bottom: 18px !important;
      }
      main[class*="storefront_page"] [class*="storefront_videos"] > div {
        gap: 10px !important;
      }
      main[class*="storefront_page"] [class*="storefront_videos"] a {
        position: relative !important;
        min-height: 42px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 0 14px !important;
        border: 1px solid rgba(91,182,188,.32) !important;
        border-radius: 12px !important;
        background: linear-gradient(180deg, rgba(17,48,56,.96), rgba(8,27,34,.98)) !important;
        color: #edf7f8 !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.03), 0 8px 20px rgba(0,0,0,.13) !important;
        transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease !important;
      }
      main[class*="storefront_page"] [class*="storefront_videos"] a:before {
        content: "✦";
        color: #e9c867;
        font-size: 10px;
      }
      main[class*="storefront_page"] [class*="storefront_videos"] a:hover {
        transform: translateY(-2px) !important;
        border-color: rgba(247,197,74,.52) !important;
        background: linear-gradient(180deg, #153943, #0b2730) !important;
        box-shadow: 0 12px 26px rgba(0,0,0,.18), 0 0 20px rgba(247,197,74,.05) !important;
      }
      main[class*="storefront_page"] [class*="storefront_footer"] {
        border-top: 1px solid rgba(87,190,181,.2) !important;
        background:
          radial-gradient(circle at 14% 0%, rgba(45,188,169,.09), transparent 28%),
          linear-gradient(180deg, rgba(6,22,25,.98), rgba(4,14,17,.99)) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.02) !important;
      }
      main[class*="storefront_page"] [class*="storefront_footer"] strong {
        font-family: Georgia, "Times New Roman", serif !important;
        letter-spacing: .02em !important;
        text-shadow: 0 0 14px rgba(242,203,98,.12) !important;
      }

      @media (max-width: 700px) {
        main[class*="storefront_page"] [class*="storefront_videos"] {
          width: calc(100% - 18px) !important;
          padding: 18px 14px 16px !important;
          margin-bottom: 24px !important;
          border-radius: 16px !important;
        }
        main[class*="storefront_page"] [class*="storefront_videos"] h2 {
          font-size: 18px !important;
          margin-bottom: 12px !important;
        }
        main[class*="storefront_page"] [class*="storefront_videos"] > div {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0,1fr)) !important;
          gap: 8px !important;
        }
        main[class*="storefront_page"] [class*="storefront_videos"] a {
          width: 100% !important;
          box-sizing: border-box !important;
          min-height: 44px !important;
          justify-content: center !important;
          text-align: center !important;
          padding: 0 8px !important;
          font-size: 10px !important;
        }
        main[class*="storefront_page"] [class*="storefront_footer"] {
          padding-top: 18px !important;
          padding-bottom: 18px !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        main[class*="storefront_page"] [class*="storefront_identity"] strong { animation: none !important; }
        main[class*="storefront_page"] [class*="storefront_videos"] a { transition: none !important; }
      }
    `;
    document.head.appendChild(style);

    const closeNativeSelectAfterChoice = (event) => {
      const select = event.target?.closest?.('main[class*="storefront_page"] [class*="storefront_productBody"] select');
      if (!select) return;
      window.requestAnimationFrame(() => select.blur());
    };
    document.addEventListener("change", closeNativeSelectAfterChoice, true);

    return () => {
      document.removeEventListener("change", closeNativeSelectAfterChoice, true);
      style.remove();
    };
  }, []);

  return <StorefrontClientV3 {...props} />;
}
