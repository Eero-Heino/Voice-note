import lamejs from 'lamejs';

export function encodeMP3(audioData) {
  const mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
  const mp3Data = [];

  const sampleBlockSize = 1152;
  for (let i = 0; i < audioData.length; i += sampleBlockSize) {
    const sampleChunk = audioData.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}
