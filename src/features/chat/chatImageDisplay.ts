/** Keep active image formats out of exposed Blob URLs, including native "open image". */
export async function rasterizeChatImage(blob: Blob, signal: AbortSignal): Promise<Blob> {
  const source = URL.createObjectURL(blob);
  const image = new Image();
  const abort = () => {
    image.src = '';
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    image.src = source;
    // Off-DOM image decoding keeps SVG scripts inert. Never publish this source URL.
    await image.decode();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image display unavailable');
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Image display failed'))),
        'image/png'
      );
    });
  } finally {
    signal.removeEventListener('abort', abort);
    image.src = '';
    URL.revokeObjectURL(source);
  }
}
