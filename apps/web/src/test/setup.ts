/**
 * Vitest-ийн орчны бэлтгэл (jsdom).
 */

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

// jsdom-д `crypto.getRandomValues`/`subtle` байхгүй тохиолдолд Node-ийн
// webcrypto-г залгана (AES-GCM, санамсаргүй байт).
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

// jsdom-ийн Blob нь `arrayBuffer()` / `text()`-г хэрэгжүүлдэггүй тул нөхнө.
// (.docx үүсгэлт болон .xlsx унших тестүүд эдгээрийг ашиглана.)
type BlobPrototype = Blob & {
  arrayBuffer?: () => Promise<ArrayBuffer>;
  text?: () => Promise<string>;
};

const blobPrototype = Blob.prototype as BlobPrototype;

if (typeof blobPrototype.arrayBuffer !== 'function') {
  blobPrototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

if (typeof blobPrototype.text !== 'function') {
  blobPrototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
