/**
 * Voice Analyzer for Real Speaker Change Detection
 * Uses acoustic features (pitch, spectral centroid, energy) to detect speaker changes
 * Not keyword-based - purely acoustic analysis
 */

interface VoiceProfile {
  avgPitch: number;
  pitchStdDev: number;
  avgEnergy: number;
  spectralCentroid: number;
  timestamp: number;
}

interface SpeakerChangeEvent {
  timestamp: number;
  confidence: number;
  newSpeaker: number; // 0 for Patient, 1 for Doctor
  features: {
    pitch: number;
    energy: number;
    spectralCentroid: number;
  };
}

export class VoiceAnalyzer {
  private sampleRate: number;
  private pitchHistory: number[] = [];
  private energyHistory: number[] = [];
  private spectralHistory: number[] = [];
  private speakerProfiles: Map<number, VoiceProfile> = new Map();
  private currentSpeaker: number = 0;
  private speakerChangeThreshold: number = 0.7;
  private windowSize: number = 2048; // 2048 samples for FFT
  private analysisWindowSize: number = 50; // Keep last 50 frames for comparison

  constructor(sampleRate: number = 16000) {
    this.sampleRate = sampleRate;
    this.speakerProfiles.set(0, {
      avgPitch: 0,
      pitchStdDev: 0,
      avgEnergy: 0,
      spectralCentroid: 0,
      timestamp: Date.now(),
    });
    this.speakerProfiles.set(1, {
      avgPitch: 0,
      pitchStdDev: 0,
      avgEnergy: 0,
      spectralCentroid: 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Analyze audio frame for speaker change detection
   * Returns the detected speaker (0 or 1) and change event if detected
   */
  analyzeFrame(audioData: Float32Array): {
    speaker: number;
    changeEvent?: SpeakerChangeEvent;
  } {
    // Extract acoustic features from current frame
    const pitch = this.extractPitch(audioData);
    const energy = this.extractEnergy(audioData);
    const spectralCentroid = this.extractSpectralCentroid(audioData);

    // Keep history of features
    this.pitchHistory.push(pitch);
    this.energyHistory.push(energy);
    this.spectralHistory.push(spectralCentroid);

    // Keep only recent history
    if (this.pitchHistory.length > this.analysisWindowSize) {
      this.pitchHistory.shift();
      this.energyHistory.shift();
      this.spectralHistory.shift();
    }

    // Detect speaker change if we have enough history
    let changeEvent: SpeakerChangeEvent | undefined;
    if (this.pitchHistory.length > 10) {
      const { newSpeaker, confidence } = this.detectSpeakerChange(
        pitch,
        energy,
        spectralCentroid
      );

      if (newSpeaker !== this.currentSpeaker && confidence > this.speakerChangeThreshold) {
        this.currentSpeaker = newSpeaker;
        this.updateSpeakerProfile(newSpeaker, pitch, energy, spectralCentroid);

        changeEvent = {
          timestamp: Date.now(),
          confidence,
          newSpeaker,
          features: { pitch, energy, spectralCentroid },
        };
      }
    }

    return {
      speaker: this.currentSpeaker,
      changeEvent,
    };
  }

  /**
   * Extract fundamental frequency (pitch) using autocorrelation
   * Returns pitch in Hz, or 0 if unvoiced
   */
  private extractPitch(audioData: Float32Array): number {
    const maxLag = Math.floor(this.sampleRate / 80); // Minimum 80 Hz
    const minLag = Math.floor(this.sampleRate / 400); // Maximum 400 Hz
    
    let bestLag = 0;
    let bestCorrelation = 0;

    for (let lag = minLag; lag < maxLag; lag++) {
      let correlation = 0;
      for (let i = 0; i < audioData.length - lag; i++) {
        correlation += audioData[i] * audioData[i + lag];
      }
      correlation /= audioData.length;

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    // Only return pitch if correlation is strong (voiced sound)
    if (bestCorrelation > 0.1) {
      return this.sampleRate / bestLag;
    }
    return 0;
  }

  /**
   * Extract energy (RMS) from audio frame
   */
  private extractEnergy(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * Extract spectral centroid (brightness of sound)
   * Lower centroid = darker voice, Higher = brighter voice
   */
  private extractSpectralCentroid(audioData: Float32Array): number {
    // Apply Hann window
    const windowed = this.applyHannWindow(audioData);

    // Simple FFT or use power spectrum
    // For simplicity, we'll use energy in different frequency bands
    const bandEnergy = this.extractBandEnergy(windowed);

    // Calculate weighted average of band energies
    let numerator = 0;
    let denominator = 0;

    bandEnergy.forEach((energy, index) => {
      const freq = (index * this.sampleRate) / this.windowSize;
      numerator += freq * energy;
      denominator += energy;
    });

    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Apply Hann window to reduce spectral leakage
   */
  private applyHannWindow(audioData: Float32Array): Float32Array {
    const windowed = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (audioData.length - 1)));
      windowed[i] = audioData[i] * window;
    }
    return windowed;
  }

  /**
   * Extract energy in frequency bands
   */
  private extractBandEnergy(audioData: Float32Array): number[] {
    const numBands = 16;
    const bands = new Array(numBands).fill(0);

    // Simplified: use adjacent frame differences for frequency content
    // This is a rough approximation of FFT energy distribution
    for (let i = 0; i < audioData.length - 1; i++) {
      const diff = Math.abs(audioData[i + 1] - audioData[i]);
      const bandIndex = Math.floor((i / audioData.length) * numBands);
      if (bandIndex < numBands) {
        bands[bandIndex] += diff * diff;
      }
    }

    return bands.map((e) => Math.sqrt(e / audioData.length));
  }

  /**
   * Detect speaker change based on distance from known speaker profiles
   */
  private detectSpeakerChange(
    pitch: number,
    energy: number,
    spectralCentroid: number
  ): { newSpeaker: number; confidence: number } {
    const profile0 = this.speakerProfiles.get(0)!;
    const profile1 = this.speakerProfiles.get(1)!;

    // Calculate distance to each speaker profile
    const distance0 = this.calculateDistance(
      { pitch, energy, spectralCentroid },
      profile0
    );
    const distance1 = this.calculateDistance(
      { pitch, energy, spectralCentroid },
      profile1
    );

    // Determine which speaker is closer
    const newSpeaker = distance0 < distance1 ? 0 : 1;
    
    // Confidence is based on how much closer the new speaker is
    const maxDistance = Math.max(distance0, distance1);
    const minDistance = Math.min(distance0, distance1);
    const confidence = maxDistance > 0 ? minDistance / maxDistance : 0.5;

    return { newSpeaker, confidence };
  }

  /**
   * Calculate Euclidean distance between current features and a profile
   */
  private calculateDistance(
    features: { pitch: number; energy: number; spectralCentroid: number },
    profile: VoiceProfile
  ): number {
    // Normalize features for fair comparison
    const pitchDiff =
      profile.avgPitch > 0 ? Math.abs(features.pitch - profile.avgPitch) / profile.avgPitch : 0;
    const energyDiff = Math.abs(features.energy - profile.avgEnergy) / (profile.avgEnergy + 0.01);
    const spectralDiff =
      profile.spectralCentroid > 0
        ? Math.abs(features.spectralCentroid - profile.spectralCentroid) / profile.spectralCentroid
        : 0;

    // Weighted distance (pitch is most discriminative for speaker identification)
    return pitchDiff * 0.5 + energyDiff * 0.25 + spectralDiff * 0.25;
  }

  /**
   * Update speaker profile with new observations
   */
  private updateSpeakerProfile(
    speakerId: number,
    pitch: number,
    energy: number,
    spectralCentroid: number
  ): void {
    const profile = this.speakerProfiles.get(speakerId)!;

    // Simple exponential moving average update
    const alpha = 0.1; // Learning rate

    profile.avgPitch = profile.avgPitch * (1 - alpha) + pitch * alpha;
    profile.avgEnergy = profile.avgEnergy * (1 - alpha) + energy * alpha;
    profile.spectralCentroid =
      profile.spectralCentroid * (1 - alpha) + spectralCentroid * alpha;
    profile.timestamp = Date.now();

    // Calculate pitch variance for this speaker
    const recentPitches = this.pitchHistory.slice(-20);
    if (recentPitches.length > 0) {
      const meanPitch =
        recentPitches.reduce((a, b) => a + b, 0) / recentPitches.length;
      const variance =
        recentPitches.reduce((sum, p) => sum + Math.pow(p - meanPitch, 2), 0) /
        recentPitches.length;
      profile.pitchStdDev = Math.sqrt(variance);
    }
  }

  /**
   * Get current speaker profiles for debugging
   */
  getProfiles(): { [key: number]: VoiceProfile } {
    const result: { [key: number]: VoiceProfile } = {};
    this.speakerProfiles.forEach((profile, id) => {
      result[id] = { ...profile };
    });
    return result;
  }

  /**
   * Reset analyzer (e.g., for new recording session)
   */
  reset(): void {
    this.pitchHistory = [];
    this.energyHistory = [];
    this.spectralHistory = [];
    this.currentSpeaker = 0;
    this.speakerProfiles.forEach((profile) => {
      profile.avgPitch = 0;
      profile.pitchStdDev = 0;
      profile.avgEnergy = 0;
      profile.spectralCentroid = 0;
      profile.timestamp = Date.now();
    });
  }
}
