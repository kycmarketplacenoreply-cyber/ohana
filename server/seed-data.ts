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

const exchangeNames = ["OKX", "Binance", "Bybit", "KuCoin", "Huobi", "Gate.io", "Bitfinex", "Kraken", "Coinbase", "Bitstamp"];

const paymentMethods = ["Binance UID", "OKX UID", "Bybit UID", "MEXC UID", "KuCoin UID", "Wallet Address"];
const countries = ["Nigeria", "Kenya", "Tanzania", "Ghana", "South Africa", "United States", "United Kingdom", "Germany"];

async function seed() {
  console.log("Starting seed process...");
  
  try {
    const hashedPassword = await bcrypt.hash("Password123!", 10);
    
    console.log("Creating USDT exchange...");
    const createdExchanges = await db.insert(exchanges).values({
      name: "USDT",
      symbol: "USDT",
      description: "Tether USD Stablecoin",
      isActive: true,
      sortOrder: 0,
    }).returning();
    console.log(`Created USDT exchange`);
    
    console.log("Creating 20 users...");
    const createdUsers: any[] = [];
    
    for (let i = 1; i <= 20; i++) {
      const isVendor = i <= 10;
      const role = isVendor ? "vendor" : "customer";
      const username = isVendor ? `vendor${i}` : `customer${i - 10}`;
      
      const [user] = await db.insert(users).values({
        username,
        email: `${username}@example.com`,
        password: hashedPassword,
        role,
        emailVerified: true,
        isActive: true,
        isFrozen: false,
        twoFactorEnabled: false,
        loginAttempts: 0,
      }).returning();
      
      createdUsers.push({ ...user, isVendor });
      console.log(`Created user: ${username}`);
    }
    
    console.log("Creating KYC records for verified vendors...");
    for (let i = 0; i < 10; i++) {
      const user = createdUsers[i];
      await db.insert(kyc).values({
        userId: user.id,
        tier: "tier2",
        status: "approved",
        idType: "passport",
        idNumber: `PASS${1000000 + i}`,
        idDocumentUrl: "/uploads/sample-id.jpg",
        selfieUrl: "/uploads/sample-selfie.jpg",
        faceMatchScore: "95.00",
        adminNotes: "Verified vendor account",
      });
      console.log(`Created KYC for: ${user.username}`);
    }
    
    console.log("Creating vendor profiles...");
    const vendorProfileIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const user = createdUsers[i];
      const country = countries[i % countries.length];
      
      const [profile] = await db.insert(vendorProfiles).values({
        userId: user.id,
        businessName: `${user.username.charAt(0).toUpperCase()}${user.username.slice(1)} Trading`,
        bio: `Trusted vendor specializing in crypto account trading. Based in ${country}.`,
        country,
        subscriptionPlan: i < 3 ? "featured" : i < 6 ? "pro" : "basic",
        isApproved: true,
        totalTrades: 50 + Math.floor(Math.random() * 200),
        completedTrades: 40 + Math.floor(Math.random() * 150),
        cancelledTrades: Math.floor(Math.random() * 5),
        averageRating: (4 + Math.random()).toFixed(2),
        totalRatings: 20 + Math.floor(Math.random() * 80),
        suspiciousActivityScore: 0,
      }).returning();
      
      vendorProfileIds.push(profile.id);
      console.log(`Created vendor profile for: ${user.username}`);
    }
    
    console.log("Creating wallets with escrow balances...");
    for (let i = 0; i < 20; i++) {
      const user = createdUsers[i];
      const isVendor = i < 10;
      
      const availableBalance = isVendor 
        ? (100 + Math.random() * 500).toFixed(8)
        : (10 + Math.random() * 100).toFixed(8);
      
      const escrowBalance = isVendor 
        ? (70 + Math.random() * 50).toFixed(8)
        : "0.00000000";
      
      await db.insert(wallets).values({
        userId: user.id,
        currency: "USDT",
        availableBalance,
        escrowBalance,
      });
      console.log(`Created wallet for ${user.username}: Available ${availableBalance}, Escrow ${escrowBalance}`);
    }
    
    console.log("Creating offers (10 sell + 10 buy per user)...");
    let totalOffers = 0;
    
    for (let i = 0; i < 20; i++) {
      const user = createdUsers[i];
      let vendorId: string;
      
      if (i < 10) {
        vendorId = vendorProfileIds[i];
      } else {
        const [customerVendorProfile] = await db.insert(vendorProfiles).values({
          userId: user.id,
          businessName: `${user.username.charAt(0).toUpperCase()}${user.username.slice(1)} Trading`,
          bio: `Individual trader looking for the best deals.`,
          country: countries[(i - 10) % countries.length],
          subscriptionPlan: "free",
          isApproved: true,
          totalTrades: Math.floor(Math.random() * 50),
          completedTrades: Math.floor(Math.random() * 40),
          cancelledTrades: Math.floor(Math.random() * 3),
          averageRating: (3.5 + Math.random() * 1.5).toFixed(2),
          totalRatings: Math.floor(Math.random() * 20),
          suspiciousActivityScore: 0,
        }).returning();
        vendorId = customerVendorProfile.id;
      }
      
      for (let j = 0; j < 10; j++) {
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
          terms: `${exchangeName} verified account for sale. Level 2 KYC completed. Instant transfer. Payment via ${paymentMethods[j % paymentMethods.length]}.`,
          isActive: true,
          isPriority: j < 2,
        });
        totalOffers++;
      }
      
      for (let j = 0; j < 10; j++) {
        const exchangeName = exchangeNames[j % exchangeNames.length];
        const basePrice = 100 + Math.random() * 25;
        
        await db.insert(offers).values({
          vendorId,
          type: "buy",
          currency: "USDT",
          pricePerUnit: basePrice.toFixed(2),
          minLimit: (500 + Math.random() * 1500).toFixed(2),
          maxLimit: (30000 + Math.random() * 100000).toFixed(2),
          availableAmount: (50 + Math.random() * 300).toFixed(2),
          paymentMethods: [paymentMethods[(j + 3) % paymentMethods.length], paymentMethods[(j + 4) % paymentMethods.length]],
          terms: `Looking to buy verified ${exchangeName} account. Will pay premium for accounts with trading history. Payment via ${paymentMethods[(j + 3) % paymentMethods.length]}.`,
          isActive: true,
          isPriority: false,
        });
        totalOffers++;
      }
      
      console.log(`Created 20 offers for ${user.username}`);
    }
    
    console.log("\n=== Seed Summary ===");
    console.log(`Total Users: 20`);
    console.log(`- Verified Vendors: 10 (with 70+ USDT in escrow)`);
    console.log(`- Regular Customers: 10`);
    console.log(`Total Exchanges: ${createdExchanges.length}`);
    console.log(`Total Offers: ${totalOffers}`);
    console.log(`- Sell offers: ${totalOffers / 2}`);
    console.log(`- Buy offers: ${totalOffers / 2}`);
    console.log("\nAll vendors have passwords: Password123!");
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
