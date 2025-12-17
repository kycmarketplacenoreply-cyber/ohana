import { ethers } from "ethers";
import { storage } from "../storage";
import { USDT_BEP20_CONTRACT, BSC_CHAIN_ID, decryptPrivateKey, isValidBep20Address } from "../utils/crypto";

const BSC_RPC_URL = process.env.BSC_RPC_URL!;
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS!;
const SWEEP_WALLET_ADDRESS = process.env.SWEEP_WALLET_ADDRESS || MASTER_WALLET_ADDRESS;
const ENCRYPTED_MASTER_KEY = process.env.ENCRYPTED_MASTER_WALLET_KEY;
const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY;

const BSC_RPC_FALLBACKS = [
  BSC_RPC_URL,
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
  "https://bsc-dataseed3.binance.org/",
  "https://bsc-dataseed4.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed2.defibit.io/",
].filter(Boolean);

let currentRpcIndex = 0;

if (!BSC_RPC_URL) {
  console.warn("WARNING: BSC_RPC_URL environment variable is not set");
}

if (!MASTER_WALLET_ADDRESS) {
  console.warn("WARNING: MASTER_WALLET_ADDRESS environment variable is not set");
}

if (SWEEP_WALLET_ADDRESS !== MASTER_WALLET_ADDRESS) {
  console.log("Sweep destination configured:", SWEEP_WALLET_ADDRESS);
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

let provider: ethers.JsonRpcProvider | null = null;
let masterWallet: ethers.Wallet | null = null;
let isWalletUnlocked = false;

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(BSC_RPC_FALLBACKS[currentRpcIndex] || BSC_RPC_URL, BSC_CHAIN_ID);
  }
  return provider;
}

function rotateRpc(): ethers.JsonRpcProvider {
  currentRpcIndex = (currentRpcIndex + 1) % BSC_RPC_FALLBACKS.length;
  provider = new ethers.JsonRpcProvider(BSC_RPC_FALLBACKS[currentRpcIndex], BSC_CHAIN_ID);
  console.log(`[RPC] Rotated to RPC ${currentRpcIndex}: ${BSC_RPC_FALLBACKS[currentRpcIndex]}`);
  return provider;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimited = error?.message?.includes("rate limit") || 
                            error?.code === -32005 ||
                            error?.info?.payload?.method === "eth_getLogs";
      
      if (isRateLimited) {
        rotateRpc();
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[RPC] Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
        await sleep(delay);
      } else if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

export function unlockMasterWallet(): boolean {
  try {
    if (ENCRYPTED_MASTER_KEY) {
      const decryptedKey = decryptPrivateKey(ENCRYPTED_MASTER_KEY);
      masterWallet = new ethers.Wallet(decryptedKey, getProvider());
    } else if (MASTER_WALLET_PRIVATE_KEY) {
      masterWallet = new ethers.Wallet(MASTER_WALLET_PRIVATE_KEY, getProvider());
    } else {
      console.error("Master wallet private key not configured");
      return false;
    }

    if (masterWallet.address.toLowerCase() !== MASTER_WALLET_ADDRESS.toLowerCase()) {
      console.error("Master wallet address mismatch! Aborting unlock.");
      masterWallet = null;
      return false;
    }

    isWalletUnlocked = true;
    console.log("Master wallet unlocked successfully for address:", MASTER_WALLET_ADDRESS);
    return true;
  } catch (error) {
    console.error("Failed to unlock master wallet:", error);
    masterWallet = null;
    isWalletUnlocked = false;
    return false;
  }
}

export function lockMasterWallet(): void {
  masterWallet = null;
  isWalletUnlocked = false;
  console.log("Master wallet locked");
}

export function isMasterWalletUnlocked(): boolean {
  return isWalletUnlocked && masterWallet !== null;
}

export async function restoreMasterWalletState(): Promise<void> {
  try {
    const controls = await storage.getPlatformWalletControls();
    if (controls?.walletUnlocked) {
      const success = unlockMasterWallet();
      if (success) {
        console.log("Master wallet state restored from database - unlocked");
      } else {
        console.log("Failed to restore master wallet unlock state");
      }
    } else {
      console.log("Master wallet state: locked (per database setting)");
    }
  } catch (error) {
    console.error("Failed to restore master wallet state:", error);
  }
}

export async function getMasterWalletBalance(): Promise<string> {
  try {
    const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, getProvider());
    const balance = await usdtContract.balanceOf(MASTER_WALLET_ADDRESS);
    return ethers.formatUnits(balance, 18);
  } catch (error) {
    console.error("Failed to get master wallet balance:", error);
    return "0";
  }
}

export async function getMasterWalletBnbBalance(): Promise<string> {
  try {
    const balance = await getProvider().getBalance(MASTER_WALLET_ADDRESS);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("Failed to get master wallet BNB balance:", error);
    return "0";
  }
}

export async function getAddressUsdtBalance(address: string): Promise<string> {
  try {
    const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, getProvider());
    const balance = await usdtContract.balanceOf(address);
    return ethers.formatUnits(balance, 18);
  } catch (error) {
    console.error("Failed to get USDT balance for address:", error);
    return "0";
  }
}

export async function getCurrentBlockNumber(): Promise<number> {
  try {
    return await getProvider().getBlockNumber();
  } catch (error) {
    console.error("Failed to get current block number:", error);
    return 0;
  }
}

const MIN_BNB_FOR_GAS = "0.005";
const GAS_FUNDING_AMOUNT = "0.0015";

export async function getAddressBnbBalance(address: string): Promise<string> {
  try {
    const balance = await getProvider().getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("Failed to get BNB balance for address:", error);
    return "0";
  }
}

export async function fundAddressWithGas(
  toAddress: string,
  amount: string = GAS_FUNDING_AMOUNT
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!isWalletUnlocked || !masterWallet) {
    return { success: false, error: "Master wallet is not unlocked. Admin must unlock the wallet first." };
  }

  if (!isValidBep20Address(toAddress)) {
    return { success: false, error: "Invalid destination address" };
  }

  try {
    const bnbBalance = await getProvider().getBalance(MASTER_WALLET_ADDRESS);
    const amountWei = ethers.parseEther(amount);
    const minRequired = amountWei + ethers.parseEther("0.001");
    
    if (bnbBalance < minRequired) {
      return { success: false, error: `Insufficient BNB in master wallet. Need at least ${ethers.formatEther(minRequired)} BNB.` };
    }

    const tx = await masterWallet.sendTransaction({
      to: toAddress,
      value: amountWei,
    });
    const receipt = await tx.wait();

    console.log(`Funded ${toAddress} with ${amount} BNB for gas (TX: ${receipt?.hash})`);

    return {
      success: true,
      txHash: receipt?.hash,
    };
  } catch (error: any) {
    console.error("Failed to fund address with gas:", error);
    return {
      success: false,
      error: error.message || "Gas funding failed",
    };
  }
}

export async function sendUsdtFromMasterWallet(
  toAddress: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!isWalletUnlocked || !masterWallet) {
    return { success: false, error: "Master wallet is not unlocked. Admin must unlock the wallet first." };
  }

  if (!isValidBep20Address(toAddress)) {
    return { success: false, error: "Invalid destination address" };
  }

  const controls = await storage.getPlatformWalletControls();
  if (controls?.emergencyMode) {
    return { success: false, error: "Platform is in emergency mode. All transactions are frozen." };
  }

  if (!controls?.withdrawalsEnabled) {
    return { success: false, error: "Withdrawals are currently disabled." };
  }

  try {
    const bnbBalance = await getProvider().getBalance(MASTER_WALLET_ADDRESS);
    const minBnbWei = ethers.parseEther(MIN_BNB_FOR_GAS);
    if (bnbBalance < minBnbWei) {
      return { success: false, error: `Insufficient BNB for gas. Need at least ${MIN_BNB_FOR_GAS} BNB.` };
    }

    const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, masterWallet);
    const amountWei = ethers.parseUnits(amount, 18);

    const balance = await usdtContract.balanceOf(MASTER_WALLET_ADDRESS);
    if (balance < amountWei) {
      return { success: false, error: "Insufficient USDT balance in master wallet" };
    }

    const tx = await usdtContract.transfer(toAddress, amountWei);
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("Failed to send USDT:", error);
    return {
      success: false,
      error: error.message || "Transaction failed",
    };
  }
}

export async function checkDepositConfirmations(
  txHash: string
): Promise<{ confirmations: number; isConfirmed: boolean; blockNumber: number }> {
  try {
    const receipt = await getProvider().getTransactionReceipt(txHash);
    if (!receipt) {
      return { confirmations: 0, isConfirmed: false, blockNumber: 0 };
    }

    const currentBlock = await getCurrentBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;
    const controls = await storage.getPlatformWalletControls();
    const requiredConfirmations = controls?.requiredConfirmations || 15;

    return {
      confirmations,
      isConfirmed: confirmations >= requiredConfirmations,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Failed to check deposit confirmations:", error);
    return { confirmations: 0, isConfirmed: false, blockNumber: 0 };
  }
}

async function monitorViaBscScanApi(
  address: string,
  fromBlock: number
): Promise<Array<{
  txHash: string;
  from: string;
  amount: string;
  blockNumber: number;
}>> {
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("BSCSCAN_API_KEY not configured");
  }

  const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_BEP20_CONTRACT}&address=${address}&startblock=${fromBlock}&endblock=999999999&sort=desc&apikey=${apiKey}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status !== "1" || !Array.isArray(data.result)) {
    if (data.message === "No transactions found") {
      return [];
    }
    throw new Error(data.message || "BSCScan API error");
  }

  return data.result
    .filter((tx: any) => tx.to.toLowerCase() === address.toLowerCase())
    .map((tx: any) => ({
      txHash: tx.hash,
      from: tx.from,
      amount: ethers.formatUnits(tx.value, parseInt(tx.tokenDecimal) || 18),
      blockNumber: parseInt(tx.blockNumber),
    }));
}

export async function monitorDepositAddress(
  address: string,
  fromBlock: number = 0
): Promise<Array<{
  txHash: string;
  from: string;
  amount: string;
  blockNumber: number;
}>> {
  const bscScanKey = process.env.BSCSCAN_API_KEY;
  const useBscScan = bscScanKey && bscScanKey.length > 10;
  
  console.log(`[DepositScanner] Checking address ${address.slice(0, 10)}... using BSCScan: ${useBscScan}`);
  
  if (useBscScan) {
    try {
      console.log("[DepositScanner] Using BSCScan API for deposit detection");
      const result = await monitorViaBscScanApi(address, fromBlock);
      console.log(`[DepositScanner] BSCScan found ${result.length} transfers`);
      return result;
    } catch (error: any) {
      console.error("[DepositScanner] BSCScan API failed, falling back to RPC:", error?.message || error);
    }
  }

  try {
    return await retryWithBackoff(async () => {
      const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, getProvider());

      const filter = usdtContract.filters.Transfer(null, address);
      const currentBlock = await getCurrentBlockNumber();
      const startBlock = fromBlock || currentBlock - 50;

      const events = await usdtContract.queryFilter(filter, startBlock, currentBlock);

      return events.map((event: any) => ({
        txHash: event.transactionHash,
        from: event.args[0],
        amount: ethers.formatUnits(event.args[2], 18),
        blockNumber: event.blockNumber,
      }));
    }, 5, 2000);
  } catch (error) {
    console.error("Failed to monitor deposit address after retries:", error);
    return [];
  }
}

const MIN_BNB_FOR_SWEEP = "0.000034";

export async function sweepDepositToMaster(
  depositAddressPrivateKey: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string; gasFundingTxHash?: string }> {
  const controls = await storage.getPlatformWalletControls();
  if (!controls?.sweepsEnabled) {
    return { success: false, error: "Sweeps are currently disabled" };
  }

  if (controls?.emergencyMode) {
    return { success: false, error: "Platform is in emergency mode" };
  }

  try {
    const decryptedKey = decryptPrivateKey(depositAddressPrivateKey);
    const depositWallet = new ethers.Wallet(decryptedKey, getProvider());
    const depositAddress = depositWallet.address;

    const bnbBalance = await getProvider().getBalance(depositAddress);
    const minBnbWei = ethers.parseEther(MIN_BNB_FOR_SWEEP);
    let gasFundingTxHash: string | undefined;

    if (bnbBalance < minBnbWei) {
      console.log(`[Sweep] Deposit address ${depositAddress} needs gas funding. Current BNB: ${ethers.formatEther(bnbBalance)}`);
      
      if (!isWalletUnlocked || !masterWallet) {
        return { success: false, error: "Master wallet must be unlocked to fund gas for sweeps" };
      }

      const fundResult = await fundAddressWithGas(depositAddress);
      if (!fundResult.success) {
        return { success: false, error: `Failed to fund gas: ${fundResult.error}` };
      }
      
      gasFundingTxHash = fundResult.txHash;
      console.log(`[Sweep] Funded ${depositAddress} with gas (TX: ${gasFundingTxHash})`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, depositWallet);
    const amountWei = ethers.parseUnits(amount, 18);

    const tx = await usdtContract.transfer(SWEEP_WALLET_ADDRESS, amountWei);
    const receipt = await tx.wait();

    console.log(`[Sweep] Swept ${amount} USDT from ${depositAddress} to ${SWEEP_WALLET_ADDRESS} (TX: ${receipt.hash})`);

    return {
      success: true,
      txHash: receipt.hash,
      gasFundingTxHash,
    };
  } catch (error: any) {
    console.error("Failed to sweep deposit:", error);
    return {
      success: false,
      error: error.message || "Sweep failed",
    };
  }
}

export { USDT_BEP20_CONTRACT, MASTER_WALLET_ADDRESS, SWEEP_WALLET_ADDRESS };
