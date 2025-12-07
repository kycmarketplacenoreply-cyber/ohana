import { db } from "./db";
import { 
  users, 
  kyc, 
  vendorProfiles, 
  wallets, 
  offers,
  exchanges
} from "@shared/schema";
import bcrypt from "bcrypt";

const exchangeNames = ["OKX", "Binance", "Bybit", "KuCoin", "Huobi", "Gate.io", "MEXC"];
const paymentMethods = ["Binance UID", "OKX UID", "Bybit UID", "MEXC UID", "KuCoin UID", "Wallet Address", "Bank Transfer"];
const countries = ["Nigeria", "Kenya", "Tanzania", "Ghana", "South Africa", "United States", "United Kingdom", "Germany"];

const usernames = [
  "TraderOne",
  "CryptoMax",
  "FastExchange",
  "TrustDeals",
  "SecureTrader",
  "PrimeVault",
  "SwiftCrypto",
  "SafeHolder",
  "TopExchange",
  "EliteTrader",
  "QuickSwap",
  "CoinMaster",
  "TradeKing",
  "P2PMaster",
  "CryptoWave",
  "TradePro",
  "ExchangeHub",
  "CoinVault",
  "FastDeals",
  "TrustExchange"
];

async function seed() {
  console.log("Starting seed process...");
  
  try {
    const adminPassword = await bcrypt.hash("#487530Turbo", 10);
    const userPassword = await bcrypt.hash("Password123!", 10);
    
    console.log("Creating USDT exchange...");
    await db.insert(exchanges).values({
      name: "USDT",
      symbol: "USDT",
      description: "Tether USD Stablecoin",
      isActive: true,
      sortOrder: 0,
    }).onConflictDoNothing();
    console.log("Created USDT exchange");
    
    console.log("\n=== Creating Root Admin Account ===");
    const [adminUser] = await db.insert(users).values({
      username: "Kai",
      email: "kai@admin.com",
      password: adminPassword,
      role: "admin",
      emailVerified: true,
      isActive: true,
      isFrozen: false,
      twoFactorEnabled: false,
      loginAttempts: 0,
    }).returning();
    console.log(`Created root admin: Kai (password: #487530Turbo)`);
    
    await db.insert(wallets).values({
      userId: adminUser.id,
      currency: "USDT",
    });
    
    console.log("\n=== Creating 20 User Accounts ===");
    const vendorIds: string[] = [];
    
    for (let i = 0; i < 20; i++) {
      const username = usernames[i];
      
      const [vendorUser] = await db.insert(users).values({
        username,
        email: `${username.toLowerCase()}@user.com`,
        password: userPassword,
        role: "vendor",
        emailVerified: true,
        isActive: true,
        isFrozen: false,
        twoFactorEnabled: false,
        loginAttempts: 0,
      }).returning();
      
      await db.insert(kyc).values({
        userId: vendorUser.id,
        tier: "tier2",
        status: "approved",
        idType: "passport",
        idNumber: `PASS${1000000 + i}`,
        idDocumentUrl: "/uploads/sample-id.jpg",
        selfieUrl: "/uploads/sample-selfie.jpg",
        faceMatchScore: "95.00",
        adminNotes: "Admin approved verified vendor",
      });
      
      const [vendorProfile] = await db.insert(vendorProfiles).values({
        userId: vendorUser.id,
        businessName: null,
        bio: `Verified trusted vendor - ${username}. Fast trades and secure transactions.`,
        country: countries[i % countries.length],
        subscriptionPlan: i < 5 ? "featured" : i < 10 ? "pro" : "basic",
        isApproved: true,
        totalTrades: 100 + Math.floor(Math.random() * 300),
        completedTrades: 95 + Math.floor(Math.random() * 250),
        cancelledTrades: Math.floor(Math.random() * 5),
        averageRating: (4.5 + Math.random() * 0.5).toFixed(2),
        totalRatings: 50 + Math.floor(Math.random() * 100),
        suspiciousActivityScore: 0,
      }).returning();
      
      vendorIds.push(vendorProfile.id);
      
      await db.insert(wallets).values({
        userId: vendorUser.id,
        currency: "USDT",
        availableBalance: (500 + Math.random() * 1000).toFixed(8),
        escrowBalance: (100 + Math.random() * 200).toFixed(8),
      });
      
      console.log(`Created user ${i + 1}/20: ${username}`);
    }
    
    console.log("\n=== Creating 14 Offers for Each User (7 Buy + 7 Sell) ===");
    for (let i = 0; i < 20; i++) {
      const vendorId = vendorIds[i];
      const username = usernames[i];
      
      // Create 7 SELL offers
      for (let j = 0; j < 7; j++) {
        const exchangeName = exchangeNames[j % exchangeNames.length];
        const basePrice = 120 + Math.random() * 30;
        
        await db.insert(offers).values({
          vendorId,
          type: "sell",
          currency: "USDT",
          pricePerUnit: basePrice.toFixed(2),
          minLimit: (1000 + Math.random() * 2000).toFixed(2),
          maxLimit: (50000 + Math.random() * 150000).toFixed(2),
          availableAmount: (100 + Math.random() * 500).toFixed(2),
          paymentMethods: [paymentMethods[j % paymentMethods.length], paymentMethods[(j + 1) % paymentMethods.length]],
          terms: `${exchangeName} verified account for sale. Level 2 KYC completed. Instant transfer.`,
          isActive: true,
          isPriority: j < 2,
        });
      }
      
      // Create 7 BUY offers
      for (let j = 0; j < 7; j++) {
        const exchangeName = exchangeNames[j % exchangeNames.length];
        const basePrice = 100 + Math.random() * 25;
        
        await db.insert(offers).values({
          vendorId,
          type: "buy",
          currency: "USDT",
          pricePerUnit: basePrice.toFixed(2),
          minLimit: (1000 + Math.random() * 2000).toFixed(2),
          maxLimit: (50000 + Math.random() * 150000).toFixed(2),
          availableAmount: (100 + Math.random() * 500).toFixed(2),
          paymentMethods: [paymentMethods[j % paymentMethods.length], paymentMethods[(j + 1) % paymentMethods.length]],
          terms: `Looking to buy verified ${exchangeName} account. Will pay premium for accounts with trading history.`,
          isActive: true,
          isPriority: j < 2,
        });
      }
      console.log(`Created 14 offers for user: ${username} (7 buy + 7 sell)`);
    }
    
    console.log("\n=== Seed Summary ===");
    console.log(`Total Users: 21 (1 admin + 20 verified users)`);
    console.log(`\nRoot Admin Account:`);
    console.log(`  Username: Kai`);
    console.log(`  Password: #487530Turbo`);
    console.log(`  Role: admin`);
    console.log(`\n20 Verified Users:`);
    usernames.forEach((name, i) => {
      console.log(`  ${i + 1}. ${name} - 14 offers (7 buy + 7 sell)`);
    });
    console.log(`\nTotal Offers: 280 (14 per user x 20 users)`);
    console.log(`  - 140 buying offers`);
    console.log(`  - 140 selling offers`);
    console.log(`\nAll user accounts have password: Password123!`);
    console.log("\nSeed completed successfully!");
    
  } catch (error) {
    console.error("Seed error:", error);
    throw error;
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
