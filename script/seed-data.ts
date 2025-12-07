import { db } from "../server/db";
import { users, kyc, vendorProfiles, offers, wallets } from "../shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

const countries = ["USA", "UK", "Canada", "Germany", "France", "Japan", "Australia", "Singapore", "UAE", "Nigeria"];
const currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NGN", "AED", "SGD", "CHF"];
const paymentMethods = ["Bank Transfer", "PayPal", "Skrill", "Wise", "Zelle", "Venmo", "Mobile Money", "Cash App"];

const businessNames = [
  "CryptoTrade Pro", "FastExchange", "SecurePay Hub", "Digital Assets Co", "Swift Crypto",
  "P2P Exchange", "TrustTrade", "CoinMasters", "SafeSwap", "QuickCrypto",
  "GlobalExchange", "PrimeCrypto", "EliteTrade", "VelocityPay", "SecureAssets",
  "TradePro Hub", "CryptoVault", "SwiftPay Exchange", "DigitalTrade", "FastCoin Pro"
];

async function seed() {
  console.log("Starting seed...");

  const hashedPassword = await bcrypt.hash("#487530Turbo", 10);

  const existingKai = await db.select().from(users).where(eq(users.username, "Kai")).limit(1);
  
  if (existingKai.length > 0) {
    await db.update(users)
      .set({ password: hashedPassword, role: "admin" })
      .where(eq(users.username, "Kai"));
    console.log("Updated Kai to admin");
  } else {
    const [kaiUser] = await db.insert(users).values({
      username: "Kai",
      email: "kai@admin.com",
      password: hashedPassword,
      role: "admin",
    }).returning();
    
    await db.insert(wallets).values({
      userId: kaiUser.id,
      currency: "USDT",
    });
    console.log("Created Kai as admin");
  }

  for (let i = 1; i <= 20; i++) {
    const username = `vendor${i}`;
    const email = `vendor${i}@example.com`;
    const country = countries[i % countries.length];
    const businessName = businessNames[i - 1] || `Business ${i}`;

    const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser.length > 0) {
      console.log(`User ${username} already exists, skipping...`);
      continue;
    }

    const vendorPassword = await bcrypt.hash(`password${i}`, 10);
    
    const [user] = await db.insert(users).values({
      username,
      email,
      password: vendorPassword,
      role: "vendor",
    }).returning();

    await db.insert(wallets).values({
      userId: user.id,
      currency: "USDT",
      availableBalance: (Math.random() * 10000 + 1000).toFixed(2),
    });

    await db.insert(kyc).values({
      userId: user.id,
      tier: "tier1",
      status: "approved",
      idType: "passport",
      idNumber: `ID${100000 + i}`,
      idFrontUrl: "/uploads/sample-id-front.jpg",
      idBackUrl: "/uploads/sample-id-back.jpg",
      selfieUrl: "/uploads/sample-selfie.jpg",
      faceMatchScore: (85 + Math.random() * 14).toFixed(2),
      isStarVerified: i <= 5,
    });

    const [vendorProfile] = await db.insert(vendorProfiles).values({
      userId: user.id,
      businessName,
      bio: `Trusted ${country} vendor with years of experience in crypto trading.`,
      country,
      subscriptionPlan: i <= 5 ? "pro" : i <= 10 ? "basic" : "free",
      isApproved: true,
      totalTrades: Math.floor(Math.random() * 500) + 50,
      completedTrades: Math.floor(Math.random() * 450) + 40,
      averageRating: (3.5 + Math.random() * 1.5).toFixed(2),
      totalRatings: Math.floor(Math.random() * 100) + 10,
    }).returning();

    const currency = currencies[i % currencies.length];
    const basePrice = currency === "USD" ? 1.0 : 
                     currency === "EUR" ? 0.92 : 
                     currency === "GBP" ? 0.79 :
                     currency === "JPY" ? 149.5 :
                     currency === "NGN" ? 1580 :
                     currency === "AED" ? 3.67 : 1.0;

    for (let j = 1; j <= 7; j++) {
      const buyPrice = (basePrice * (0.98 + Math.random() * 0.02)).toFixed(4);
      const minLimit = (50 + Math.random() * 100).toFixed(2);
      const maxLimit = (500 + Math.random() * 9500).toFixed(2);
      const availableAmount = (100 + Math.random() * 5000).toFixed(2);
      const selectedPayments = paymentMethods.slice(0, Math.floor(Math.random() * 3) + 1);

      await db.insert(offers).values({
        vendorId: vendorProfile.id,
        type: "buy",
        currency,
        pricePerUnit: buyPrice,
        minLimit,
        maxLimit,
        availableAmount,
        paymentMethods: selectedPayments,
        terms: `Fast and secure ${currency} to USDT exchange. Payment within 15 minutes.`,
        accountDetails: {
          exchangeName: businessName,
          accountName: `${username} Trading Account`,
          email: email,
        },
        isActive: true,
      });
    }

    for (let j = 1; j <= 7; j++) {
      const sellPrice = (basePrice * (1.0 + Math.random() * 0.03)).toFixed(4);
      const minLimit = (50 + Math.random() * 100).toFixed(2);
      const maxLimit = (500 + Math.random() * 9500).toFixed(2);
      const availableAmount = (100 + Math.random() * 5000).toFixed(2);
      const selectedPayments = paymentMethods.slice(0, Math.floor(Math.random() * 3) + 1);

      await db.insert(offers).values({
        vendorId: vendorProfile.id,
        type: "sell",
        currency,
        pricePerUnit: sellPrice,
        minLimit,
        maxLimit,
        availableAmount,
        paymentMethods: selectedPayments,
        terms: `Reliable USDT to ${currency} exchange. Quick release after payment confirmation.`,
        accountDetails: {
          exchangeName: businessName,
          accountName: `${username} Trading Account`,
          email: email,
        },
        isActive: true,
      });
    }

    console.log(`Created vendor ${username} with 14 offers (7 buy, 7 sell)`);
  }

  console.log("Seed completed successfully!");
  console.log("Summary:");
  console.log("- Kai updated/created as admin with password: #487530Turbo");
  console.log("- 20 vendor users created with approved KYC");
  console.log("- 280 offers created (14 per vendor: 7 buy + 7 sell)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
