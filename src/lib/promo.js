import { useEffect, useState } from "react";
import { setOfferPromo } from "./offer";
import { getPromo } from "./remote.js";

export function promoBanners(promo) {
  return (Array.isArray(promo?.banners) ? promo.banners : []).filter((banner) => banner?.id && banner?.src);
}

export function isPromoLive(promo) {
  if (!promo || promo.visible === false) return false;
  return promoBanners(promo).length > 0;
}

export function bannerName(banner, lang) {
  if (!banner) return "";
  return lang === "zh" ? banner.nameZh || banner.nameEn || "" : banner.nameEn || banner.nameZh || "";
}

export function sectionTitle(promo, lang) {
  if (!promo) return "";
  const zh = String(promo.titleZh || "").trim();
  const en = String(promo.titleEn || "").trim();
  return lang === "zh" ? zh || en : en || zh;
}

export function sentenceOf(promo, lang) {
  if (!promo) return "";
  return lang === "zh" ? promo.sentenceZh || promo.sentenceEn || "" : promo.sentenceEn || promo.sentenceZh || "";
}

export function bannerSentence(banner, promo, lang) {
  const own = lang === "zh" ? banner?.sentenceZh : banner?.sentenceEn;
  const other = lang === "zh" ? banner?.sentenceEn : banner?.sentenceZh;
  return String(own || other || sentenceOf(promo, lang) || "").trim();
}

function promoAssetSrc(value) {
  const src = String(value || "");
  if (/^\/assets\/promo\/[a-zA-Z0-9._/-]+$/.test(src) && !src.includes("..")) return src;
  if (/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\/promo\/[A-Za-z0-9._~/-]+$/.test(src)) return src;
  return "";
}

export function bannerHeroSrc(banner) {
  return promoAssetSrc(banner?.heroSrc) || promoAssetSrc(banner?.src) || String(banner?.src || "");
}

export const OFFER_SECTION_HERO = "/assets/promo/offer-hero-prices.jpg";

export function landingBanners(promo) {
  const banners = promoBanners(promo);
  return banners.length ? [banners[0]] : [];
}

let pending = null;
let cachedPromo = null;
const warmedImages = new Set();

function warmPromoImages(promo) {
  if (!promo || typeof Image === "undefined") return;
  const urls = [OFFER_SECTION_HERO];
  promoBanners(promo).forEach((banner) => {
    if (banner.src) urls.push(banner.src);
    if (banner.heroSrc) urls.push(banner.heroSrc);
  });
  urls.forEach((url) => {
    if (!url || warmedImages.has(url)) return;
    warmedImages.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  });
}

export function loadPromo() {
  if (cachedPromo) return Promise.resolve(cachedPromo);
  if (!pending) {
    pending = getPromo()
      .catch(() => null)
      .then((data) => {
        cachedPromo = data;
        if (data) setOfferPromo(data);
        warmPromoImages(data);
        return data;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

if (typeof window !== "undefined") loadPromo();

export function usePromo() {
  const [promo, setPromo] = useState(cachedPromo);
  const [ready, setReady] = useState(cachedPromo != null);
  useEffect(() => {
    let cancel = false;
    loadPromo().then((data) => {
      if (cancel) return;
      setPromo(data);
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, []);
  return { promo, ready, live: isPromoLive(promo) };
}
