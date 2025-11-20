export const cancelSpeech = () => {
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (synth?.speaking) {
      synth.cancel();
    }
  } catch {
    // Ignore platform errors
  }
};

export const pickColor = async (): Promise<string> => {
  try {
    const EyeDropperCtor = (window as any)?.EyeDropper;
    if (!EyeDropperCtor) return '';

    // Some environments may not have proper typings for EyeDropper
    // eslint-disable-next-line new-cap
    const eyeDropper = new EyeDropperCtor();
    const { sRGBHex } = await eyeDropper.open();
    return sRGBHex as string;
  } catch {
    // User cancelled or EyeDropper failed
    return '';
  }
};
