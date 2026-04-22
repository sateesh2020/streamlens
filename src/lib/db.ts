import { PrismaClient } from "@prisma/client"

// Singleton — prevents multiple PrismaClient instances in Next.js dev hot reloads
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
