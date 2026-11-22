ZURI.AI DESKTOP STARTER — SOREN.AI

INCLUDED
- index.html: the single-file ZURI.AI web application
- Electron wrapper files for desktop packaging

IMPORTANT API NOTE
The website's chat requires a working backend endpoint. Open ZURI.AI > API Settings
and enter the exact deployed HTTPS chat endpoint. The endpoint must accept POST JSON:
{ "messages": [{"role":"user","content":"..."}], "isVision": false, "image": null }
It must allow CORS from the website and return JSON with a reply field such as
{ "response": "Hello" } or { "answer": "Hello" }.
Keep Groq/provider API keys on the backend as environment secrets. Do not put them
inside index.html or a desktop app bundle.

BUILD DESKTOP APP (requires Node.js/npm and internet for dependencies)
1. Extract this folder.
2. Open a terminal in this folder.
3. Run: npm install
4. Test: npm start
5. Build Windows installer: npm run build:win
6. Build Linux packages: npm run build:linux
7. Build macOS packages: npm run build:mac

Build each operating-system installer on that operating system where practical.
The generated installers appear in the dist folder.

ANDROID / IOS
This desktop wrapper does not produce Android APK or iOS IPA files.
Android requires a separate Android Studio project and signing/build setup.
iOS requires a native iOS project and Apple's build/signing environment.
The single HTML file can also be hosted as a mobile-friendly web app.

SECURITY
No hidden admin backdoor or unrestricted cross-app control is included. Native
features must use clear permission prompts and narrow, user-approved actions.
