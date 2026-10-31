// @ts-nocheck
// Installable app (PWA) support: service worker, the "Install app" prompt and
// system notifications for alerts and fills.
import { useEffect, useState } from "react";

let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function initPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferredPrompt = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try { localStorage.setItem("pr_installed", "1"); } catch { /* ignore */ }
    emit();
  });
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("service worker registration failed", err));
    });
  }
}

export function isStandalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch { return false; }
}

export function isIos() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Which install instructions to show when the browser has no native install prompt.
export function installPlatform() {
  const ua = navigator.userAgent || "";
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|LinkedInApp|Twitter|; wv\)/i.test(ua)) return "inapp";
  if (isIos()) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios-safari";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Firefox/i.test(ua) && /Android/i.test(ua)) return "firefox";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function canPromptInstall() { return !!deferredPrompt && !isStandalone(); }

export async function promptInstall() {
  if (!deferredPrompt) return "unavailable";
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit();
  return outcome; // "accepted" | "dismissed"
}

// React hook: re-renders when the install prompt becomes available or is used.
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { canInstall: canPromptInstall(), standalone: isStandalone(), ios: isIos(), platform: installPlatform(), promptInstall };
}

/* ---------------- notifications ---------------- */
export function notificationsSupported() { return typeof window !== "undefined" && "Notification" in window; }
export function notificationPermission() { return notificationsSupported() ? Notification.permission : "unsupported"; }
export async function requestNotifications() {
  if (!notificationsSupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

// Shows a system notification when permission is granted and the app isn't in front.
// On Android this has to go through the service worker.
export async function notify(title, body, { tag, force = false } = {}) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  if (!force && document.visibilityState === "visible") return; // the in-app toast already covers it
  const opts = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) return reg.showNotification(title, opts);
    new Notification(title, opts);
  } catch (e) { /* notifications blocked or unsupported here */ }
}
