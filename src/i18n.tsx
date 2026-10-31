// @ts-nocheck
// Translations for the learning content (landing "Learn" sections, the in-app
// Learn tab) and the guided first trade. The rest of the UI stays in English.
// Hindi and Kannada are first drafts — have a native speaker review before
// promoting them heavily.

export const LANGS = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "kn", label: "ಕನ್ನಡ" },
];

const LS_LANG = "pr_lang";
export function loadLang() {
  try {
    const v = localStorage.getItem(LS_LANG);
    if (v && LANGS.some((l) => l.code === v)) return v;
  } catch { /* storage unavailable */ }
  return "en";
}
export function saveLang(code) {
  try { localStorage.setItem(LS_LANG, code); } catch { /* storage unavailable */ }
}

export const LEARN = {
  en: {
    learnTab: "Learn",
    howTitle: "From sign-up to first trade in three steps",
    howSteps: [
      { title: "Open a free account", desc: "A username and mobile number, or Google. You're in with ₹10,00,000 of practice money in about a minute." },
      { title: "Make your first trade", desc: "Buy a stock from the watchlist, or open NIFTY's options chain and pick a strike. Set the stop-loss before you click." },
      { title: "Review, then repeat", desc: "History records every exit and its realised P&L. Spot the habits that cost you, fix one, and trade again — or rerun a past day in Replay." },
    ],
    mistakesTitle: "Mistakes Are Part of Learning to Trade.",
    mistakesIntro: "They don't have to be expensive ones.",
    realLabel: "With real money",
    practiceLabel: "On PaperRally",
    mistakes: [
      { title: "Entering too early, or chasing a move", real: "With real money, a rushed entry costs you the moment you click buy.", practice: "In Replay, you can rehearse the same setup candle-by-candle against real past price action — as many times as it takes." },
      { title: "Ignoring the stop-loss", real: "One skipped stop-loss can undo weeks of careful, disciplined trades.", practice: "Practice placing and honoring stop and limit orders here first, until it's a habit rather than an afterthought." },
      { title: "Sizing a position too large", real: "An oversized trade turns a small misjudgment into a large loss.", practice: "₹10,00,000 in virtual capital lets you feel the real consequence of position sizing, without the real cost." },
    ],
    chartsTitle: "New to Reading Charts? Start Here.",
    chartsIntro: "A 60-second primer on candlesticks, plus where to learn more about the exchanges themselves.",
    candles: [
      { title: "Green candle = bullish", desc: "The close was higher than the open — buyers were in control during that period." },
      { title: "Red candle = bearish", desc: "The close was lower than the open — sellers pushed the price down during that period." },
      { title: "Wicks show the extremes", desc: "The thin lines above and below the body mark the highest and lowest price traded in that period — the body itself just shows open vs. close." },
      { title: "One candle = one timeframe", desc: "Switch between 1m, 5m, 15m, 1H, and 1D — each candle then represents that much time, from a minute to a full trading day." },
    ],
    firstTrade: {
      title: "Make your first practice trade",
      replayText: (day) => <>The market is closed right now, so you're trading a replay of <b>{day}</b> from the 9:15 AM open. Prices move exactly as they did that day, and you have <b>₹10,00,000</b> of practice money. Nothing here is real.</>,
      liveText: <>You have <b>₹10,00,000</b> of practice money. Nothing here is real — try a trade and see how it feels.</>,
      setup: "Set up: buy 10 Reliance shares",
      step2: <>Then press the glowing green <b>Buy</b> button.</>,
      step3: <>Watch your profit or loss move in the <b>Positions</b> tab.</>,
    },
  },

  hi: {
    learnTab: "सीखें",
    howTitle: "साइन-अप से पहले ट्रेड तक, सिर्फ़ तीन क़दम",
    howSteps: [
      { title: "मुफ़्त अकाउंट खोलें", desc: "यूज़रनेम और मोबाइल नंबर, या Google से। लगभग एक मिनट में ₹10,00,000 के प्रैक्टिस पैसे के साथ शुरू करें।" },
      { title: "अपना पहला ट्रेड करें", desc: "वॉचलिस्ट से कोई शेयर ख़रीदें, या NIFTY का ऑप्शन चेन खोलकर कोई स्ट्राइक चुनें। क्लिक करने से पहले स्टॉप-लॉस तय करें।" },
      { title: "समीक्षा करें, फिर दोहराएँ", desc: "हिस्ट्री में हर एग्ज़िट और उसका रियलाइज़्ड P&L दर्ज होता है। नुकसान वाली आदतें पहचानें, एक सुधारें और फिर ट्रेड करें — या Replay में कोई पुराना दिन दोबारा चलाएँ।" },
    ],
    mistakesTitle: "ग़लतियाँ ट्रेडिंग सीखने का हिस्सा हैं।",
    mistakesIntro: "बस वे महँगी नहीं होनी चाहिए।",
    realLabel: "असली पैसे के साथ",
    practiceLabel: "PaperRally पर",
    mistakes: [
      { title: "बहुत जल्दी एंट्री लेना, या भागते भाव के पीछे दौड़ना", real: "असली पैसे में, जल्दबाज़ी की एंट्री का नुकसान 'Buy' दबाते ही शुरू हो जाता है।", practice: "Replay में आप वही सेटअप असली पुराने भावों पर कैंडल-दर-कैंडल जितनी बार चाहें, दोहरा सकते हैं।" },
      { title: "स्टॉप-लॉस को नज़रअंदाज़ करना", real: "एक छूटा हुआ स्टॉप-लॉस हफ़्तों की अनुशासित ट्रेडिंग पर पानी फेर सकता है।", practice: "यहाँ पहले स्टॉप और लिमिट ऑर्डर लगाने और उनका पालन करने का अभ्यास करें, जब तक यह आदत न बन जाए।" },
      { title: "बहुत बड़ी पोज़िशन लेना", real: "ज़रूरत से बड़ा ट्रेड एक छोटी चूक को बड़े नुकसान में बदल देता है।", practice: "₹10,00,000 की वर्चुअल पूँजी से आप पोज़िशन साइज़ का असली असर महसूस करते हैं — असली क़ीमत चुकाए बिना।" },
    ],
    chartsTitle: "चार्ट पढ़ना नया है? यहाँ से शुरू करें।",
    chartsIntro: "कैंडलस्टिक की 60 सेकंड की बुनियादी जानकारी, और एक्सचेंजों के बारे में और जानने के लिंक।",
    candles: [
      { title: "हरी कैंडल = तेज़ी", desc: "क्लोज़ ओपन से ऊपर रहा — उस समय ख़रीदार हावी थे।" },
      { title: "लाल कैंडल = मंदी", desc: "क्लोज़ ओपन से नीचे रहा — उस समय बेचने वालों ने भाव नीचे धकेला।" },
      { title: "विक (बत्ती) चरम भाव दिखाती है", desc: "बॉडी के ऊपर-नीचे की पतली रेखाएँ उस समय के सबसे ऊँचे और सबसे नीचे भाव हैं — बॉडी सिर्फ़ ओपन और क्लोज़ दिखाती है।" },
      { title: "एक कैंडल = एक टाइमफ़्रेम", desc: "1m, 5m, 15m, 1H और 1D के बीच बदलें — हर कैंडल उतने समय को दिखाती है, एक मिनट से पूरे ट्रेडिंग दिन तक।" },
    ],
    firstTrade: {
      title: "अपना पहला प्रैक्टिस ट्रेड करें",
      replayText: (day) => <>अभी बाज़ार बंद है, इसलिए आप <b>{day}</b> का रीप्ले सुबह 9:15 से ट्रेड कर रहे हैं। भाव ठीक वैसे ही चलते हैं जैसे उस दिन चले थे, और आपके पास <b>₹10,00,000</b> का प्रैक्टिस पैसा है। यहाँ कुछ भी असली नहीं है।</>,
      liveText: <>आपके पास <b>₹10,00,000</b> का प्रैक्टिस पैसा है। यहाँ कुछ भी असली नहीं है — एक ट्रेड करके देखें।</>,
      setup: "सेट करें: Reliance के 10 शेयर ख़रीदें",
      step2: <>फिर चमकते हरे <b>Buy</b> बटन को दबाएँ।</>,
      step3: <><b>Positions</b> टैब में अपना मुनाफ़ा या नुकसान बदलते देखें।</>,
    },
  },

  kn: {
    learnTab: "ಕಲಿಯಿರಿ",
    howTitle: "ಸೈನ್-ಅಪ್‌ನಿಂದ ಮೊದಲ ಟ್ರೇಡ್‌ವರೆಗೆ ಕೇವಲ ಮೂರು ಹಂತಗಳು",
    howSteps: [
      { title: "ಉಚಿತ ಖಾತೆ ತೆರೆಯಿರಿ", desc: "ಬಳಕೆದಾರ ಹೆಸರು ಮತ್ತು ಮೊಬೈಲ್ ಸಂಖ್ಯೆ, ಅಥವಾ Google ಮೂಲಕ. ಸುಮಾರು ಒಂದು ನಿಮಿಷದಲ್ಲಿ ₹10,00,000 ಅಭ್ಯಾಸದ ಹಣದೊಂದಿಗೆ ಪ್ರಾರಂಭಿಸಿ." },
      { title: "ನಿಮ್ಮ ಮೊದಲ ಟ್ರೇಡ್ ಮಾಡಿ", desc: "ವಾಚ್‌ಲಿಸ್ಟ್‌ನಿಂದ ಒಂದು ಷೇರು ಖರೀದಿಸಿ, ಅಥವಾ NIFTY ಆಪ್ಷನ್ ಚೈನ್ ತೆರೆದು ಸ್ಟ್ರೈಕ್ ಆಯ್ಕೆಮಾಡಿ. ಕ್ಲಿಕ್ ಮಾಡುವ ಮೊದಲು ಸ್ಟಾಪ್-ಲಾಸ್ ಹೊಂದಿಸಿ." },
      { title: "ಪರಿಶೀಲಿಸಿ, ಮತ್ತೆ ಮಾಡಿ", desc: "ಹಿಸ್ಟರಿಯಲ್ಲಿ ಪ್ರತಿ ಎಕ್ಸಿಟ್ ಮತ್ತು ಅದರ ರಿಯಲೈಸ್ಡ್ P&L ದಾಖಲಾಗುತ್ತದೆ. ನಷ್ಟ ತರುವ ಅಭ್ಯಾಸಗಳನ್ನು ಗುರುತಿಸಿ, ಒಂದನ್ನು ಸರಿಪಡಿಸಿ, ಮತ್ತೆ ಟ್ರೇಡ್ ಮಾಡಿ — ಅಥವಾ Replay ನಲ್ಲಿ ಹಿಂದಿನ ದಿನವನ್ನು ಮತ್ತೆ ಓಡಿಸಿ." },
    ],
    mistakesTitle: "ತಪ್ಪುಗಳು ಟ್ರೇಡಿಂಗ್ ಕಲಿಕೆಯ ಭಾಗ.",
    mistakesIntro: "ಆದರೆ ಅವು ದುಬಾರಿಯಾಗಬೇಕಿಲ್ಲ.",
    realLabel: "ನಿಜವಾದ ಹಣದಲ್ಲಿ",
    practiceLabel: "PaperRally ನಲ್ಲಿ",
    mistakes: [
      { title: "ತುಂಬಾ ಬೇಗ ಪ್ರವೇಶಿಸುವುದು, ಅಥವಾ ಓಡುತ್ತಿರುವ ಬೆಲೆಯ ಹಿಂದೆ ಓಡುವುದು", real: "ನಿಜವಾದ ಹಣದಲ್ಲಿ, ಆತುರದ ಎಂಟ್ರಿಯ ನಷ್ಟ 'Buy' ಒತ್ತಿದ ಕ್ಷಣದಿಂದಲೇ ಶುರು.", practice: "Replay ನಲ್ಲಿ ಅದೇ ಸೆಟಪ್ ಅನ್ನು ನಿಜವಾದ ಹಳೆಯ ಬೆಲೆಗಳ ಮೇಲೆ ಕ್ಯಾಂಡಲ್-ಬೈ-ಕ್ಯಾಂಡಲ್ ಎಷ್ಟು ಬಾರಿ ಬೇಕಾದರೂ ಅಭ್ಯಾಸ ಮಾಡಬಹುದು." },
      { title: "ಸ್ಟಾಪ್-ಲಾಸ್ ಅನ್ನು ನಿರ್ಲಕ್ಷಿಸುವುದು", real: "ಒಂದು ತಪ್ಪಿದ ಸ್ಟಾಪ್-ಲಾಸ್ ವಾರಗಳ ಶಿಸ್ತಿನ ಟ್ರೇಡಿಂಗ್ ಅನ್ನು ಹಾಳುಮಾಡಬಹುದು.", practice: "ಅಭ್ಯಾಸವಾಗುವವರೆಗೆ ಇಲ್ಲಿ ಮೊದಲು ಸ್ಟಾಪ್ ಮತ್ತು ಲಿಮಿಟ್ ಆರ್ಡರ್‌ಗಳನ್ನು ಹಾಕಿ ಪಾಲಿಸುವುದನ್ನು ಅಭ್ಯಾಸ ಮಾಡಿ." },
      { title: "ತುಂಬಾ ದೊಡ್ಡ ಪೊಸಿಷನ್ ತೆಗೆದುಕೊಳ್ಳುವುದು", real: "ಅಗತ್ಯಕ್ಕಿಂತ ದೊಡ್ಡ ಟ್ರೇಡ್ ಸಣ್ಣ ತಪ್ಪನ್ನು ದೊಡ್ಡ ನಷ್ಟವಾಗಿ ಮಾಡುತ್ತದೆ.", practice: "₹10,00,000 ವರ್ಚುವಲ್ ಬಂಡವಾಳದಿಂದ ಪೊಸಿಷನ್ ಗಾತ್ರದ ನಿಜವಾದ ಪರಿಣಾಮವನ್ನು ಅನುಭವಿಸಿ — ನಿಜವಾದ ಬೆಲೆ ತೆರದೆ." },
    ],
    chartsTitle: "ಚಾರ್ಟ್ ಓದುವುದು ಹೊಸದೇ? ಇಲ್ಲಿಂದ ಪ್ರಾರಂಭಿಸಿ.",
    chartsIntro: "ಕ್ಯಾಂಡಲ್‌ಸ್ಟಿಕ್ ಬಗ್ಗೆ 60 ಸೆಕೆಂಡಿನ ಮೂಲ ಮಾಹಿತಿ, ಮತ್ತು ಎಕ್ಸ್‌ಚೇಂಜ್‌ಗಳ ಬಗ್ಗೆ ಇನ್ನಷ್ಟು ತಿಳಿಯಲು ಲಿಂಕ್‌ಗಳು.",
    candles: [
      { title: "ಹಸಿರು ಕ್ಯಾಂಡಲ್ = ಏರಿಕೆ", desc: "ಕ್ಲೋಸ್ ಓಪನ್‌ಗಿಂತ ಮೇಲಿತ್ತು — ಆ ಅವಧಿಯಲ್ಲಿ ಖರೀದಿದಾರರ ಕೈ ಮೇಲಾಗಿತ್ತು." },
      { title: "ಕೆಂಪು ಕ್ಯಾಂಡಲ್ = ಇಳಿಕೆ", desc: "ಕ್ಲೋಸ್ ಓಪನ್‌ಗಿಂತ ಕೆಳಗಿತ್ತು — ಆ ಅವಧಿಯಲ್ಲಿ ಮಾರಾಟಗಾರರು ಬೆಲೆಯನ್ನು ಕೆಳಕ್ಕೆ ತಳ್ಳಿದರು." },
      { title: "ವಿಕ್‌ಗಳು ತೀವ್ರ ಬೆಲೆಗಳನ್ನು ತೋರಿಸುತ್ತವೆ", desc: "ಬಾಡಿಯ ಮೇಲೆ ಮತ್ತು ಕೆಳಗಿನ ತೆಳು ಗೆರೆಗಳು ಆ ಅವಧಿಯ ಗರಿಷ್ಠ ಮತ್ತು ಕನಿಷ್ಠ ಬೆಲೆ — ಬಾಡಿ ಕೇವಲ ಓಪನ್ ಮತ್ತು ಕ್ಲೋಸ್ ತೋರಿಸುತ್ತದೆ." },
      { title: "ಒಂದು ಕ್ಯಾಂಡಲ್ = ಒಂದು ಟೈಮ್‌ಫ್ರೇಮ್", desc: "1m, 5m, 15m, 1H ಮತ್ತು 1D ನಡುವೆ ಬದಲಿಸಿ — ಪ್ರತಿ ಕ್ಯಾಂಡಲ್ ಅಷ್ಟು ಸಮಯವನ್ನು ಪ್ರತಿನಿಧಿಸುತ್ತದೆ, ಒಂದು ನಿಮಿಷದಿಂದ ಪೂರ್ಣ ಟ್ರೇಡಿಂಗ್ ದಿನದವರೆಗೆ." },
    ],
    firstTrade: {
      title: "ನಿಮ್ಮ ಮೊದಲ ಅಭ್ಯಾಸ ಟ್ರೇಡ್ ಮಾಡಿ",
      replayText: (day) => <>ಈಗ ಮಾರುಕಟ್ಟೆ ಮುಚ್ಚಿದೆ, ಹಾಗಾಗಿ ನೀವು <b>{day}</b> ರ ರೀಪ್ಲೇಯನ್ನು ಬೆಳಿಗ್ಗೆ 9:15 ರಿಂದ ಟ್ರೇಡ್ ಮಾಡುತ್ತಿದ್ದೀರಿ. ಬೆಲೆಗಳು ಆ ದಿನ ಚಲಿಸಿದಂತೆಯೇ ಚಲಿಸುತ್ತವೆ, ಮತ್ತು ನಿಮ್ಮ ಬಳಿ <b>₹10,00,000</b> ಅಭ್ಯಾಸದ ಹಣವಿದೆ. ಇಲ್ಲಿ ಯಾವುದೂ ನಿಜವಲ್ಲ.</>,
      liveText: <>ನಿಮ್ಮ ಬಳಿ <b>₹10,00,000</b> ಅಭ್ಯಾಸದ ಹಣವಿದೆ. ಇಲ್ಲಿ ಯಾವುದೂ ನಿಜವಲ್ಲ — ಒಂದು ಟ್ರೇಡ್ ಮಾಡಿ ನೋಡಿ.</>,
      setup: "ಸಿದ್ಧಪಡಿಸಿ: Reliance ನ 10 ಷೇರು ಖರೀದಿ",
      step2: <>ನಂತರ ಹೊಳೆಯುವ ಹಸಿರು <b>Buy</b> ಬಟನ್ ಒತ್ತಿ.</>,
      step3: <><b>Positions</b> ಟ್ಯಾಬ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಲಾಭ ಅಥವಾ ನಷ್ಟ ಬದಲಾಗುವುದನ್ನು ನೋಡಿ.</>,
    },
  },
};

export function LangSwitch({ lang, onChange, className = "" }) {
  return (
    <div className={`langSwitch ${className}`} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`langBtn ${lang === l.code ? "langBtnActive" : ""}`}
          aria-pressed={lang === l.code}
          onClick={() => onChange(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
