/*
  Warnings:

  - The `paymentMethod` column on the `bookings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('OFFLINE', 'STRIPE', 'ONLINE');

-- AlterEnum
ALTER TYPE "SeatStatus" ADD VALUE 'BOOKED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paymentUrl" TEXT,
ALTER COLUMN "totalAmount" SET DATA TYPE TEXT,
DROP COLUMN "paymentMethod",
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'OFFLINE';
