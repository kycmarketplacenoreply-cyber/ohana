import { db } from "./db";
import { users, wallets } from "@shared/schema";
import { hashPassword } from "./utils/bcrypt";
import { eq } from "drizzle-orm";

async function seedOrUpdateAdmin(
  username: string,
  email: string,
  password: string,
) {
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingUser.length > 0) {
    console.log(
      `Admin user ${username} already exists. Updating password and role...`,
    );
    const hashedPassword = await hashPassword(password);
    await db
      .update(users)
      .set({
        role: "admin",
        password: hashedPassword,
      })
      .where(eq(users.username, username));

    const existingWallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, existingUser[0].id))
      .limit(1);
    if (existingWallet.length === 0) {
      await db.insert(wallets).values({
        userId: existingUser[0].id,
        currency: "USDT",
      });
      console.log(`Wallet created for ${username}!`);
    }

    console.log(`Admin role and password updated for ${username}!`);
    return;
  }

  const hashedPassword = await hashPassword(password);

  const [adminUser] = await db
    .insert(users)
    .values({
      username,
      email,
      password: hashedPassword,
      role: "admin",
      emailVerified: true,
      isActive: true,
    })
    .returning();

  await db.insert(wallets).values({
    userId: adminUser.id,
    currency: "USDT",
  });

  console.log(`Admin user ${username} created successfully!`);
}

async function seedAdmin() {
  console.log("Seeding admin users...");

  await seedOrUpdateAdmin("Kai", "kai@admin.local", "#487530Turbo");
  await seedOrUpdateAdmin("walle", "walle@admin.local", "#487530Turbo");

  console.log("All admin users seeded!");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Error seeding admin:", err);
  process.exit(1);
});
