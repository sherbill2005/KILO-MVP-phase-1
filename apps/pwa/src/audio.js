export function setupRecorder({
  voiceBtn,
  voiceStatus,
  onAudioBlob,
}) {
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  if (!voiceBtn) return;

  voiceBtn.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          if (voiceStatus) {
            voiceStatus.textContent = `Recorded ${Math.round(audioBlob.size / 1024)} KB`;
          }
          if (onAudioBlob) await onAudioBlob(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        voiceBtn.textContent = "Voice: On";
        if (voiceStatus) voiceStatus.textContent = "Recording...";
      } catch (err) {
        if (voiceStatus) voiceStatus.textContent = "Mic access denied.";
        alert(err.message);
      }
    } else {
      mediaRecorder.stop();
      isRecording = false;
      voiceBtn.textContent = "Voice: Off";
    }
  });
}

