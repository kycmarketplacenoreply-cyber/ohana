import { storage } from "../storage";

const PLATFORM_FEE_PERCENT = 10;

export async function holdOfferEscrow(
  userId: string,
  amount: string,
  offerId: string
): Promise<void> {
  const wallet = await storage.getWalletByUserId(userId, "USDT");
  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const availableBalance = parseFloat(wallet.availableBalance);
  const holdAmount = parseFloat(amount);

  if (availableBalance < holdAmount) {
    throw new Error(`Insufficient balance. You need ${holdAmount} USDT but have ${availableBalance.toFixed(2)} USDT available.`);
  }

  await storage.holdEscrow(wallet.id, amount);

  await storage.createTransaction({
    userId,
    walletId: wallet.id,
    type: "escrow_hold",
    amount,
    currency: "USDT",
    description: `Funds reserved for buy offer ${offerId}`,
  });
}

export async function releaseOfferEscrow(
  userId: string,
  amount: string,
  offerId: string
): Promise<void> {
  const wallet = await storage.getWalletByUserId(userId, "USDT");
  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const currentEscrow = parseFloat(wallet.escrowBalance);
  const releaseAmount = parseFloat(amount);

  if (currentEscrow < releaseAmount) {
    throw new Error("Insufficient escrow balance to release");
  }

  const newEscrow = (currentEscrow - releaseAmount).toFixed(8);
  const newAvailable = (parseFloat(wallet.availableBalance) + releaseAmount).toFixed(8);
  
  await storage.updateWalletBalance(wallet.id, newAvailable, newEscrow);

  await storage.createTransaction({
    userId,
    walletId: wallet.id,
    type: "escrow_release",
    amount,
    currency: "USDT",
    description: `Funds released from cancelled buy offer ${offerId}`,
  });
}

export async function holdBuyerEscrow(
  buyerId: string,
  amount: string,
  orderId: string
): Promise<void> {
  const buyerWallet = await storage.getWalletByUserId(buyerId, "USDT");
  if (!buyerWallet) {
    throw new Error("Buyer wallet not found");
  }

  const availableBalance = parseFloat(buyerWallet.availableBalance);
  const holdAmount = parseFloat(amount);

  if (availableBalance < holdAmount) {
    throw new Error("Insufficient balance");
  }

  await storage.holdEscrow(buyerWallet.id, amount);

  await storage.createTransaction({
    userId: buyerId,
    walletId: buyerWallet.id,
    type: "escrow_hold",
    amount,
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Funds locked in escrow for order ${orderId}`,
  });
}

export async function releaseEscrowWithFee(
  buyerId: string,
  sellerId: string,
  amount: string,
  orderId: string
): Promise<{ sellerAmount: string; platformFee: string }> {
  const buyerWallet = await storage.getWalletByUserId(buyerId, "USDT");
  if (!buyerWallet) {
    throw new Error("Buyer wallet not found");
  }

  const sellerWallet = await storage.getWalletByUserId(sellerId, "USDT");
  if (!sellerWallet) {
    throw new Error("Seller wallet not found");
  }

  const kaiAdmin = await storage.getUserByUsername("Kai");
  let adminUser = kaiAdmin;
  
  if (!adminUser) {
    const admins = await storage.getUsersByRole("admin");
    if (admins.length === 0) {
      throw new Error("No admin user found. Cannot process platform fee.");
    }
    adminUser = admins[0];
  }
  
  const adminWallet = await storage.getWalletByUserId(adminUser.id, "USDT");
  if (!adminWallet) {
    throw new Error("Admin wallet not found. Cannot process platform fee.");
  }

  const totalAmount = parseFloat(amount);
  const currentEscrow = parseFloat(buyerWallet.escrowBalance);
  
  if (currentEscrow < totalAmount) {
    throw new Error(`Insufficient escrow balance. Expected ${totalAmount} but found ${currentEscrow}`);
  }

  const platformFee = (totalAmount * PLATFORM_FEE_PERCENT) / 100;
  const sellerAmount = totalAmount - platformFee;

  const newBuyerEscrow = (currentEscrow - totalAmount).toFixed(8);
  await storage.updateWalletBalance(buyerWallet.id, buyerWallet.availableBalance, newBuyerEscrow);

  await storage.createTransaction({
    userId: buyerId,
    walletId: buyerWallet.id,
    type: "escrow_release",
    amount: amount,
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Payment released from escrow for order ${orderId}`,
  });

  const newSellerBalance = (parseFloat(sellerWallet.availableBalance) + sellerAmount).toFixed(8);
  await storage.updateWalletBalance(sellerWallet.id, newSellerBalance, sellerWallet.escrowBalance);

  await storage.createTransaction({
    userId: sellerId,
    walletId: sellerWallet.id,
    type: "escrow_release",
    amount: sellerAmount.toFixed(8),
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Payment received for order ${orderId} (90% after platform fee)`,
  });

  const newAdminBalance = (parseFloat(adminWallet.availableBalance) + platformFee).toFixed(8);
  await storage.updateWalletBalance(adminWallet.id, newAdminBalance, adminWallet.escrowBalance);

  await storage.createTransaction({
    userId: adminUser.id,
    walletId: adminWallet.id,
    type: "fee",
    amount: platformFee.toFixed(8),
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Platform service fee (10%) received for order ${orderId}`,
  });

  await storage.createTransaction({
    userId: buyerId,
    walletId: buyerWallet.id,
    type: "fee",
    amount: platformFee.toFixed(8),
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Platform service fee (10%) deducted for order ${orderId}`,
  });

  return {
    sellerAmount: sellerAmount.toFixed(8),
    platformFee: platformFee.toFixed(8),
  };
}

export async function refundBuyerEscrow(
  buyerId: string,
  amount: string,
  orderId: string
): Promise<void> {
  const buyerWallet = await storage.getWalletByUserId(buyerId, "USDT");
  if (!buyerWallet) {
    throw new Error("Buyer wallet not found");
  }

  const refundAmount = parseFloat(amount);
  const currentEscrow = parseFloat(buyerWallet.escrowBalance);
  
  if (currentEscrow < refundAmount) {
    throw new Error(`Insufficient escrow balance for refund. Expected ${refundAmount} but found ${currentEscrow}`);
  }

  const newEscrow = (currentEscrow - refundAmount).toFixed(8);
  const newAvailable = (parseFloat(buyerWallet.availableBalance) + refundAmount).toFixed(8);
  
  await storage.updateWalletBalance(buyerWallet.id, newAvailable, newEscrow);

  await storage.createTransaction({
    userId: buyerId,
    walletId: buyerWallet.id,
    type: "refund",
    amount,
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Refund for disputed order ${orderId}`,
  });
}

export async function holdEscrow(
  vendorId: string,
  amount: string,
  orderId: string
): Promise<void> {
  const vendorProfile = await storage.getVendorProfile(vendorId);
  if (!vendorProfile) {
    throw new Error("Vendor not found");
  }

  const wallet = await storage.getWalletByUserId(vendorProfile.userId, "USDT");
  if (!wallet) {
    throw new Error("Vendor wallet not found");
  }

  const availableBalance = parseFloat(wallet.availableBalance);
  const holdAmount = parseFloat(amount);

  if (availableBalance < holdAmount) {
    throw new Error("Insufficient balance");
  }

  await storage.holdEscrow(wallet.id, amount);

  await storage.createTransaction({
    userId: vendorProfile.userId,
    walletId: wallet.id,
    type: "escrow_hold",
    amount,
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Escrow hold for order ${orderId}`,
  });
}

export async function releaseEscrow(
  vendorId: string,
  buyerId: string,
  amount: string,
  orderId: string
): Promise<void> {
  const vendorProfile = await storage.getVendorProfile(vendorId);
  if (!vendorProfile) {
    throw new Error("Vendor not found");
  }

  const vendorWallet = await storage.getWalletByUserId(vendorProfile.userId, "USDT");
  if (!vendorWallet) {
    throw new Error("Vendor wallet not found");
  }

  await storage.releaseEscrow(vendorWallet.id, amount);

  await storage.createTransaction({
    userId: vendorProfile.userId,
    walletId: vendorWallet.id,
    type: "escrow_release",
    amount,
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Escrow released for order ${orderId}`,
  });

  const buyerWallet = await storage.getWalletByUserId(buyerId, "USDT");
  if (buyerWallet) {
    const newBalance = (parseFloat(buyerWallet.availableBalance) + parseFloat(amount)).toFixed(8);
    await storage.updateWalletBalance(buyerWallet.id, newBalance, buyerWallet.escrowBalance);

    await storage.createTransaction({
      userId: buyerId,
      walletId: buyerWallet.id,
      type: "escrow_release",
      amount,
      currency: "USDT",
      relatedOrderId: orderId,
      description: `Received from order ${orderId}`,
    });
  }
}

export async function refundEscrow(
  vendorId: string,
  amount: string,
  orderId: string
): Promise<void> {
  const vendorProfile = await storage.getVendorProfile(vendorId);
  if (!vendorProfile) {
    throw new Error("Vendor not found");
  }

  const vendorWallet = await storage.getWalletByUserId(vendorProfile.userId, "USDT");
  if (!vendorWallet) {
    throw new Error("Vendor wallet not found");
  }

  const newEscrow = (parseFloat(vendorWallet.escrowBalance) - parseFloat(amount)).toFixed(8);
  const newAvailable = (parseFloat(vendorWallet.availableBalance) + parseFloat(amount)).toFixed(8);
  
  await storage.updateWalletBalance(vendorWallet.id, newAvailable, newEscrow);

  await storage.createTransaction({
    userId: vendorProfile.userId,
    walletId: vendorWallet.id,
    type: "refund",
    amount,
    currency: "USDT",
    relatedOrderId: orderId,
    description: `Refund for disputed order ${orderId}`,
  });
}
