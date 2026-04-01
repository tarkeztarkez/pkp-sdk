const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

ensureBase64Primitives();

function ensureBase64Primitives() {
  const globalScope = globalThis as {
    atob?: (input: string) => string;
    btoa?: (input: string) => string;
  };

  if (typeof globalScope.atob !== "function") {
    globalScope.atob = decodeBase64ToBinary;
  }

  if (typeof globalScope.btoa !== "function") {
    globalScope.btoa = encodeBinaryToBase64;
  }
}

function decodeBase64ToBinary(input: string) {
  const normalized = input.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0) {
    throw new Error("Invalid base64 input.");
  }

  let output = "";

  for (let index = 0; index < normalized.length; index += 4) {
    const chunk = normalized.slice(index, index + 4);
    const values = chunk.split("").map((char) => {
      if (char === "=") {
        return -1;
      }

      const value = BASE64_ALPHABET.indexOf(char);
      if (value === -1) {
        throw new Error("Invalid base64 input.");
      }

      return value;
    });

    const first = values[0];
    const second = values[1];
    const third = values[2];
    const fourth = values[3];

    if (first === undefined || second === undefined || first < 0 || second < 0) {
      throw new Error("Invalid base64 input.");
    }

    const byte1 = (first << 2) | (second >> 4);
    output += String.fromCharCode(byte1);

    if (third !== undefined && third >= 0) {
      const byte2 = ((second & 0x0f) << 4) | (third >> 2);
      output += String.fromCharCode(byte2);

      if (fourth !== undefined && fourth >= 0) {
        const byte3 = ((third & 0x03) << 6) | fourth;
        output += String.fromCharCode(byte3);
      }
    }
  }

  return output;
}

function encodeBinaryToBase64(input: string) {
  let output = "";

  for (let index = 0; index < input.length; index += 3) {
    const byte1 = input.charCodeAt(index) & 0xff;
    const hasByte2 = index + 1 < input.length;
    const hasByte3 = index + 2 < input.length;
    const byte2 = hasByte2 ? input.charCodeAt(index + 1) & 0xff : 0;
    const byte3 = hasByte3 ? input.charCodeAt(index + 2) & 0xff : 0;

    output += BASE64_ALPHABET[byte1 >> 2];
    output += BASE64_ALPHABET[((byte1 & 0x03) << 4) | (byte2 >> 4)];
    output += hasByte2 ? BASE64_ALPHABET[((byte2 & 0x0f) << 2) | (byte3 >> 6)] : "=";
    output += hasByte3 ? BASE64_ALPHABET[byte3 & 0x3f] : "=";
  }

  return output;
}
