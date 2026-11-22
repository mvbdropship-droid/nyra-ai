const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');

// 1. Fix Mobile Sidebar Close Bug (Prevent blank box blocking screen) & Add Orb Glow States
h = h.replace(
  '.orb.compact{width:105px;margin:10px auto}',
  '.orb.compact{width:105px;margin:10px auto}.orb.listening{box-shadow:inset 0 0 60px #ffffff66,0 0 95px #ffffff88!important;transform:scale(1.06)}.orb.listening:after{animation-duration:2.2s!important;border-color:#fff!important}.orb.speaking{box-shadow:inset 0 0 70px #38bdf866,0 0 110px #38bdf899!important;animation:orbSpeak .6s ease-in-out infinite alternate!important}@keyframes orbSpeak{to{transform:scale(1.09)}}@media(max-width:760px){.sidebar.collapsed{transform:translateX(-110%)!important}}'
);

// 2. Fix 3-line button inside sidebar so it cleanly closes the mobile drawer
h = h.replace(
  "$('#collapse').onclick=()=>sidebar.classList.toggle('collapsed');",
  "$('#collapse').onclick=()=>{if(window.innerWidth<=760)sidebar.classList.remove('open');else sidebar.classList.toggle('collapsed');};"
);

// 3. Upgrade Orb Tap, Continuous "Hey Zuri" Wake-Word, Voice-Only Orb Mode & Barge-In Cut-Off
const voiceStartIdx = h.indexOf('function voiceStart(){');
const watchScreenIdx = h.indexOf('async function watchScreen(){');

if (voiceStartIdx > -1 && watchScreenIdx > -1) {
  const newVoiceEngine = `let voiceOnlyMode = false;
let wakeEnabled = true;

function setOrbState(state) {
  orb.classList.remove('listening', 'speaking');
  if (state === 'listening') orb.classList.add('listening');
  if (state === 'speaking') orb.classList.add('speaking');
}

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
      let heard = Array.from(e.results).map(r => r[0].transcript).join(' ').toLowerCase();
      if (heard.includes('hey zuri') || heard.includes('hi zuri') || heard.includes('zuri')) {
        try { recognition.abort(); } catch {}
        voiceOnlyMode = true;
        setOrbState('listening');
        toast('ZURI is listening…');
        let after = heard.split(/hey zuri|hi zuri|zuri/).pop().trim();
        if (after.length > 3 && e.results[e.results.length - 1].isFinal) {
          handleVoiceQuery(after);
        } else {
          setTimeout(() => voiceStart(true), 250);
        }
      }
    };
    recognition.onend = () => {
      if (wakeEnabled && !listening && !speaking) setTimeout(startContinuousWake, 400);
    };
    recognition.start();
  } catch {}
}

function voiceStart(stayOnOrb = true) {
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
    let text = e.results[0][0].transcript;
    if (e.results[0].isFinal && text.trim()) {
      listening = false;
      setOrbState('');
      handleVoiceQuery(text.trim());
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
  // Store silently in Past Chats without leaving the glowing Orb screen
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
    toast('Connection error: ' + (err?.message || 'Check internet'));
    if (wakeEnabled) setTimeout(startContinuousWake, 800);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
  if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
  listening = false;
  setOrbState('');
}

function speakMaybe(text, autoFollowUp = false) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let clean = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' code omitted ').replace(/<[^>]*>/g, '').trim();
  if (!clean) return;
  let u = new SpeechSynthesisUtterance(clean);
  u.onstart = () => {
    speaking = true;
    setOrbState('speaking');
    // Allow cutting ZURI off mid-sentence by speaking or tapping orb
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
      let spoken = e.results[0][0].transcript.trim();
      if (spoken.length > 1 && speaking) {
        barge.abort();
        stopSpeech();
        voiceStart(true);
      }
    };
    barge.start();
  } catch {}
}

window.addEventListener('load', () => setTimeout(startContinuousWake, 600));
`;
  h = h.slice(0, voiceStartIdx) + newVoiceEngine + h.slice(watchScreenIdx);
}

// 4. Add a 15s fast timeout + clean error fallback on apiCall so it never hangs on "ZURI is thinking..."
h = h.replace('const timeout=setTimeout(()=>controller.abort(),45000);', 'const timeout=setTimeout(()=>controller.abort(),15000);');

fs.writeFileSync('www/index.html', h);
console.log('Fixed Voice Orb Mode, Barge-in, Mobile Menu, and API Timeout!');
