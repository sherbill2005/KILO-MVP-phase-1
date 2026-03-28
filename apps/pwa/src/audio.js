function createWorkletUrl() {
  const workletCode = `
    class Pcm16Processor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0] && inputs[0][0];
        if (!input || input.length === 0) return true;

        const targetRate = 16000;
        const ratio = sampleRate / targetRate;
        const outLength = Math.floor(input.length / ratio);
        const pcm = new Int16Array(outLength);

        let offset = 0;
        for (let i = 0; i < outLength; i++) {
          const start = Math.floor(i * ratio);
          const end = Math.min(Math.floor((i + 1) * ratio), input.length);
          let acc = 0;
          for (let j = start; j < end; j++) acc += input[j];
          const avg = acc / Math.max(1, end - start);
          const clamped = Math.max(-1, Math.min(1, avg));
          pcm[i] = clamped * 0x7fff;
        }

        this.port.postMessage({ type: "chunk", buffer: pcm.buffer }, [pcm.buffer]);
        return true;
      }
    }
    registerProcessor("pcm16-processor", Pcm16Processor);
  `;

  const blob = new Blob([workletCode], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export function setupRecorder({
  voiceBtn,
  voiceStatus,
  onPcmChunk,
  onStart,
  onStop,
}) {
  let isRecording = false;
  let audioCtx = null;
  let source = null;
  let workletNode = null;
  let stream = null;
  let workletUrl = null;

  if (!voiceBtn) return;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    workletUrl = createWorkletUrl();
    if (!audioCtx.audioWorklet || !audioCtx.audioWorklet.addModule) {
      throw new Error("AudioWorklet not supported in this browser.");
    }
    try {
      await audioCtx.audioWorklet.addModule(workletUrl);
      // DEBUG: confirm worklet module loaded (remove later)
      console.log("[DEBUG][AUDIO] worklet module loaded");
    } catch (err) {
      console.error("[DEBUG][AUDIO] worklet addModule failed:", err);
      throw err;
    }

    source = audioCtx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(audioCtx, "pcm16-processor");

    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    workletNode.port.onmessage = (event) => {
      const { type, buffer } = event.data || {};
      if (type !== "chunk") return;

      if (buffer && onPcmChunk) {
        onPcmChunk(buffer);
      }
    };

    source.connect(workletNode);
    workletNode.connect(gain);
    gain.connect(audioCtx.destination);

    isRecording = true;
    if (voiceBtn) voiceBtn.textContent = "Voice: On";
    if (voiceStatus) voiceStatus.textContent = "Listening...";
    if (onStart) onStart();
  }

  async function stop() {
    if (!isRecording) return;
    isRecording = false;

    if (voiceBtn) voiceBtn.textContent = "Voice: Off";
    if (voiceStatus) voiceStatus.textContent = "Processing...";

    if (workletNode) {
      workletNode.disconnect();
      workletNode.port.onmessage = null;
    }
    if (source) source.disconnect();
    if (audioCtx) await audioCtx.close();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    if (workletUrl) URL.revokeObjectURL(workletUrl);

    workletNode = null;
    source = null;
    audioCtx = null;
    stream = null;
    workletUrl = null;

    if (onStop) onStop();
  }

  voiceBtn.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        await start();
      } catch (err) {
        if (voiceStatus) voiceStatus.textContent = "Mic access denied.";
        alert(err.message);
      }
    } else {
      await stop();
    }
  });
}

export async function recordAudioSample(durationMs = 5000) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const chunks = [];

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const audioBuffer = await new Promise((resolve, reject) => {
    mediaRecorder.addEventListener("stop", async () => {
      try {
        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
        const buffer = await audioBlob.arrayBuffer();
        stream.getTracks().forEach((track) => track.stop());
        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });

    mediaRecorder.start();
    setTimeout(() => {
      mediaRecorder.stop();
    }, durationMs);
  });

  return audioBuffer;
}

function createWorkletUrl() {
  const workletCode = `
    class Pcm16Processor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0] && inputs[0][0];
        if (!input || input.length === 0) return true;

        const targetRate = 16000;
        const ratio = sampleRate / targetRate;
        const outLength = Math.floor(input.length / ratio);
        const pcm = new Int16Array(outLength);

        for (let i = 0; i < outLength; i++) {
          const start = Math.floor(i * ratio);
          const end = Math.min(Math.floor((i + 1) * ratio), input.length);

          let acc = 0;
          for (let j = start; j < end; j++) {
            acc += input[j];
          }

          const avg = acc / Math.max(1, end - start);
          const clamped = Math.max(-1, Math.min(1, avg));
          pcm[i] = clamped * 0x7fff;
        }

        this.port.postMessage(
          { type: "chunk", buffer: pcm.buffer },
          [pcm.buffer]
        );

        return true;
      }
    }

    registerProcessor("pcm16-processor", Pcm16Processor);
  `;

  const blob = new Blob([workletCode], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
