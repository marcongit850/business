import { networkById } from "./networks.js";

const INVITE_FOCUS = {
  business: "local business",
  builders: "our industry",
  tourism: "our tourism industry",
};

export function inviteShare(network) {
  const brand = networkById(network);
  const focus = INVITE_FOCUS[network];
  if (!brand || !focus) return null;
  const message = `I joined the ${brand.name}, a free group that advocates for ${focus}. Join here: ${brand.join}`;
  return {
    name: brand.name,
    url: brand.join,
    subject: `Join me in the ${brand.name}`,
    message,
  };
}

export function smsHref(platform, message) {
  const body = encodeURIComponent(message);
  return platform === "ios" ? `sms:&body=${body}` : `sms:?body=${body}`;
}

export function emailHref(share) {
  return `mailto:?subject=${encodeURIComponent(share.subject)}&body=${encodeURIComponent(share.message)}`;
}

export function facebookHref(url) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export function linkedinHref(url) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

export function xHref(share) {
  return `https://x.com/intent/post?text=${encodeURIComponent(share.message)}&url=${encodeURIComponent(share.url)}`;
}
