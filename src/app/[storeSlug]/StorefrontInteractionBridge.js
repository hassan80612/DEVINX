"use client";

import { useEffect } from "react";

function closestPhotoBox(target) {
  return target?.closest?.('[class*="storefront_photoBox"]') || null;
}
function thumbButtons(box) {
  const article = box?.closest?.("article");
  return article ? Array.from(article.querySelectorAll('[class*="storefront_thumbs"] button')) : [];
}
function currentThumbIndex(buttons) {
  const index = buttons.findIndex((button) => button.getAttribute("data-active") === "1");
  return index >= 0 ? index : 0;
}
function mainImage(box) {
  return box?.querySelector?.('[class*="storefront_mainPhoto"]') || box?.querySelector?.("img") || null;
}

export default function StorefrontInteractionBridge() {
  useEffect(() => {
    let gesture = null;
    let focusedBox = null;

    function clearGesture({ snapBack = true } = {}) {
      if (!gesture) return;
      if (gesture.timer) window.clearTimeout(gesture.timer);
      const image = mainImage(gesture.box);
      if (image && snapBack) {
        image.style.transition = "transform .18s ease";
        image.style.transform = "translate3d(0,0,0)";
      }
      gesture.box?.setAttribute?.("data-dragging", "0");
      gesture = null;
    }

    function focusBox(box) {
      if (!box) return;
      if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "0");
      focusedBox = box;
      try { box.focus({ preventScroll: true }); } catch { try { box.focus(); } catch {} }
    }

    function stepBox(box, direction) {
      const buttons = thumbButtons(box);
      if (buttons.length < 2) return false;
      const active = currentThumbIndex(buttons);
      const next = (active + direction + buttons.length) % buttons.length;
      buttons[next]?.click();
      return true;
    }

    function openZoom(box) {
      if (!box || !mainImage(box)) return;
      box.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    }

    function onPointerDown(event) {
      const box = closestPhotoBox(event.target);
      if (!box || event.target?.closest?.('[class*="commerce_favoriteButton"]')) return;
      focusBox(box);
      if (window.innerWidth > 700 || event.pointerType === "mouse" || event.isPrimary === false) return;
      clearGesture();
      gesture = {
        box,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
        moved: false,
        opened: false,
        timer: window.setTimeout(() => {
          if (!gesture || gesture.box !== box || gesture.moved) return;
          gesture.opened = true;
          openZoom(box);
        }, 430),
      };
      try { box.setPointerCapture(event.pointerId); } catch {}
    }

    function onPointerMove(event) {
      if (!gesture || window.innerWidth > 700 || gesture.pointerId !== event.pointerId || gesture.opened) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        gesture.moved = true;
        if (gesture.timer) { window.clearTimeout(gesture.timer); gesture.timer = null; }
      }
      if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 3) return;
      const image = mainImage(gesture.box);
      if (!image) return;
      gesture.box.setAttribute("data-dragging", "1");
      image.style.transition = "none";
      image.style.transform = `translate3d(${dx}px,0,0)`;
    }

    function finishPointer(event, cancelled = false) {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const current = gesture;
      if (current.timer) window.clearTimeout(current.timer);
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.opened && !cancelled && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        stepBox(current.box, dx < 0 ? 1 : -1);
      }
      clearGesture();
    }

    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase?.();
      if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
      const zoomModal = document.querySelector('[class*="storefront_zoomModal"]');
      if (zoomModal) {
        if (event.key === "Escape") {
          event.preventDefault();
          zoomModal.querySelector('[class*="storefront_zoomClose"]')?.click();
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const selector = event.key === "ArrowLeft" ? '[class*="storefront_zoomPrev"]' : '[class*="storefront_zoomNext"]';
          const button = zoomModal.querySelector(selector);
          if (button) { event.preventDefault(); button.click(); }
          return;
        }
      }
      if (window.innerWidth <= 700) return;
      const box = closestPhotoBox(document.activeElement) || focusedBox;
      if (box && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (stepBox(box, event.key === "ArrowRight" ? 1 : -1)) event.preventDefault();
      }
    }

    function prepareBoxes() {
      document.querySelectorAll('[class*="storefront_photoBox"]').forEach((box) => {
        if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "0");
      });
    }

    prepareBoxes();
    const observer = new MutationObserver(prepareBoxes);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", (event) => finishPointer(event, false), true);
    document.addEventListener("pointercancel", (event) => finishPointer(event, true), true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect(); clearGesture();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
