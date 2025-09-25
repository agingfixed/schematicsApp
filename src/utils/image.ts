export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reader.abort();
      reject(new Error('Unable to read image file'));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected image data format'));
      }
    };
    reader.readAsDataURL(file);
  });

export const getImageDimensions = (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    image.src = src;
  });
