import { storage } from "../storage";
import { monitorDepositAddress, checkDepositConfirmations, getCurrentBlockNumber, sweepDepositToMaster } from "./blockchain";
import { USDT_BEP20_CONTRACT } from "../utils/crypto";

let isScanning = false;
let lastScanBlock = 0;

export async function runDepositScanner(): Promise<void> {
  if (isScanning) {
    console.log("[DepositScanner] Already scanning, skipping...");
    return;
  }

  try {
    isScanning = true;
    
    const controls = await storage.getPlatformWalletControls();
    if (!controls?.depositsEnabled) {
      console.log("[DepositScanner] Deposits disabled, skipping scan");
      return;
    }

    if (controls?.emergencyMode) {
      console.log("[DepositScanner] Emergency mode active, skipping scan");
      return;
    }

    await scanForNewDeposits();
    await updatePendingDeposits();
    await creditConfirmedDeposits();
    await sweepCreditedDeposits();

  } catch (error) {
    console.error("[DepositScanner] Error during scan:", error);
  } finally {
    isScanning = false;
  }
}

async function scanForNewDeposits(): Promise<void> {
  const depositAddresses = await storage.getAllActiveDepositAddresses();
  
  if (depositAddresses.length === 0) {
    return;
  }

  const currentBlock = await getCurrentBlockNumber();
  if (currentBlock === 0) {
    console.error("[DepositScanner] Failed to get current block number");
    return;
  }

  const fromBlock = lastScanBlock > 0 ? lastScanBlock - 5 : currentBlock - 50;

  console.log(`[DepositScanner] Scanning ${depositAddresses.length} addresses from block ${fromBlock}`);

  let allSuccessful = true;
  
  for (const depositAddress of depositAddresses) {
    try {
      const transfers = await monitorDepositAddress(depositAddress.address, fromBlock);
      
      for (const transfer of transfers) {
        const existingDeposit = await storage.getBlockchainDepositByTxHash(transfer.txHash);
        if (existingDeposit) {
          continue;
        }

        const controls = await storage.getPlatformWalletControls();
        const requiredConfirmations = controls?.requiredConfirmations || 15;

        console.log(`[DepositScanner] New deposit detected: ${transfer.amount} USDT from ${transfer.from}`);

        await storage.createBlockchainDeposit({
          userId: depositAddress.userId,
          depositAddressId: depositAddress.id,
          txHash: transfer.txHash,
          fromAddress: transfer.from,
          toAddress: depositAddress.address,
          amount: transfer.amount,
          tokenContract: USDT_BEP20_CONTRACT,
          network: "BSC",
          blockNumber: transfer.blockNumber,
          confirmations: 0,
          requiredConfirmations,
          status: "pending",
          detectedAt: new Date(),
        });
      }
    } catch (error) {
      console.error(`[DepositScanner] Error scanning address ${depositAddress.address}:`, error);
      allSuccessful = false;
    }
  }

  if (allSuccessful) {
    lastScanBlock = currentBlock;
  }
}

async function updatePendingDeposits(): Promise<void> {
  const pendingDeposits = await storage.getPendingBlockchainDeposits();
  
  for (const deposit of pendingDeposits) {
    try {
      const { confirmations, isConfirmed, blockNumber } = await checkDepositConfirmations(deposit.txHash);
      
      if (confirmations > 0) {
        const newStatus = isConfirmed ? "confirmed" : "confirming";
        await storage.updateBlockchainDeposit(deposit.id, {
          confirmations,
          status: newStatus,
        });
        
        console.log(`[DepositScanner] Deposit ${deposit.id}: ${confirmations}/${deposit.requiredConfirmations} confirmations (${newStatus})`);
      }
    } catch (error) {
      console.error(`[DepositScanner] Error updating deposit ${deposit.id}:`, error);
    }
  }
}

async function creditConfirmedDeposits(): Promise<void> {
  const confirmedDeposits = await storage.getConfirmedUncreditedDeposits();
  const controls = await storage.getPlatformWalletControls();
  const minDepositAmount = controls ? parseFloat(controls.minDepositAmount) : 5;
  
  for (const deposit of confirmedDeposits) {
    try {
      const wallet = await storage.getWalletByUserId(deposit.userId);
      if (!wallet) {
        console.error(`[DepositScanner] No wallet found for user ${deposit.userId}`);
        continue;
      }

      const currentBalance = parseFloat(wallet.availableBalance);
      const depositAmount = parseFloat(deposit.amount);

      if (depositAmount < minDepositAmount) {
        console.log(`[DepositScanner] Deposit ${deposit.id}: ${depositAmount} USDT is below minimum (${minDepositAmount} USDT), not crediting to account`);
        await storage.updateBlockchainDeposit(deposit.id, {
          status: "credited",
          creditedAt: new Date(),
        });
        continue;
      }

      const newBalance = (currentBalance + depositAmount).toFixed(8);

      await storage.updateWalletBalance(wallet.id, newBalance, wallet.escrowBalance);

      const transaction = await storage.createTransaction({
        userId: deposit.userId,
        walletId: wallet.id,
        type: "deposit",
        amount: deposit.amount,
        currency: wallet.currency,
        description: `Blockchain deposit - TX: ${deposit.txHash.substring(0, 16)}...`,
      });

      await storage.updateBlockchainDeposit(deposit.id, {
        status: "credited",
        creditedAt: new Date(),
        creditedTransactionId: transaction.id,
      });

      console.log(`[DepositScanner] Credited ${deposit.amount} USDT to user ${deposit.userId}`);

    } catch (error) {
      console.error(`[DepositScanner] Error crediting deposit ${deposit.id}:`, error);
    }
  }
}

const MAX_SWEEP_ATTEMPTS = 5;

async function sweepCreditedDeposits(): Promise<void> {
  const controls = await storage.getPlatformWalletControls();
  if (!controls?.sweepsEnabled) {
    return;
  }

  const creditedDeposits = await storage.getCreditedUnsweptDeposits();
  
  for (const deposit of creditedDeposits) {
    try {
      const depositAddress = await storage.getUserDepositAddressById(deposit.depositAddressId);
      if (!depositAddress) {
        console.error(`[DepositScanner] No deposit address found for deposit ${deposit.id}`);
        continue;
      }

      const existingSweep = await storage.getDepositSweepByDepositId(deposit.id);
      const currentAttempts = existingSweep?.attempts || 0;
      
      if (currentAttempts >= MAX_SWEEP_ATTEMPTS) {
        console.log(`[DepositScanner] Deposit ${deposit.id} has reached max sweep attempts (${MAX_SWEEP_ATTEMPTS}). Skipping until manual intervention.`);
        await storage.updateBlockchainDeposit(deposit.id, {
          status: "sweep_failed",
        });
        continue;
      }

      await storage.updateBlockchainDeposit(deposit.id, {
        status: "sweep_pending",
      });

      console.log(`[DepositScanner] Attempting sweep for deposit ${deposit.id} (attempt ${currentAttempts + 1}/${MAX_SWEEP_ATTEMPTS})`);

      const result = await sweepDepositToMaster(
        depositAddress.encryptedPrivateKey,
        deposit.amount
      );

      if (result.success) {
        if (existingSweep) {
          await storage.updateDepositSweep(existingSweep.id, {
            txHash: result.txHash || null,
            status: "completed",
            completedAt: new Date(),
            attempts: currentAttempts + 1,
            lastAttemptAt: new Date(),
          });
        } else {
          const sweep = await storage.createDepositSweep({
            depositId: deposit.id,
            fromAddress: depositAddress.address,
            toAddress: process.env.SWEEP_WALLET_ADDRESS || process.env.MASTER_WALLET_ADDRESS || "",
            amount: deposit.amount,
            status: "completed",
          });
          await storage.updateDepositSweep(sweep.id, {
            txHash: result.txHash || null,
            completedAt: new Date(),
            attempts: 1,
            lastAttemptAt: new Date(),
          });
        }

        await storage.updateBlockchainDeposit(deposit.id, {
          status: "swept",
        });

        console.log(`[DepositScanner] Swept ${deposit.amount} USDT from ${depositAddress.address} to master wallet (TX: ${result.txHash})`);
      } else {
        if (existingSweep) {
          await storage.updateDepositSweep(existingSweep.id, {
            status: "failed",
            attempts: currentAttempts + 1,
            lastAttemptAt: new Date(),
            errorMessage: result.error || "Unknown error",
          });
        } else {
          const sweep = await storage.createDepositSweep({
            depositId: deposit.id,
            fromAddress: depositAddress.address,
            toAddress: process.env.SWEEP_WALLET_ADDRESS || process.env.MASTER_WALLET_ADDRESS || "",
            amount: deposit.amount,
            status: "failed",
          });
          await storage.updateDepositSweep(sweep.id, {
            attempts: 1,
            lastAttemptAt: new Date(),
            errorMessage: result.error || "Unknown error",
          });
        }

        await storage.updateBlockchainDeposit(deposit.id, {
          status: "credited",
        });

        console.error(`[DepositScanner] Failed to sweep deposit ${deposit.id} (attempt ${currentAttempts + 1}): ${result.error}`);
      }
    } catch (error: any) {
      console.error(`[DepositScanner] Error sweeping deposit ${deposit.id}:`, error);
      
      await storage.updateBlockchainDeposit(deposit.id, {
        status: "credited",
      });
    }
  }
}

export function startDepositScanner(intervalMs: number = 60000): NodeJS.Timeout {
  console.log(`[DepositScanner] Starting deposit scanner (interval: ${intervalMs}ms)`);
  
  runDepositScanner();
  
  return setInterval(() => {
    runDepositScanner();
  }, intervalMs);
}
