class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
  }

  process (inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      // Copy input channel data to a transferable Float32Array
      const channelData = input[0];
      // Post message a copy so we don't hold onto the underlying memory
      this.port.postMessage(channelData.slice(0));
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
