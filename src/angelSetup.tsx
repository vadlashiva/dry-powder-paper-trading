// @ts-nocheck
import { useState } from "react";
import { loadLang, saveLang } from "./i18n";

const TEXT = {
  en: {
    title: "Connect your Angel One account", reconnectTitle: "Reconnect Angel One",
    reconnectSub: "Angel One logins end at midnight. Log in again to continue practising.",
    reconnect: "Reconnect Angel One", changeKey: "Use a different key",
    intro: "Your own free SmartAPI key opens PaperRally. It takes about 3 minutes, once.",
    step: (n) => `Step ${n} of 4`, next: "Next", back: "Back", copy: "Copy", copied: "Copied",
    s1t: "Open SmartAPI", s1: "Open Angel One's SmartAPI site in a new tab and log in or sign up with your Angel One client ID. Keep this page open.", s1b: "Open SmartAPI",
    s2t: "Create your app", s2: "Click My Profile, then + ADD APP, and enter these details:",
    app: "App Name", redirect: "Redirect URL", ip: "Primary Static IP", ipFind: "Find my IP", ipBusy: "Finding…",
    ipNote: "Finding your IP asks ipify.org. Leave the Post back and Secondary fields blank.", ipFail: "Couldn't find it. Search Google for \"what is my IP\".",
    s3t: "Copy your API key", s3: "Click Add. In My Smart API & Apps, click the eye icon beside your API Key and copy it. Don't copy any Secret Key.",
    s4t: "Paste your key and connect", label: "SmartAPI key", connect: "Connect Angel One",
    bad: "That doesn't look like a SmartAPI key. Copy it again from the SmartAPI site.",
    note: "Your key stays on this device. Enter your PIN and TOTP only on Angel One's own page. PaperRally can't place real orders, and all trades here use virtual money.",
    helpT: "Having trouble?", h1: "Login page shows an error: check the Redirect URL matches exactly, including the last /.", h2: "Stuck on Connecting: your key may be wrong. Choose Use a different key.", h3: "Prices missing: wait about 15 seconds the first time.",
  },
  hi: {
    title: "अपना Angel One खाता जोड़ें", reconnectTitle: "Angel One फिर से जोड़ें",
    reconnectSub: "Angel One लॉगिन आधी रात को समाप्त हो जाता है। अभ्यास जारी रखने के लिए फिर से लॉगिन करें।",
    reconnect: "Angel One फिर से जोड़ें", changeKey: "दूसरी key उपयोग करें",
    intro: "आपकी अपनी मुफ़्त SmartAPI key से PaperRally खुलता है। इसमें एक बार लगभग 3 मिनट लगते हैं।",
    step: (n) => `चरण ${n} / 4`, next: "आगे", back: "पीछे", copy: "कॉपी", copied: "कॉपी हो गया",
    s1t: "SmartAPI खोलें", s1: "Angel One की SmartAPI साइट नए टैब में खोलें और अपने Angel One client ID से लॉगिन या साइन अप करें। यह पेज खुला रखें।", s1b: "SmartAPI खोलें",
    s2t: "अपना ऐप बनाएँ", s2: "My Profile पर क्लिक करें, फिर + ADD APP पर, और ये विवरण भरें:",
    app: "App Name", redirect: "Redirect URL", ip: "Primary Static IP", ipFind: "मेरा IP खोजें", ipBusy: "खोज रहे हैं…",
    ipNote: "IP खोजने के लिए ipify.org से पूछा जाता है। Post back और Secondary खाली छोड़ें।", ipFail: "नहीं मिला। Google पर \"what is my IP\" खोजें।",
    s3t: "अपनी API key कॉपी करें", s3: "Add पर क्लिक करें। My Smart API & Apps में API Key के पास आँख के चिह्न पर क्लिक करके उसे कॉपी करें। Secret Key कॉपी न करें।",
    s4t: "अपनी key पेस्ट करके जोड़ें", label: "SmartAPI key", connect: "Angel One जोड़ें",
    bad: "यह SmartAPI key जैसी नहीं लगती। SmartAPI साइट से फिर से कॉपी करें।",
    note: "आपकी key इसी डिवाइस पर रहती है। अपना PIN और TOTP केवल Angel One के पेज पर डालें। PaperRally असली ऑर्डर नहीं दे सकता, यहाँ सभी ट्रेड वर्चुअल पैसे से होते हैं।",
    helpT: "कोई समस्या?", h1: "लॉगिन पेज पर त्रुटि: जाँचें कि Redirect URL अंतिम / सहित बिल्कुल वही है।", h2: "Connecting पर अटका है: key गलत हो सकती है। दूसरी key उपयोग करें चुनें।", h3: "कीमतें नहीं दिख रहीं: पहली बार लगभग 15 सेकंड प्रतीक्षा करें।",
  },
  kn: {
    title: "ನಿಮ್ಮ Angel One ಖಾತೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ", reconnectTitle: "Angel One ಮತ್ತೆ ಸಂಪರ್ಕಿಸಿ",
    reconnectSub: "Angel One ಲಾಗಿನ್ ಮಧ್ಯರಾತ್ರಿಗೆ ಮುಗಿಯುತ್ತದೆ. ಅಭ್ಯಾಸ ಮುಂದುವರಿಸಲು ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.",
    reconnect: "Angel One ಮತ್ತೆ ಸಂಪರ್ಕಿಸಿ", changeKey: "ಬೇರೆ key ಬಳಸಿ",
    intro: "ನಿಮ್ಮದೇ ಉಚಿತ SmartAPI key ಯಿಂದ PaperRally ತೆರೆಯುತ್ತದೆ. ಒಮ್ಮೆ ಸುಮಾರು 3 ನಿಮಿಷ ಬೇಕು.",
    step: (n) => `ಹಂತ ${n} / 4`, next: "ಮುಂದೆ", back: "ಹಿಂದೆ", copy: "ನಕಲಿಸಿ", copied: "ನಕಲಾಗಿದೆ",
    s1t: "SmartAPI ತೆರೆಯಿರಿ", s1: "Angel One ನ SmartAPI ಸೈಟ್ ಅನ್ನು ಹೊಸ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ತೆರೆದು ನಿಮ್ಮ Angel One client ID ಯಿಂದ ಲಾಗಿನ್ ಅಥವಾ ಸೈನ್ ಅಪ್ ಮಾಡಿ. ಈ ಪುಟವನ್ನು ತೆರೆದಿಡಿ.", s1b: "SmartAPI ತೆರೆಯಿರಿ",
    s2t: "ನಿಮ್ಮ ಆ್ಯಪ್ ರಚಿಸಿ", s2: "My Profile, ನಂತರ + ADD APP ಕ್ಲಿಕ್ ಮಾಡಿ, ಈ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ:",
    app: "App Name", redirect: "Redirect URL", ip: "Primary Static IP", ipFind: "ನನ್ನ IP ಹುಡುಕಿ", ipBusy: "ಹುಡುಕುತ್ತಿದೆ…",
    ipNote: "IP ಹುಡುಕಲು ipify.org ಅನ್ನು ಕೇಳಲಾಗುತ್ತದೆ. Post back ಮತ್ತು Secondary ಖಾಲಿ ಬಿಡಿ.", ipFail: "ಸಿಗಲಿಲ್ಲ. Google ನಲ್ಲಿ \"what is my IP\" ಹುಡುಕಿ.",
    s3t: "ನಿಮ್ಮ API key ನಕಲಿಸಿ", s3: "Add ಕ್ಲಿಕ್ ಮಾಡಿ. My Smart API & Apps ನಲ್ಲಿ API Key ಪಕ್ಕದ ಕಣ್ಣಿನ ಚಿಹ್ನೆ ಕ್ಲಿಕ್ ಮಾಡಿ ನಕಲಿಸಿ. Secret Key ನಕಲಿಸಬೇಡಿ.",
    s4t: "ನಿಮ್ಮ key ಅಂಟಿಸಿ ಸಂಪರ್ಕಿಸಿ", label: "SmartAPI key", connect: "Angel One ಸಂಪರ್ಕಿಸಿ",
    bad: "ಇದು SmartAPI key ಯಂತೆ ಕಾಣುತ್ತಿಲ್ಲ. SmartAPI ಸೈಟ್‌ನಿಂದ ಮತ್ತೆ ನಕಲಿಸಿ.",
    note: "ನಿಮ್ಮ key ಈ ಸಾಧನದಲ್ಲೇ ಇರುತ್ತದೆ. ನಿಮ್ಮ PIN ಮತ್ತು TOTP ಅನ್ನು Angel One ಪುಟದಲ್ಲಿ ಮಾತ್ರ ನಮೂದಿಸಿ. PaperRally ನಿಜವಾದ ಆರ್ಡರ್ ಮಾಡಲಾಗದು, ಇಲ್ಲಿನ ಎಲ್ಲ ವಹಿವಾಟುಗಳು ವರ್ಚುವಲ್ ಹಣದಿಂದ.",
    helpT: "ಸಮಸ್ಯೆ ಇದೆಯೇ?", h1: "ಲಾಗಿನ್ ಪುಟದಲ್ಲಿ ದೋಷ: Redirect URL ಕೊನೆಯ / ಸಹಿತ ಸರಿಯಾಗಿದೆಯೇ ಪರಿಶೀಲಿಸಿ.", h2: "Connecting ನಲ್ಲಿ ನಿಂತಿದೆ: key ತಪ್ಪಿರಬಹುದು. ಬೇರೆ key ಬಳಸಿ ಆಯ್ಕೆಮಾಡಿ.", h3: "ಬೆಲೆಗಳು ಕಾಣುತ್ತಿಲ್ಲ: ಮೊದಲ ಬಾರಿ ಸುಮಾರು 15 ಸೆಕೆಂಡು ಕಾಯಿರಿ.",
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

export function AngelSetup({ savedKey, error, onConnect, onForget, brand }) {
  const [lang, setLangState] = useState(() => { const l = loadLang(); return TEXT[l] ? l : "en"; });
  const t = TEXT[lang];
  const [step, setStep] = useState(1);
  const [key, setKey] = useState("");
  const [bad, setBad] = useState(false);
  const [ip, setIp] = useState("");
  const [ipState, setIpState] = useState("idle");
  const redirect = `${window.location.origin}/`;
  const appName = window.location.hostname.replace(/^www\./, "");
  const setLang = (l) => { setLangState(l); saveLang(l); };
  const findIp = async () => {
    setIpState("busy");
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      setIp((await r.json()).ip);
      setIpState("idle");
    } catch { setIpState("failed"); }
  };
  const submit = (e) => {
    e.preventDefault();
    const k = key.trim();
    if (!/^[A-Za-z0-9_-]{6,}$/.test(k)) return setBad(true);
    onConnect(k);
  };
  const langs = (
    <div className="setupLangs" role="group" aria-label="Language">
      {LANGS.map(([id, name]) => <button key={id} type="button" aria-pressed={lang === id} className={lang === id ? "setupLangOn" : ""} onClick={() => setLang(id)}>{name}</button>)}
    </div>
  );
  if (savedKey) {
    return (
      <div className="authCard angelCard">
        {brand}{langs}
        <h1>{t.reconnectTitle}</h1>
        <div className="authSub">{t.reconnectSub}</div>
        {error && <div className="authError" role="alert">{error}</div>}
        <button type="button" className="btn btnBull authSubmit" onClick={() => onConnect(savedKey)}>{t.reconnect}</button>
        <div className="dim angelNote">{t.note}</div>
        <button type="button" className="setupLink" onClick={onForget}>{t.changeKey}</button>
      </div>
    );
  }
  return (
    <form className="authCard angelCard" onSubmit={submit}>
      {brand}{langs}
      <h1>{t.title}</h1>
      <div className="authSub">{t.intro}</div>
      <div className="setupProgress" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step}><span style={{ width: `${step * 25}%` }} /></div>
      <div className="dim setupStepNo">{t.step(step)}</div>
      {step === 1 && (<>
        <h2>{t.s1t}</h2><p>{t.s1}</p>
        <a className="btn btnGhost setupOpen" href="https://smartapi.angelone.in/" target="_blank" rel="noopener noreferrer">{t.s1b}</a>
      </>)}
      {step === 2 && (<>
        <h2>{t.s2t}</h2><p>{t.s2}</p>
        <CopyRow label={t.app} value={appName} t={t} />
        <CopyRow label={t.redirect} value={redirect} t={t} />
        {ip ? <CopyRow label={t.ip} value={ip} t={t} /> : (
          <div className="setupRow">
            <div><span className="dim">{t.ip}</span></div>
            <button type="button" className="btn btnGhost" disabled={ipState === "busy"} onClick={findIp}>{ipState === "busy" ? t.ipBusy : t.ipFind}</button>
          </div>
        )}
        <div className="dim angelNote">{ipState === "failed" ? t.ipFail : t.ipNote}</div>
      </>)}
      {step === 3 && (<><h2>{t.s3t}</h2><p>{t.s3}</p></>)}
      {step === 4 && (<>
        <h2>{t.s4t}</h2>
        <label htmlFor="angelKey">{t.label}</label>
        <input id="angelKey" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); setBad(false); }} />
        {(bad || error) && <div className="authError" role="alert">{bad ? t.bad : error}</div>}
        <button type="submit" className="btn btnBull authSubmit">{t.connect}</button>
        <div className="dim angelNote">{t.note}</div>
        <details className="setupHelp"><summary>{t.helpT}</summary><ul><li>{t.h1}</li><li>{t.h2}</li><li>{t.h3}</li></ul></details>
      </>)}
      <div className="setupNav">
        {step > 1 && <button type="button" className="btn btnGhost" onClick={() => setStep(step - 1)}>{t.back}</button>}
        {step < 4 && <button type="button" className="btn btnBull" onClick={() => setStep(step + 1)}>{t.next}</button>}
      </div>
    </form>
  );
}
