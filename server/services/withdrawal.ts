import { storage } from "../storage";
import { sendUsdtFromMasterWallet, isMasterWalletUnlocked, getMasterWalletBalance } from "./blockchain";
import { isValidBep20Address, checksumAddress } from "../utils/crypto";

export interface WithdrawalValidation {
  valid: boolean;
  error?: string;
  delayMinutes?: number;
  delayReason?: string;
}

export async function validateWithdrawalRequest(
  userId: string,
  amount: string,
  destinationAddress: string
): Promise<WithdrawalValidation> {
  const controls = await storage.getPlatformWalletControls();
  if (!controls) {
    return { valid: false, error: "Platform wallet controls not initialized" };
  }

  if (!controls.withdrawalsEnabled) {
    return { valid: false, error: "Withdrawals are currently disabled" };
  }

  if (controls.emergencyMode) {
    return { valid: false, error: "Platform is in emergency mode. Withdrawals are frozen." };
  }

  if (!controls.walletUnlocked) {
    return { valid: false, error: "Master wallet is not unlocked. Please contact support." };
  }

  if (!isValidBep20Address(destinationAddress)) {
    return { valid: false, error: "Invalid BEP20 wallet address" };
  }

  const amountNum = parseFloat(amount);
  const minWithdrawal = parseFloat(controls.minWithdrawalAmount);
  if (amountNum < minWithdrawal) {
    return { valid: false, error: `Minimum withdrawal is ${minWithdrawal} USDT` };
  }

  const wallet = await storage.getWalletByUserId(userId);
  if (!wallet) {
    return { valid: false, error: "Wallet not found" };
  }

  const fee = calculateWithdrawalFee(amount, controls.withdrawalFeePercent, controls.withdrawalFeeFixed);
  const totalAmount = amountNum + fee;
  const availableBalance = parseFloat(wallet.availableBalance);

  if (totalAmount > availableBalance) {
    return { valid: false, error: `Insufficient balance. You need ${totalAmount.toFixed(4)} USDT (including ${fee.toFixed(4)} USDT fee)` };
  }

  const today = new Date().toISOString().split("T")[0];
  const userLimit = await storage.getOrCreateUserWithdrawalLimit(userId, today);
  const userDailyTotal = parseFloat(userLimit.totalWithdrawn) + amountNum;
  const perUserLimit = parseFloat(controls.perUserDailyWithdrawalLimit);

  if (userDailyTotal > perUserLimit) {
    return { valid: false, error: `Daily withdrawal limit exceeded. Limit: ${perUserLimit} USDT` };
  }

  const platformTotal = await storage.getTodayPlatformWithdrawalTotal();
  const platformDailyTotal = parseFloat(platformTotal) + amountNum;
  const platformLimit = parseFloat(controls.platformDailyWithdrawalLimit);

  if (platformDailyTotal > platformLimit) {
    return { valid: false, error: "Platform daily withdrawal limit reached. Please try again tomorrow." };
  }

  const masterBalance = await getMasterWalletBalance();
  if (parseFloat(masterBalance) < amountNum) {
    return { valid: false, error: "Insufficient hot wallet balance. Please contact support." };
  }

  let delayMinutes = 0;
  let delayReason = "";

  const firstWithdrawal = await storage.getOrCreateUserFirstWithdrawal(userId);
  if (!firstWithdrawal.hasWithdrawn) {
    delayMinutes = controls.firstWithdrawalDelayMinutes;
    delayReason = "First withdrawal requires a security delay";
  }

  const largeThreshold = parseFloat(controls.largeWithdrawalThreshold);
  if (amountNum >= largeThreshold && controls.largeWithdrawalDelayMinutes > delayMinutes) {
    delayMinutes = controls.largeWithdrawalDelayMinutes;
    delayReason = `Large withdrawals (≥${largeThreshold} USDT) require additional review`;
  }

  if (firstWithdrawal.lastPasswordChangeAt) {
    const passwordChangeTime = new Date(firstWithdrawal.lastPasswordChangeAt).getTime();
    const hoursSinceChange = (Date.now() - passwordChangeTime) / (1000 * 60 * 60);
    if (hoursSinceChange < 24) {
      const remainingHours = Math.ceil(24 - hoursSinceChange);
      return { valid: false, error: `Withdrawals are locked for ${remainingHours} hours after password change` };
    }
  }

  return {
    valid: true,
    delayMinutes: delayMinutes > 0 ? delayMinutes : undefined,
    delayReason: delayReason || undefined,
  };
}

export function calculateWithdrawalFee(
  amount: string,
  feePercent: string,
  feeFixed: string
): number {
  const amountNum = parseFloat(amount);
  const percentFee = amountNum * (parseFloat(feePercent) / 100);
  const fixedFee = parseFloat(feeFixed);
  return percentFee + fixedFee;
}

export async function processApprovedWithdrawal(
  withdrawalId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const withdrawal = await storage.getWithdrawalRequest(withdrawalId);
  if (!withdrawal) {
    return { success: false, error: "Withdrawal request not found" };
  }

  if (withdrawal.status !== "approved") {
    return { success: false, error: "Withdrawal is not in approved status" };
  }

  if (!isMasterWalletUnlocked()) {
    return { success: false, error: "Master wallet is not unlocked" };
  }

  const controls = await storage.getPlatformWalletControls();
  if (!controls?.withdrawalsEnabled) {
    return { success: false, error: "Withdrawals are disabled" };
  }

  if (controls.emergencyMode) {
    return { success: false, error: "Platform is in emergency mode" };
  }

  await storage.updateWithdrawalRequest(withdrawalId, { status: "processing" });

  try {
    const checksummedAddress = checksumAddress(withdrawal.walletAddress!);
    const result = await sendUsdtFromMasterWallet(checksummedAddress, withdrawal.amount);

    if (result.success && result.txHash) {
      await storage.updateWithdrawalRequest(withdrawalId, {
        status: "sent",
        txHash: result.txHash,
      });

      return { success: true, txHash: result.txHash };
    } else {
      await storage.updateWithdrawalRequest(withdrawalId, {
        status: "failed",
        adminNotes: result.error || "Transaction failed",
      });
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    await storage.updateWithdrawalRequest(withdrawalId, {
      status: "failed",
      adminNotes: error.message,
    });
    return { success: false, error: error.message };
  }
}

export async function createWithdrawalRequest(
  userId: string,
  amount: string,
  destinationAddress: string
): Promise<{ success: boolean; withdrawalId?: string; error?: string; delayMinutes?: number; delayReason?: string }> {
  const validation = await validateWithdrawalRequest(userId, amount, destinationAddress);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const wallet = await storage.getWalletByUserId(userId);
  if (!wallet) {
    return { success: false, error: "Wallet not found" };
  }

  const controls = await storage.getPlatformWalletControls();
  if (!controls) {
    return { success: false, error: "Platform controls not found" };
  }

  const fee = calculateWithdrawalFee(amount, controls.withdrawalFeePercent, controls.withdrawalFeeFixed);
  const totalDeduction = parseFloat(amount) + fee;
  const newBalance = (parseFloat(wallet.availableBalance) - totalDeduction).toFixed(8);

  await storage.updateWalletBalance(wallet.id, newBalance, wallet.escrowBalance);

  const checksummedAddress = checksumAddress(destinationAddress);
  const withdrawal = await storage.createWithdrawalRequest({
    userId,
    walletId: wallet.id,
    amount,
    currency: "USDT",
    walletAddress: checksummedAddress,
    network: "BSC",
  });

  await storage.createTransaction({
    userId,
    walletId: wallet.id,
    type: "withdraw",
    amount,
    currency: "USDT",
    description: `Withdrawal to ${checksummedAddress.slice(0, 10)}...`,
  });

  if (fee > 0) {
    await storage.createTransaction({
      userId,
      walletId: wallet.id,
      type: "fee",
      amount: fee.toString(),
      currency: "USDT",
      description: "Withdrawal fee",
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const userLimit = await storage.getOrCreateUserWithdrawalLimit(userId, today);
  await storage.updateUserWithdrawalLimit(userLimit.id, {
    totalWithdrawn: (parseFloat(userLimit.totalWithdrawn) + parseFloat(amount)).toString(),
    withdrawalCount: userLimit.withdrawalCount + 1,
  });

  return {
    success: true,
    withdrawalId: withdrawal.id,
    delayMinutes: validation.delayMinutes,
    delayReason: validation.delayReason,
  };
}
