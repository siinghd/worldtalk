// E2E Encryption using WebCrypto API

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyString: string;
}

// Generate ECDH key pair for key exchange
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyString = bufferToBase64(new Uint8Array(publicKeyBuffer));

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyString
  };
}

// Import a public key from base64 string
export async function importPublicKey(publicKeyString: string): Promise<CryptoKey> {
  const publicKeyBuffer = base64ToBuffer(publicKeyString);
  return crypto.subtle.importKey(
    'raw',
    publicKeyBuffer.buffer as ArrayBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    []
  );
}

// Derive shared secret from key pair
async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt message for a recipient
export async function encryptMessage(
  message: string,
  senderPrivateKey: CryptoKey,
  recipientPublicKeyString: string
): Promise<string> {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyString);
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientPublicKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedMessage = new TextEncoder().encode(message);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    sharedKey,
    encodedMessage
  );

  // Combine IV + encrypted data
  const encryptedArray = new Uint8Array(encryptedBuffer);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv);
  combined.set(encryptedArray, iv.length);

  return bufferToBase64(combined);
}

// Decrypt message from sender
export async function decryptMessage(
  encryptedData: string,
  recipientPrivateKey: CryptoKey,
  senderPublicKeyString: string
): Promise<string> {
  const senderPublicKey = await importPublicKey(senderPublicKeyString);
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderPublicKey);

  const combined = base64ToBuffer(encryptedData);
  const iv = combined.slice(0, 12);
  const encryptedBuffer = combined.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer
    },
    sharedKey,
    encryptedBuffer.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Generate fingerprint from public key
export function getKeyFingerprint(publicKeyString: string): string {
  let hash = 0;
  for (let i = 0; i < publicKeyString.length; i++) {
    const char = publicKeyString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

// Utility functions
function bufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
