const fs = require('fs');
const zlib = require('zlib');

// =========================================================
// PART 1: Generate Custom ZURI.AI "Z" App Icons (Zero Deps)
// =========================================================
function createZuriIconPng(size) {
  const width = size, height = size;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const cx = width / 2, cy = height / 2, r = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Deep obsidian background (#07070a)
      let R = 7, G = 7, B = 10, A = 255;

      // Subtle glowing silver orbital ring
      if (Math.abs(dist - r) < size * 0.022) {
        R = 210; G = 215; B = 225;
      } else if (dist < r) {
        const shade = Math.max(0, 1 - dist / r);
        R = Math.round(14 + shade * 26);
        G = Math.round(14 + shade * 28);
        B = Math.round(18 + shade * 34);
      }

      // Draw crisp metallic "Z" glyph in the center
      const nx = (x - cx) / (size * 0.22);
      const ny = (y - cy) / (size * 0.24);
      const inTopBar = ny >= -1.0 && ny <= -0.68 && nx >= -0.85 && nx <= 0.85;
      const inBotBar = ny >= 0.68 && ny <= 1.0 && nx >= -0.85 && nx <= 0.85;
      const inDiag = ny >= -0.75 && ny <= 0.75 && Math.abs(nx + ny * 0.85) <= 0.24;

      if (inTopBar || inBotBar || inDiag) {
        const grad = Math.round(255 - ((y / height) * 55));
        R = grad; G = grad; B = Math.min(255, grad + 8);
      }

      raw[px] = R; raw[px + 1] = G; raw[px + 2] = B; raw[px + 3] = A;
    }
  }

  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (~c) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const mipmaps = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
];

mipmaps.forEach(([folder, sz]) => {
  const dir = `android/app/src/main/res/${folder}`;
  if (fs.existsSync(dir)) {
    const png = createZuriIconPng(sz);
    fs.writeFileSync(`${dir}/ic_launcher.png`, png);
    fs.writeFileSync(`${dir}/ic_launcher_round.png`, png);
    fs.writeFileSync(`${dir}/ic_launcher_foreground.png`, png);
  }
});

// Replace adaptive icon XMLs so Android uses our crisp ZURI.AI PNG icon cleanly
const anydpiDir = 'android/app/src/main/res/mipmap-anydpi-v26';
if (fs.existsSync(anydpiDir)) {
  const iconXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://android.com">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>`;
  fs.writeFileSync(`${anydpiDir}/ic_launcher.xml`, iconXml);
  fs.writeFileSync(`${anydpiDir}/ic_launcher_round.xml`, iconXml);
}
const bgXml = 'android/app/src/main/res/values/ic_launcher_background.xml';
if (fs.existsSync(bgXml)) {
  fs.writeFileSync(bgXml, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#07070A</color>\n</resources>`);
}
if (fs.existsSync('android/app/src/main/res/drawable')) {
  fs.writeFileSync('android/app/src/main/res/drawable/splash.png', createZuriIconPng(512));
}
console.log('1. Custom ZURI.AI Home Screen Icon & Splash Logo generated!');

// =========================================================
// PART 2: Native Android TextToSpeech Bridge in MainActivity.java
// =========================================================
const mainActPath = 'android/app/src/main/java/com/nyra/ai/MainActivity.java';
if (fs.existsSync(mainActPath)) {
  const mainActCode = `package com.nyra.ai;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private TextToSpeech tts;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.US);
                tts.setSpeechRate(1.02f);
            }
        });
        WebView webView = getBridge().getWebView();
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new ZuriNativeBridge(), "ZuriNative");
    }

    public class ZuriNativeBridge {
        @JavascriptInterface
        public void speak(String text) {
            if (tts != null && text != null && !text.isEmpty()) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ZURI_TTS");
            }
        }

        @JavascriptInterface
        public void stopSpeak() {
            if (tts != null) {
                tts.stop();
            }
        }
    }

    @Override
    public void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
`;
  fs.writeFileSync(mainActPath, mainActCode);
  console.log('2. Native Android TextToSpeech (ZuriNative.speak) wired into MainActivity.java!');
}

// =========================================================
// PART 3: Patch www/index.html (Identity, Native TTS, Delete Chats, 5-sec Admin)
// =========================================================
let h = fs.readFileSync('www/index.html', 'utf8');

// 3A. Force ZURI.AI (by Soren.AI) Identity & Never Qwen
const zuriSystemPrompt = `You are ZURI (ZURI.AI), a witty, warm, futuristic voice and chat AI assistant designed and engineered by Soren.AI (Soren.AI is the parent company; ZURI.AI is the flagship AI assistant). NEVER say you are Qwen, Alibaba, Meta, OpenAI, or Llama. When asked who you are or who made you, proudly say you are ZURI.AI, designed and engineered by Soren.AI. Automatically detect the exact language the user speaks or writes in (English, Yoruba, Nigerian Pidgin, Hausa, Igbo, Chinese, French, Spanish, Arabic, etc.) and reply naturally in that exact same language.`;

if (!h.includes('NEVER say you are Qwen')) {
  h = h.replace(
    /const payload=\{messages:.*?isVision,image\};/,
    `const sysMsg={role:'system',content:${JSON.stringify(zuriSystemPrompt)}};const payload={messages:[sysMsg,...messages.map(m=>({role:m.role==='assistant'?'assistant':m.role,content:m.content}))],isVision,image};`
  );
}

// 3B. Add Delete Button to Every Past Chat Item
h = h.replace(
  /function renderHistory\(\)\{[\s\S]*?historyEl\.appendChild\(b\)\}\)/,
  `function renderHistory(){historyEl.innerHTML='';if(!threads.length){historyEl.innerHTML='<div class="histempty">No saved chats yet</div>';return}threads.forEach(t=>{let row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:4px';let b=document.createElement('button');b.className='histitem'+(t.id===currentId?' active':'');b.style.flex='1';b.textContent=t.title||'Untitled';b.onclick=()=>loadThread(t.id);let del=document.createElement('button');del.textContent='×';del.title='Delete chat';del.style.cssText='padding:4px 8px;opacity:.65;font-size:15px;border-radius:8px';del.onclick=(e)=>{e.stopPropagation();threads=threads.filter(x=>x.id!==t.id);localStorage.zuri_threads=JSON.stringify(threads);if(t.id===currentId){currentId=null;messages=[];chat.innerHTML='';hero.hidden=false;chat.hidden=true;}renderHistory();toast('Chat deleted');};row.appendChild(b);row.appendChild(del);historyEl.appendChild(row)})`
);

// 3C. Route stopSpeech() to Native Android TTS too
h = h.replace(
  'if (window.speechSynthesis) window.speechSynthesis.cancel();',
  'if (window.ZuriNative && window.ZuriNative.stopSpeak) window.ZuriNative.stopSpeak(); if (window.speechSynthesis) window.speechSynthesis.cancel();'
);

// 3D. Ensure Desktop Profile Circle & Owner Controls Tab Exist
if (!h.includes('ownerNavBtn')) {
  h = h.replace(
    '<span>About</span></button></nav>',
    '<span>About</span></button><button class="navbtn" id="ownerNavBtn" data-action="owner" hidden><svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z"/></svg><span>Owner Controls</span></button></nav>'
  );
  h = h.replace(
    "if(a==='about')about();",
    "if(a==='about')about();if(a==='owner')ownerDashboard();"
  );
}

// Verify JS syntax
const scriptMatch = h.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  new Function(scriptMatch[1]);
  console.log('3. VERIFIED: Zero JS syntax errors in www/index.html!');
}

fs.writeFileSync('www/index.html', h);
console.log('ALL DONE: ZURI.AI Logo, Native Voice TTS, Soren.AI Identity, Delete Chats & Admin Tab ready!');