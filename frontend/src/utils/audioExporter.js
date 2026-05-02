/**
 * Audio export utility adapted from the Crunker approach:
 * merge buffers with Web Audio API and export valid WAV binary.
 */
export class AudioExporter {
  constructor(sampleRate = 44100) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API не підтримується у цьому браузері');
    }

    this.sampleRate = sampleRate;
    this.audioContext = new AudioContextClass({ sampleRate });
  }

  async fetchAudio(input) {
    let arrayBuffer;

    if (input instanceof Blob || input instanceof File) {
      arrayBuffer = await input.arrayBuffer();
    } else {
      const response = await fetch(input);
      if (!response.ok) {
        throw new Error(`Не вдалося отримати аудіо: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type');
      if (contentType && !contentType.includes('audio/')) {
        console.warn(`Очікувався audio/* контент, отримано "${contentType}" (${input})`);
      }

      arrayBuffer = await response.arrayBuffer();
    }

    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  async fetchMultipleAudio(inputs) {
    return Promise.all(inputs.map((input) => this.fetchAudio(input)));
  }

  mergeAudio(buffers) {
    if (!buffers.length) {
      throw new Error('Немає доріжок для злиття');
    }

    const maxChannels = Math.max(...buffers.map((buffer) => buffer.numberOfChannels));
    const maxDuration = Math.max(...buffers.map((buffer) => buffer.duration));
    const outputLength = Math.ceil(this.sampleRate * maxDuration);
    const output = this.audioContext.createBuffer(maxChannels, outputLength, this.sampleRate);

    buffers.forEach((buffer) => {
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const outputData = output.getChannelData(channel);
        const inputData = buffer.getChannelData(channel);
        const channelLength = Math.min(outputData.length, inputData.length);

        for (let i = 0; i < channelLength; i += 1) {
          outputData[i] += inputData[i];
        }
      }
    });

    return output;
  }

  applyGain(buffer, gain = 1) {
    const normalizedGain = Number.isFinite(gain) ? gain : 1;
    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const outputData = output.getChannelData(channel);
      const inputData = buffer.getChannelData(channel);
      for (let i = 0; i < inputData.length; i += 1) {
        outputData[i] = inputData[i] * normalizedGain;
      }
    }

    return output;
  }

  interleave(buffer) {
    if (buffer.numberOfChannels === 1) {
      return buffer.getChannelData(0);
    }

    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i += 1) {
      channels.push(buffer.getChannelData(i));
    }

    const length = channels.reduce((sum, channelData) => sum + channelData.length, 0);
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;

    while (index < length) {
      channels.forEach((channelData) => {
        result[index] = channelData[inputIndex];
        index += 1;
      });
      inputIndex += 1;
    }

    return result;
  }

  writeString(dataview, offset, value) {
    for (let i = 0; i < value.length; i += 1) {
      dataview.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  floatTo16BitPCM(dataview, buffer, offset) {
    for (let i = 0; i < buffer.length; i += 1, offset += 2) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      dataview.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return dataview;
  }

  writeHeaders(buffer, channelCount, sampleRate) {
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const sampleSize = channelCount * bytesPerSample;
    const fileHeaderSize = 8;
    const chunkHeaderSize = 36;
    const chunkDataSize = buffer.length * bytesPerSample;
    const chunkTotalSize = chunkHeaderSize + chunkDataSize;

    const arrayBuffer = new ArrayBuffer(fileHeaderSize + chunkTotalSize);
    const view = new DataView(arrayBuffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, chunkTotalSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * sampleSize, true);
    view.setUint16(32, sampleSize, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, chunkDataSize, true);

    return this.floatTo16BitPCM(view, buffer, fileHeaderSize + chunkHeaderSize);
  }

  export(buffer, mimeType = 'audio/wav') {
    const interleaved = this.interleave(buffer);
    const dataview = this.writeHeaders(interleaved, buffer.numberOfChannels, buffer.sampleRate);
    const blob = new Blob([dataview], { type: mimeType });

    return {
      blob,
      url: URL.createObjectURL(blob),
    };
  }

  download(blob, filename = 'project') {
    const ext = blob.type && blob.type.includes('/')
      ? blob.type.split('/')[1].split(';')[0]
      : 'wav';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  close() {
    if (this.audioContext?.state !== 'closed') {
      return this.audioContext.close();
    }

    return Promise.resolve();
  }
}
