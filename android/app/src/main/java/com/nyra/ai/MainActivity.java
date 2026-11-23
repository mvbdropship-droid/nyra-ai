package com.nyra.ai;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private TextToSpeech tts;
    private SpeechRecognizer wakeRecognizer;
    private Intent recognizerIntent;
    private boolean isWakeListening = false;
    private boolean isSpeaking = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

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

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, 101);
        } else {
            initWakeWordListener();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 101 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            initWakeWordListener();
        }
    }

    private void initWakeWordListener() {
        mainHandler.post(() -> {
            if (!SpeechRecognizer.isRecognitionAvailable(this)) return;
            if (wakeRecognizer != null) wakeRecognizer.destroy();

            wakeRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

            wakeRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onPartialResults(Bundle partialResults) {
                    checkForWakeWord(partialResults);
                }

                @Override
                public void onResults(Bundle results) {
                    checkForWakeWord(results);
                    restartWakeListening(300);
                }

                @Override
                public void onError(int error) {
                    restartWakeListening(500);
                }

                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}
            });

            startWakeListening();
        });
    }

    private void checkForWakeWord(Bundle bundle) {
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null) return;
        for (String phrase : matches) {
            String lower = phrase.toLowerCase(Locale.ROOT);
            if (lower.contains("hey zuri") || lower.contains("hi zuri") || lower.equals("zuri")) {
                stopWakeListening();
                getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript("if(window.onZuriWakeWord) window.onZuriWakeWord();", null)
                );
                break;
            }
        }
    }

    private void startWakeListening() {
        if (wakeRecognizer != null && !isWakeListening && !isSpeaking) {
            isWakeListening = true;
            try {
                wakeRecognizer.startListening(recognizerIntent);
            } catch (Exception e) {
                isWakeListening = false;
            }
        }
    }

    private void stopWakeListening() {
        isWakeListening = false;
        if (wakeRecognizer != null) {
            try {
                wakeRecognizer.cancel();
            } catch (Exception ignored) {}
        }
    }

    private void restartWakeListening(long delayMs) {
        isWakeListening = false;
        mainHandler.postDelayed(this::startWakeListening, delayMs);
    }

    public class ZuriNativeBridge {
        @JavascriptInterface
        public void speak(String text) {
            if (tts != null && text != null && !text.isEmpty()) {
                isSpeaking = true;
                mainHandler.post(() -> stopWakeListening());
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ZURI_TTS");
                mainHandler.postDelayed(() -> {
                    isSpeaking = false;
                    startWakeListening();
                }, Math.max(1500, text.length() * 65L));
            }
        }

        @JavascriptInterface
        public void stopSpeak() {
            isSpeaking = false;
            if (tts != null) tts.stop();
            mainHandler.post(MainActivity.this::startWakeListening);
        }

        @JavascriptInterface
        public void resumeWakeWord() {
            isSpeaking = false;
            mainHandler.post(MainActivity.this::startWakeListening);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (wakeRecognizer != null) startWakeListening();
    }

    @Override
    protected void onPause() {
        stopWakeListening();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        stopWakeListening();
        if (wakeRecognizer != null) wakeRecognizer.destroy();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
