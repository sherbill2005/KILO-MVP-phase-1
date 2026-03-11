export function setupSpeech({
  voiceBtn,
  voiceStatus,
  transcriptEl,
  onFinalTranscript,
}) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let isListening = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = async (event) => {
      const lastResult = event.results[event.results.length - 1];
      const text = lastResult[0].transcript.trim();
      if (transcriptEl) transcriptEl.textContent = `Transcript: ${text}`;
      if (voiceStatus) {
        voiceStatus.textContent = lastResult.isFinal
          ? "Final transcript received"
          : "Listening...";
      }
      if (lastResult.isFinal && onFinalTranscript) {
        await onFinalTranscript(text);
      }
    };

    recognition.onerror = (event) => {
      if (voiceStatus) voiceStatus.textContent = `Error: ${event.error}`;
    };

    recognition.onend = () => {
      isListening = false;
      if (voiceBtn) voiceBtn.textContent = "Voice: Off";
    };
  } else if (voiceStatus) {
    voiceStatus.textContent = "Speech Recognition not supported in this browser.";
  }

  if (voiceBtn) {
    voiceBtn.addEventListener("click", async () => {
      if (!recognition) return;
      if (!isListening) {
        try {
          recognition.start();
          isListening = true;
          voiceBtn.textContent = "Voice: On";
          if (voiceStatus) voiceStatus.textContent = "Listening...";
        } catch (err) {
          alert(err.message);
        }
      } else {
        recognition.stop();
      }
    });
  }
}

