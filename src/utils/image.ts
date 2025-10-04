const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reader.abort();
      reject(new Error('Unable to read image data'));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected image data format'));
      }
    };
    reader.readAsDataURL(blob);
  });

export const readFileAsDataUrl = (file: File): Promise<string> => readBlobAsDataUrl(file);

export const fetchImageAsDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error('Failed to fetch image');
  }

  const blob = await response.blob();
  return readBlobAsDataUrl(blob);
};

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
