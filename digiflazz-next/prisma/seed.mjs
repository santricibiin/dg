import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1. Platform super-admin (no tenant). Operates the whole platform.
  const superEmail = "super@digiflazz.local";
  const superPass = await bcrypt.hash("Super#12345", 10);
  const superadmin = await prisma.user.upsert({
    where: { email: superEmail },
    update: { role: "superadmin", tenantId: null },
    create: {
      name: "Super Admin",
      email: superEmail,
      password: superPass,
      role: "superadmin",
      active: true,
    },
  });

  // 2. Demo tenant + owner (for testing the rented experience).
  const demoOwnerEmail = "admin@digiflazz.local";
  let tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Demo Tenant",
        slug: "demo",
        status: "active",
        plan: "pro",
        settings: { create: {} },
      },
    });
  }

  const ownerPass = await bcrypt.hash("Admin#12345", 10);
  await prisma.user.upsert({
    where: { email: demoOwnerEmail },
    update: { role: "user", tenantId: tenant.id },
    create: {
      name: "Administrator",
      email: demoOwnerEmail,
    password: ownerPass,
      role: "user",
    active: true,
      tenantId: tenant.id,
    },
});

  console.log("Seed selesai.");
  console.log("--------------------------------------------------");
  console.log("Super Admin (kelola semua tenant):");
  console.log("  email   :", superEmail);
  console.log("  password: Super#12345");
  console.log("");
  console.log("Owner Demo Tenant (akun penyewa):");
  console.log("  email   :", demoOwnerEmail);
  console.log("  password: Admin#12345");
  console.log("--------------------------------------------------");
  console.log("Ganti kata sandi setelah login pertama.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
