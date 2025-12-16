import crypto from "crypto";
import { ethers } from "ethers";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const HD_SEED = process.env.HD_WALLET_SEED;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.warn("WARNING: ENCRYPTION_KEY must be exactly 32 characters for AES-256-GCM");
}

export interface EncryptedData {
  iv: string;
  encryptedData: string;
  authTag: string;
}

export function encryptPrivateKey(privateKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY),
    iv
  );

  let encrypted = cipher.update(privateKey, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  const result: EncryptedData = {
    iv: iv.toString("hex"),
    encryptedData: encrypted,
    authTag: authTag.toString("hex"),
  };

  return JSON.stringify(result);
}

export function decryptPrivateKey(encryptedString: string): string {
  const { iv, encryptedData, authTag }: EncryptedData = JSON.parse(encryptedString);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function isHdSeedConfigured(): boolean {
  return !!HD_SEED && HD_SEED.split(" ").length >= 12;
}

export function generateDepositAddress(derivationIndex: number): {
  address: string;
  privateKey: string;
} {
  if (!HD_SEED) {
    throw new Error("HD_WALLET_SEED is not configured. Cannot generate deposit addresses.");
  }

  const words = HD_SEED.split(" ");
  if (words.length < 12) {
    throw new Error("HD_WALLET_SEED must be a valid BIP39 mnemonic (12+ words).");
  }

  const hdNode = ethers.HDNodeWallet.fromPhrase(
    HD_SEED,
    undefined,
    `m/44'/60'/0'/0/${derivationIndex}`
  );

  return {
    address: hdNode.address,
    privateKey: hdNode.privateKey,
  };
}

export function verifyDepositAddressDerivation(derivationIndex: number, expectedAddress: string): boolean {
  if (!HD_SEED) {
    return false;
  }

  try {
    const hdNode = ethers.HDNodeWallet.fromPhrase(
      HD_SEED,
      undefined,
      `m/44'/60'/0'/0/${derivationIndex}`
    );
    return hdNode.address.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

export function isValidBep20Address(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

export function checksumAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch {
    throw new Error("Invalid address format");
  }
}

export const USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

export const BSC_CHAIN_ID = 56;
