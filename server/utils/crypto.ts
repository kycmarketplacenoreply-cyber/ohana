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

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";
const BSCSCAN_API_URL = "https://api.bscscan.com/api";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;

export async function checkAddressHasTransactions(address: string): Promise<{ hasTransactions: boolean; error?: string }> {
  try {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    
    const txCount = await provider.getTransactionCount(address);
    if (txCount > 0) {
      console.log(`Address ${address} has ${txCount} native transactions - skipping`);
      return { hasTransactions: true };
    }
    
    const balance = await provider.getBalance(address);
    if (balance > BigInt(0)) {
      console.log(`Address ${address} has non-zero BNB balance - skipping`);
      return { hasTransactions: true };
    }

    if (!BSCSCAN_API_KEY) {
      console.error("BSCSCAN_API_KEY is not configured - cannot verify address cleanliness");
      return { hasTransactions: false, error: "BSCSCAN_API_KEY not configured" };
    }

    const bep20Response = await fetch(
      `${BSCSCAN_API_URL}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&apikey=${BSCSCAN_API_KEY}`
    );
    
    if (!bep20Response.ok) {
      console.error(`BscScan BEP20 API request failed: ${bep20Response.status}`);
      return { hasTransactions: false, error: "BscScan API request failed" };
    }
    
    const bep20Data = await bep20Response.json();
    if (bep20Data.message === "NOTOK") {
      console.error(`BscScan API error: ${bep20Data.result}`);
      return { hasTransactions: false, error: `BscScan API error: ${bep20Data.result}` };
    }
    if (bep20Data.status === "1" && Array.isArray(bep20Data.result) && bep20Data.result.length > 0) {
      console.log(`Address ${address} has BEP20 token transactions - skipping`);
      return { hasTransactions: true };
    }

    const internalTxResponse = await fetch(
      `${BSCSCAN_API_URL}?module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&apikey=${BSCSCAN_API_KEY}`
    );
    
    if (!internalTxResponse.ok) {
      console.error(`BscScan internal tx API request failed: ${internalTxResponse.status}`);
      return { hasTransactions: false, error: "BscScan API request failed" };
    }
    
    const internalData = await internalTxResponse.json();
    if (internalData.message === "NOTOK") {
      console.error(`BscScan API error: ${internalData.result}`);
      return { hasTransactions: false, error: `BscScan API error: ${internalData.result}` };
    }
    if (internalData.status === "1" && Array.isArray(internalData.result) && internalData.result.length > 0) {
      console.log(`Address ${address} has internal transactions - skipping`);
      return { hasTransactions: true };
    }

    const normalTxResponse = await fetch(
      `${BSCSCAN_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&apikey=${BSCSCAN_API_KEY}`
    );
    
    if (!normalTxResponse.ok) {
      console.error(`BscScan normal tx API request failed: ${normalTxResponse.status}`);
      return { hasTransactions: false, error: "BscScan API request failed" };
    }
    
    const normalData = await normalTxResponse.json();
    if (normalData.message === "NOTOK") {
      console.error(`BscScan API error: ${normalData.result}`);
      return { hasTransactions: false, error: `BscScan API error: ${normalData.result}` };
    }
    if (normalData.status === "1" && Array.isArray(normalData.result) && normalData.result.length > 0) {
      console.log(`Address ${address} has normal transactions from BscScan - skipping`);
      return { hasTransactions: true };
    }

    return { hasTransactions: false };
  } catch (error) {
    console.error(`Failed to check address ${address} for transactions:`, error);
    return { hasTransactions: false, error: `Exception: ${error}` };
  }
}
