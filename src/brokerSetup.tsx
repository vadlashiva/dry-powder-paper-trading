// @ts-nocheck
import { useEffect, useState } from "react";
import { loadLang, saveLang } from "./i18n";
import { track } from "./growth";

// Where "Open a free Angel One account" goes. If you join Angel One's referral programme,
// put your referral link here instead.
export const ANGEL_OPEN_ACCOUNT_URL = "https://www.angelone.in/open-demat-account";

// Optional setup videos (about 2 minutes each, e.g. unlisted YouTube links), one per language.
// A "Watch the 2-minute video" button appears on the setup screen for each language that has a link.
export const SETUP_VIDEOS = { en: "", hi: "", kn: "" };

// Optional screenshots for each setup step. Put images in public/setup/ named
// <broker>-step1.png … <broker>-step4.png (e.g. angel-step2.png); a step without an image shows text only.
function StepShot({ broker, step }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [broker, step]);
  if (!ok) return null;
  return <img className="setupShot" src={`/setup/${broker}-step${step}.png`} alt="" loading="lazy" onError={() => setOk(false)} />;
}

const TEXT = {
  en: {
    qTitle: "Do you have an Angel One account?",
    qSub: "PaperRally uses your own free Angel One connection for live market prices. Your money and holdings are never touched.",
    yes: "Yes, I have Angel One", no: "No, not yet", other: "I use FYERS or Upstox",
    noTitle: "Open a free Angel One account",
    noSub: "Opening an Angel One account is free and done online. Keep your PAN, Aadhaar and bank details ready. Once your account is active, come back here to connect.",
    openAcc: "Open a free Angel One account", haveNow: "I have my account now", backPreview: "Back to the preview",
    video: "Watch the 2-minute video",
    title: "Connect your broker", reconnectTitle: (b) => `Reconnect ${b}`,
    reconnectSub: (b) => `${b} logins end each day. Log in again to continue practising.`,
    reconnect: (b) => `Reconnect ${b}`, changeKey: "Change broker or key",
    intro: "Your own free broker API opens PaperRally. It takes about 3 minutes, once.",
    step: (n) => `Step ${n} of 4`, next: "Next", back: "Back", copy: "Copy", copied: "Copied",
    s1t: "Open your broker's API site", s1: (b) => `Open the ${b} API site in a new tab and log in with your ${b} account. Keep this page open.`, s1b: (b) => `Open ${b} API site`,
    s2t: "Create your app", s2: "Click My Profile, then + ADD APP, and enter these details:",
    app: "App Name", redirect: "Redirect URL", ip: "Primary Static IP", ipFind: "Find my IP", ipBusy: "Finding…",
    ipNote: "Finding your IP asks ipify.org. Leave the Post back and Secondary fields blank.", ipFail: "Couldn't find it. Search Google for \"what is my IP\".",
    s3t: "Copy your key", s3: "Click Add. In My Smart API & Apps, click the eye icon beside your API Key and copy it. Don't copy any Secret Key.",
    s4t: (b) => `Paste your key and connect ${b}`, label: "SmartAPI key", connect: (b) => `Connect ${b}`,
    bad: "That doesn't look right. Copy it again from your broker's site.",
    note: (b) => `Your keys stay on this device. Enter your PIN or OTP only on ${b}'s own page. PaperRally can't place real orders, and all trades here use virtual money.`,
    helpT: "Having trouble?", h1: "Login page shows an error: check the Redirect URL matches exactly, including the last /.", h2: "Stuck on Connecting: your key may be wrong. Choose Use a different key.", h3: "Prices missing: wait about 15 seconds the first time.",
    choose: "Choose your broker",
    chooseSub: "You need an account with one of these brokers.",
    more: "More brokers can be added later.",
    s2a: "Click My Profile, then + ADD APP, and enter these details:",
    s2f: "Create a new Individual app, turn on Market Data permission, and enter these details:",
    s2u: "Click New App and enter these details:",
    s3a: "Click Add. Click the eye icon beside your API Key and copy it. Don't copy any Secret Key.",
    s3f: "Save the app, then copy its App ID and Secret ID.",
    s3u: "Save the app, then copy its API Key and API Secret.",
    secretLabel: "Secret",
  },
  hi: {
    qTitle: "क्या आपका Angel One खाता है?",
    qSub: "PaperRally लाइव मार्केट कीमतों के लिए आपके अपने मुफ़्त Angel One कनेक्शन का उपयोग करता है। आपके पैसे और होल्डिंग्स को कभी छुआ नहीं जाता।",
    yes: "हाँ, मेरा Angel One खाता है", no: "नहीं, अभी नहीं", other: "मैं FYERS या Upstox उपयोग करता/करती हूँ",
    noTitle: "मुफ़्त Angel One खाता खोलें",
    noSub: "Angel One खाता खोलना मुफ़्त है और ऑनलाइन होता है। अपना PAN, आधार और बैंक विवरण तैयार रखें। खाता चालू होने के बाद जोड़ने के लिए यहाँ वापस आएँ।",
    openAcc: "मुफ़्त Angel One खाता खोलें", haveNow: "अब मेरा खाता है", backPreview: "प्रीव्यू पर वापस जाएँ",
    video: "2 मिनट का वीडियो देखें",
    title: "अपना ब्रोकर जोड़ें", reconnectTitle: (b) => `${b} फिर से जोड़ें`,
    reconnectSub: (b) => `${b} लॉगिन हर दिन समाप्त होता है। अभ्यास जारी रखने के लिए फिर से लॉगिन करें।`,
    reconnect: (b) => `${b} फिर से जोड़ें`, changeKey: "ब्रोकर या key बदलें",
    intro: "आपके अपने मुफ़्त ब्रोकर API से PaperRally खुलता है। इसमें एक बार लगभग 3 मिनट लगते हैं।",
    step: (n) => `चरण ${n} / 4`, next: "आगे", back: "पीछे", copy: "कॉपी", copied: "कॉपी हो गया",
    s1t: "अपने ब्रोकर की API साइट खोलें", s1: (b) => `${b} की API साइट नए टैब में खोलें और अपने ${b} खाते से लॉगिन करें। यह पेज खुला रखें।`, s1b: (b) => `${b} API साइट खोलें`,
    s2t: "अपना ऐप बनाएँ", s2: "My Profile पर क्लिक करें, फिर + ADD APP पर, और ये विवरण भरें:",
    app: "App Name", redirect: "Redirect URL", ip: "Primary Static IP", ipFind: "मेरा IP खोजें", ipBusy: "खोज रहे हैं…",
    ipNote: "IP खोजने के लिए ipify.org से पूछा जाता है। Post back और Secondary खाली छोड़ें।", ipFail: "नहीं मिला। Google पर \"what is my IP\" खोजें।",
    s3t: "अपनी key कॉपी करें", s3: "Add पर क्लिक करें। My Smart API & Apps में API Key के पास आँख के चिह्न पर क्लिक करके उसे कॉपी करें। Secret Key कॉपी न करें।",
    s4t: (b) => `अपनी key पेस्ट करके ${b} जोड़ें`, label: "SmartAPI key", connect: (b) => `${b} जोड़ें`,
    bad: "यह सही नहीं लगता। अपने ब्रोकर की साइट से फिर से कॉपी करें।",
    note: (b) => `आपकी keys इसी डिवाइस पर रहती हैं। अपना PIN या OTP केवल ${b} के पेज पर डालें। PaperRally असली ऑर्डर नहीं दे सकता, यहाँ सभी ट्रेड वर्चुअल पैसे से होते हैं।`,
    helpT: "कोई समस्या?", h1: "लॉगिन पेज पर त्रुटि: जाँचें कि Redirect URL अंतिम / सहित बिल्कुल वही है।", h2: "Connecting पर अटका है: key गलत हो सकती है। दूसरी key उपयोग करें चुनें।", h3: "कीमतें नहीं दिख रहीं: पहली बार लगभग 15 सेकंड प्रतीक्षा करें।",
    choose: "अपना ब्रोकर चुनें",
    chooseSub: "इनमें से किसी एक ब्रोकर में आपका खाता होना चाहिए।",
    more: "बाद में और ब्रोकर जोड़े जा सकते हैं।",
    s2a: "My Profile पर क्लिक करें, फिर + ADD APP पर, और ये विवरण भरें:",
    s2f: "नया Individual ऐप बनाएँ, Market Data अनुमति चालू करें, और ये विवरण भरें:",
    s2u: "New App पर क्लिक करें और ये विवरण भरें:",
    s3a: "Add पर क्लिक करें। API Key के पास आँख के चिह्न पर क्लिक करके उसे कॉपी करें। Secret Key कॉपी न करें।",
    s3f: "ऐप सहेजें, फिर उसका App ID और Secret ID कॉपी करें।",
    s3u: "ऐप सहेजें, फिर उसका API Key और API Secret कॉपी करें।",
    secretLabel: "Secret",
  },
  kn: {
    qTitle: "ನಿಮ್ಮ ಬಳಿ Angel One ಖಾತೆ ಇದೆಯೇ?",
    qSub: "ಲೈವ್ ಮಾರುಕಟ್ಟೆ ಬೆಲೆಗಳಿಗಾಗಿ PaperRally ನಿಮ್ಮದೇ ಉಚಿತ Angel One ಸಂಪರ್ಕವನ್ನು ಬಳಸುತ್ತದೆ. ನಿಮ್ಮ ಹಣ ಮತ್ತು ಹೋಲ್ಡಿಂಗ್ಸ್ ಅನ್ನು ಎಂದಿಗೂ ಮುಟ್ಟುವುದಿಲ್ಲ.",
    yes: "ಹೌದು, ನನ್ನ ಬಳಿ Angel One ಇದೆ", no: "ಇಲ್ಲ, ಇನ್ನೂ ಇಲ್ಲ", other: "ನಾನು FYERS ಅಥವಾ Upstox ಬಳಸುತ್ತೇನೆ",
    noTitle: "ಉಚಿತ Angel One ಖಾತೆ ತೆರೆಯಿರಿ",
    noSub: "Angel One ಖಾತೆ ತೆರೆಯುವುದು ಉಚಿತ ಮತ್ತು ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಆಗುತ್ತದೆ. ನಿಮ್ಮ PAN, ಆಧಾರ್ ಮತ್ತು ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಸಿದ್ಧವಾಗಿಡಿ. ಖಾತೆ ಸಕ್ರಿಯವಾದ ನಂತರ ಸಂಪರ್ಕಿಸಲು ಇಲ್ಲಿಗೆ ಹಿಂತಿರುಗಿ.",
    openAcc: "ಉಚಿತ Angel One ಖಾತೆ ತೆರೆಯಿರಿ", haveNow: "ಈಗ ನನ್ನ ಖಾತೆ ಇದೆ", backPreview: "ಪ್ರಿವ್ಯೂಗೆ ಹಿಂತಿರುಗಿ",
    video: "2 ನಿಮಿಷದ ವೀಡಿಯೊ ನೋಡಿ",
    title: "ನಿಮ್ಮ ಬ್ರೋಕರ್ ಸಂಪರ್ಕಿಸಿ", reconnectTitle: (b) => `${b} ಮತ್ತೆ ಸಂಪರ್ಕಿಸಿ`,
    reconnectSub: (b) => `${b} ಲಾಗಿನ್ ಪ್ರತಿದಿನ ಮುಗಿಯುತ್ತದೆ. ಅಭ್ಯಾಸ ಮುಂದುವರಿಸಲು ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.`,
    reconnect: (b) => `${b} ಮತ್ತೆ ಸಂಪರ್ಕಿಸಿ`, changeKey: "ಬ್ರೋಕರ್ ಅಥವಾ key ಬದಲಿಸಿ",
    intro: "ನಿಮ್ಮದೇ ಉಚಿತ ಬ್ರೋಕರ್ API ಯಿಂದ PaperRally ತೆರೆಯುತ್ತದೆ. ಒಮ್ಮೆ ಸುಮಾರು 3 ನಿಮಿಷ ಬೇಕು.",
    step: (n) => `ಹಂತ ${n} / 4`, next: "ಮುಂದೆ", back: "ಹಿಂದೆ", copy: "ನಕಲಿಸಿ", copied: "ನಕಲಾಗಿದೆ",
    s1t: "ನಿಮ್ಮ ಬ್ರೋಕರ್ API ಸೈಟ್ ತೆರೆಯಿರಿ", s1: (b) => `${b} API ಸೈಟ್ ಅನ್ನು ಹೊಸ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆದು ನಿಮ್ಮ ${b} ಖಾತೆಯಿಂದ ಲಾಗಿನ್ ಮಾಡಿ. ಈ ಪುಟವನ್ನು ತೆರೆದಿಡಿ.`, s1b: (b) => `${b} API ಸೈಟ್ ತೆರೆಯಿರಿ`,
    s2t: "ನಿಮ್ಮ ಆ್ಯಪ್ ರಚಿಸಿ", s2: "My Profile, ನಂತರ + ADD APP ಕ್ಲಿಕ್ ಮಾಡಿ, ಈ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ:",
    app: "App Name", redirect: "Redirect URL", ip: "Primary Static IP", ipFind: "ನನ್ನ IP ಹುಡುಕಿ", ipBusy: "ಹುಡುಕುತ್ತಿದೆ…",
    ipNote: "IP ಹುಡುಕಲು ipify.org ಅನ್ನು ಕೇಳಲಾಗುತ್ತದೆ. Post back ಮತ್ತು Secondary ಖಾಲಿ ಬಿಡಿ.", ipFail: "ಸಿಗಲಿಲ್ಲ. Google ನಲ್ಲಿ \"what is my IP\" ಹುಡುಕಿ.",
    s3t: "ನಿಮ್ಮ key ನಕಲಿಸಿ", s3: "Add ಕ್ಲಿಕ್ ಮಾಡಿ. My Smart API & Apps ನಲ್ಲಿ API Key ಪಕ್ಕದ ಕಣ್ಣಿನ ಚಿಹ್ನೆ ಕ್ಲಿಕ್ ಮಾಡಿ ನಕಲಿಸಿ. Secret Key ನಕಲಿಸಬೇಡಿ.",
    s4t: (b) => `ನಿಮ್ಮ key ಅಂಟಿಸಿ ${b} ಸಂಪರ್ಕಿಸಿ`, label: "SmartAPI key", connect: (b) => `${b} ಸಂಪರ್ಕಿಸಿ`,
    bad: "ಇದು ಸರಿಯಾಗಿ ಕಾಣುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಬ್ರೋಕರ್ ಸೈಟ್‌ನಿಂದ ಮತ್ತೆ ನಕಲಿಸಿ.",
    note: (b) => `ನಿಮ್ಮ keys ಈ ಸಾಧನದಲ್ಲೇ ಇರುತ್ತವೆ. ನಿಮ್ಮ PIN ಅಥವಾ OTP ಅನ್ನು ${b} ಪುಟದಲ್ಲಿ ಮಾತ್ರ ನಮೂದಿಸಿ. PaperRally ನಿಜವಾದ ಆರ್ಡರ್ ಮಾಡಲಾಗದು, ಇಲ್ಲಿನ ಎಲ್ಲ ವಹಿವಾಟುಗಳು ವರ್ಚುವಲ್ ಹಣದಿಂದ.`,
    helpT: "ಸಮಸ್ಯೆ ಇದೆಯೇ?", h1: "ಲಾಗಿನ್ ಪುಟದಲ್ಲಿ ದೋಷ: Redirect URL ಕೊನೆಯ / ಸಹಿತ ಸರಿಯಾಗಿದೆಯೇ ಪರಿಶೀಲಿಸಿ.", h2: "Connecting ನಲ್ಲಿ ನಿಂತಿದೆ: key ತಪ್ಪಿರಬಹುದು. ಬೇರೆ key ಬಳಸಿ ಆಯ್ಕೆಮಾಡಿ.", h3: "ಬೆಲೆಗಳು ಕಾಣುತ್ತಿಲ್ಲ: ಮೊದಲ ಬಾರಿ ಸುಮಾರು 15 ಸೆಕೆಂಡು ಕಾಯಿರಿ.",
    choose: "ನಿಮ್ಮ ಬ್ರೋಕರ್ ಆಯ್ಕೆಮಾಡಿ",
    chooseSub: "ಇವುಗಳಲ್ಲಿ ಒಂದರಲ್ಲಿ ನಿಮ್ಮ ಖಾತೆ ಇರಬೇಕು.",
    more: "ನಂತರ ಇನ್ನಷ್ಟು ಬ್ರೋಕರ್‌ಗಳನ್ನು ಸೇರಿಸಬಹುದು.",
    s2a: "My Profile, ನಂತರ + ADD APP ಕ್ಲಿಕ್ ಮಾಡಿ, ಈ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ:",
    s2f: "ಹೊಸ Individual ಆ್ಯಪ್ ರಚಿಸಿ, Market Data ಅನುಮತಿ ಆನ್ ಮಾಡಿ, ಈ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ:",
    s2u: "New App ಕ್ಲಿಕ್ ಮಾಡಿ ಈ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ:",
    s3a: "Add ಕ್ಲಿಕ್ ಮಾಡಿ. API Key ಪಕ್ಕದ ಕಣ್ಣಿನ ಚಿಹ್ನೆ ಕ್ಲಿಕ್ ಮಾಡಿ ನಕಲಿಸಿ. Secret Key ನಕಲಿಸಬೇಡಿ.",
    s3f: "ಆ್ಯಪ್ ಉಳಿಸಿ, ನಂತರ ಅದರ App ID ಮತ್ತು Secret ID ನಕಲಿಸಿ.",
    s3u: "ಆ್ಯಪ್ ಉಳಿಸಿ, ನಂತರ ಅದರ API Key ಮತ್ತು API Secret ನಕಲಿಸಿ.",
    secretLabel: "Secret",
  },
};
const LANGS = [["en", "English"], ["hi", "हिंदी"], ["kn", "ಕನ್ನಡ"]];

function CopyRow({ label, value, t }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the value is on screen to copy by hand */ }
  };
  return (
    <div className="setupRow">
      <div><span className="dim">{label}</span><b className="mono">{value}</b></div>
      <button type="button" className="btn btnGhost" onClick={copy}>{done ? t.copied : t.copy}</button>
    </div>
  );
}

function useSetupLang() {
  const [lang, setLangState] = useState(() => { const l = loadLang(); return TEXT[l] ? l : "en"; });
  const setLang = (l) => { setLangState(l); saveLang(l); track("setup_lang", { lang: l }); };
  const langs = (
    <div className="setupLangs" role="group" aria-label="Language">
      {LANGS.map(([id, name]) => <button key={id} type="button" aria-pressed={lang === id} className={lang === id ? "setupLangOn" : ""} onClick={() => setLang(id)}>{name}</button>)}
    </div>
  );
  return { lang, t: TEXT[lang], langs };
}

// First question for a new user: do they already have an Angel One account?
export function AccountQuestion({ brand, onYes, onOther, onBack }) {
  const { t, langs } = useSetupLang();
  const [noAccount, setNoAccount] = useState(false);
  if (noAccount) {
    return (
      <div className="authCard angelCard">
        {brand}{langs}
        <h1>{t.noTitle}</h1>
        <div className="authSub">{t.noSub}</div>
        <div className="setupChoices">
          <a className="btn btnBull setupOpen" href={ANGEL_OPEN_ACCOUNT_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("setup_open_account_click")}>{t.openAcc}</a>
          <button type="button" className="btn btnGhost" onClick={() => { track("setup_account_ready"); onYes(); }}>{t.haveNow}</button>
        </div>
        <button type="button" className="setupLink" onClick={() => { track("setup_other_broker", { from: "no_account" }); onOther(); }}>{t.other}</button>
        <br />
        <button type="button" className="setupLink" onClick={onBack}>{t.backPreview}</button>
      </div>
    );
  }
  return (
    <div className="authCard angelCard">
      {brand}{langs}
      <h1>{t.qTitle}</h1>
      <div className="authSub">{t.qSub}</div>
      <div className="setupChoices">
        <button type="button" className="btn btnBull" onClick={() => { track("setup_has_account", { answer: "yes" }); onYes(); }}>{t.yes}</button>
        <button type="button" className="btn btnGhost" onClick={() => { track("setup_has_account", { answer: "no" }); setNoAccount(true); }}>{t.no}</button>
      </div>
      <button type="button" className="setupLink" onClick={() => { track("setup_other_broker", { from: "question" }); onOther(); }}>{t.other}</button>
      <br />
      <button type="button" className="setupLink" onClick={onBack}>{t.backPreview}</button>
    </div>
  );
}

export function BrokerSetup({ brokers, broker, hasKey, error, onChoose, onConnect, onReconnect, onForget, brand }) {
  const { lang, t, langs } = useSetupLang();
  const [step, setStep] = useState(1);
  // Record each setup step the person reaches. Reaching step 3 means they've created the app on the broker's site.
  useEffect(() => {
    if (!broker || hasKey) return;
    track("setup_step", { step, broker: broker.id });
    if (step === 3) track("setup_app_created", { broker: broker.id });
  }, [step, broker?.id, hasKey]);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [bad, setBad] = useState(false);
  const [ip, setIp] = useState("");
  const [ipState, setIpState] = useState("idle");
  const redirect = `${window.location.origin}/`;
  const appName = window.location.hostname.replace(/^www\./, "");
  const findIp = async () => {
    setIpState("busy");
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      setIp((await r.json()).ip);
      setIpState("idle");
      track("setup_ip_found", { broker: broker.id });
    } catch { setIpState("failed"); track("setup_ip_failed", { broker: broker.id }); }
  };
  const submit = (e) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_-]{6,}$/.test(key.trim()) || (broker.needsSecret && secret.trim().length < 6)) {
      track("setup_key_invalid", { broker: broker.id });
      return setBad(true);
    }
    track("setup_key_entered", { broker: broker.id });
    onConnect({ key: key.trim(), secret: secret.trim() });
  };
  if (!broker) {
    return (
      <div className="authCard angelCard">
        {brand}{langs}
        <h1>{t.choose}</h1>
        <div className="authSub">{t.chooseSub}</div>
        <div className="setupBrokers">
          {Object.values(brokers).map((b) => <button key={b.id} type="button" className="btn btnGhost" onClick={() => { track("setup_broker_chosen", { broker: b.id }); onChoose(b.id); }}>{b.name}</button>)}
        </div>
        {error && <div className="authError" role="alert">{error}</div>}
        <div className="dim angelNote">{t.more}</div>
      </div>
    );
  }
  const name = broker.name;
  if (hasKey) {
    return (
      <div className="authCard angelCard">
        {brand}{langs}
        <h1>{t.reconnectTitle(name)}</h1>
        <div className="authSub">{t.reconnectSub(name)}</div>
        {error && <div className="authError" role="alert">{error}</div>}
        <button type="button" className="btn btnBull authSubmit" onClick={() => { track("reconnect_click", { broker: broker.id }); onReconnect(); }}>{t.reconnect(name)}</button>
        <div className="dim angelNote">{t.note(name)}</div>
        <button type="button" className="setupLink" onClick={() => { track("setup_change_key", { broker: broker.id }); onForget(); }}>{t.changeKey}</button>
      </div>
    );
  }
  const s2 = { angel: t.s2a, fyers: t.s2f, upstox: t.s2u }[broker.id];
  const s3 = { angel: t.s3a, fyers: t.s3f, upstox: t.s3u }[broker.id];
  return (
    <form className="authCard angelCard" onSubmit={submit}>
      {brand}{langs}
      <h1>{t.title}</h1>
      <div className="authSub">{t.intro}</div>
      <div className="setupProgress" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step}><span style={{ width: `${step * 25}%` }} /></div>
      <div className="dim setupStepNo">{t.step(step)}</div>
      {SETUP_VIDEOS[lang] && broker.id === "angel" && (
        <a className="btn btnGhost setupVideo" href={SETUP_VIDEOS[lang]} target="_blank" rel="noopener noreferrer" onClick={() => track("setup_video_open", { lang, step })}>{t.video}</a>
      )}
      <StepShot broker={broker.id} step={step} />
      {step === 1 && (<>
        <h2>{t.s1t}</h2><p>{t.s1(name)}</p>
        <a className="btn btnGhost setupOpen" href={broker.site} target="_blank" rel="noopener noreferrer" onClick={() => track("setup_api_site_opened", { broker: broker.id })}>{t.s1b(name)}</a>
      </>)}
      {step === 2 && (<>
        <h2>{t.s2t}</h2><p>{s2}</p>
        <CopyRow label={t.app} value={appName} t={t} />
        <CopyRow label={t.redirect} value={redirect} t={t} />
        {broker.id === "angel" && (<>
          {ip ? <CopyRow label={t.ip} value={ip} t={t} /> : (
            <div className="setupRow">
              <div><span className="dim">{t.ip}</span></div>
              <button type="button" className="btn btnGhost" disabled={ipState === "busy"} onClick={findIp}>{ipState === "busy" ? t.ipBusy : t.ipFind}</button>
            </div>
          )}
          <div className="dim angelNote">{ipState === "failed" ? t.ipFail : t.ipNote}</div>
        </>)}
      </>)}
      {step === 3 && (<><h2>{t.s3t}</h2><p>{s3}</p></>)}
      {step === 4 && (<>
        <h2>{t.s4t(name)}</h2>
        <label htmlFor="brokerKey">{broker.keyLabel}</label>
        <input id="brokerKey" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); setBad(false); }} />
        {broker.needsSecret && (<>
          <label htmlFor="brokerSecret">{t.secretLabel}</label>
          <input id="brokerSecret" type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => { setSecret(e.target.value); setBad(false); }} />
        </>)}
        {(bad || error) && <div className="authError" role="alert">{bad ? t.bad : error}</div>}
        <button type="submit" className="btn btnBull authSubmit">{t.connect(name)}</button>
        <div className="dim angelNote">{t.note(name)}</div>
        <details className="setupHelp"><summary>{t.helpT}</summary><ul><li>{t.h1}</li><li>{t.h2}</li><li>{t.h3}</li></ul></details>
      </>)}
      <div className="setupNav">
        {step > 1 && <button type="button" className="btn btnGhost" onClick={() => setStep(step - 1)}>{t.back}</button>}
        {step < 4 && <button type="button" className="btn btnBull" onClick={() => setStep(step + 1)}>{t.next}</button>}
      </div>
    </form>
  );
}
