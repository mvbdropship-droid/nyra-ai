const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Ensure API points to your real Cloudflare Worker URL
const workerUrl = ['https:', '', 'nyra-api.itsprincemvb.workers.dev'].join('/');
h = h.replace(/let API=.*?;/, `let API=localStorage.zuri_api_url||'${workerUrl}';`);

// 2. Fix Mobile Sidebar Close & Light Mode CSS cleanly
const extraCss = `
.deskhead{display:flex;justify-content:flex-end;align-items:center;padding:14px 22px 0;z-index:5}
@media(max-width:760px){.deskhead{display:none}.sidebar.collapsed{transform:translateX(-110%)!important}}
.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}
.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}
.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}
@keyframes orbSpeak{to{transform:scale(1.09)}}
body.light .wave{border-color:#00000022;background:linear-gradient(135deg,#0000000a,#00000000 45%,#0000000a)}
body.light .brandZ{text-shadow:0 0 12px #00000025}
body.light .orb{background:radial-gradient(circle at 30% 25%,#ffffff,#e5e5ea 45%,#c7c7d1 85%,#aeaeb8);border-color:#00000033;box-shadow:inset 0 0 30px #00000018,0 12px 40px #00000022}
body.light .orb:before{border-color:#00000033}
body.light .orb:after{border-color:#00000066}
body.light .orb .z{background:linear-gradient(145deg,#111,#555 40%,#000 70%,#444);background-clip:text;color:transparent;filter:drop-shadow(0 2px 10px #00000030)}
body.light .dot{background:radial-gradient(circle at 30% 25%,#444,#111);box-shadow:0 0 15px #00000044}
body.light .inputpill{border-color:#00000033;background:#ffffffcc;box-shadow:0 8px 30px #00000012}
body.light .send{background:#151519;color:#fff}
</style>`;
if (!h.includes('.orb.listening')) {
  h = h.replace('</style>', extraCss);
}

// 3. Replace broken voice block between voiceStart and watchScreen with clean, verified JS
const vStart = h.indexOf('let voiceOnlyMode');
const vStartAlt = h.indexOf('function voiceStart');
const startIdx = vStart > -1 ? vStart : vStartAlt;
const endIdx = h.indexOf('async function watchScreen');

if (startIdx > -1 && endIdx > -1) {
  const cleanVoice = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

$('#collapse').onclick = () => {
  if (window.innerWidth <= 760) sidebar.classList.remove('open');
  else sidebar.classList.toggle('collapsed');
};

$('#orb').onclick = () => {
  if (speaking) {
    stopSpeech();
    voiceOnlyMode = true;
    voiceStart(true);
    return;
  }
  if (listening) {
    stopSpeech();
    toast('Voice paused');
    return;
  }
  voiceOnlyMode = true;
  voiceStart(true);
};

function startContinuousWake() {
  let SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !wakeEnabled || listening || speaking) return;
  try {
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let heard = Array.from(e.results).map(r => r.transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch (err) {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening...');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        let lastRes = e.results[e.results.length - 1];
        if (after.length > 3 && lastRes && lastRes.isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 450);
    };
    recognition.start();
  } catch (err) {}
}

function voiceStart(stayOnOrb) {
  if (stayOnOrb === undefined) stayOnOrb = true;
  let SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Speech recognition not supported here'); return; }
  stopSpeech();
  voiceOnlyMode = stayOnOrb;
  recognition = new SR();
  recognition.lang = '';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onstart = () => {
    listening = true;
    setOrbState('listening');
    toast('Listening — speak now');
  };
  recognition.onresult = (e) => {
    let last = e.results[e.results.length - 1];
    if (last && last.isFinal && last[0].transcript.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(last[0].transcript.trim());
    }
  };
  recognition.onerror = () => {
    listening = false;
    setOrbState('');
    if (wakeEnabled) setTimeout(startContinuousWake, 500);
  };
  recognition.onend = () => {
    listening = false;
    if (!speaking) setOrbState('');
  };
  recognition.start();
}

async function handleVoiceQuery(text) {
  messages.push({ role: 'user', content: text });
  saveThread();
  setOrbState('listening');
  try {
    let answer = await apiCall(text);
    messages.push({ role: 'assistant', content: answer });
    saveThread();
    if (!voiceOnlyMode) {
      startChat();
      renderMessage({ role: 'user', content: text });
      renderMessage({ role: 'assistant', content: answer });
    }
    speakMaybe(answer, true);
  } catch (err) {
    setOrbState('');
    toast('Error: ' + (err && err.message ? err.message : 'Check connection'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch (err) {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    startBargeInDetector();
  };
  u.onend = () => {
    speaking = false;
    setOrbState('');
    if (autoFollowUp && voiceOnlyMode) {
      setTimeout(() => voiceStart(true), 300);
    } else if (wakeEnabled) {
      setTimeout(startContinuousWake, 400);
    }
  };
  speechSynthesis.speak(u);
}

function startBargeInDetector() {
  let SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !speaking) return;
  try {
    let barge = new SR();
    barge.lang = 'en-US';
    barge.interimResults = true;
    barge.onresult = (e) => {
      let last = e.results[e.results.length - 1];
      let spoken = last ? last[0].transcript.trim() : '';
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch (err) {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, startIdx) + cleanVoice + h.slice(endIdx);
}

// Verify JavaScript syntax before writing!
const scriptMatch = h.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  new Function(scriptMatch[1]);
  console.log('VERIFIED: Zero JavaScript syntax errors!');
}

fs.writeFileSync('www/index.html', h);
console.log('SUCCESS: www/index.html repaired and saved!');
