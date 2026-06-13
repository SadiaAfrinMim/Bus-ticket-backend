import Stripe from "stripe";
import { prisma } from "../../shared/prisma";
import { BookingStatus, PaymentStatus, PaymentMethod, SeatStatus } from "@prisma/client";

const handleStripeWebhookEvent = async (event: Stripe.Event) => {
  console.log("🚀 Webhook Event Received from Stripe:", event.type);

  switch (event.type) {

    // ⚡ ১. পেমেন্ট সফল হলে — PENDING → CONFIRMED
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id ?? null;

      if (!bookingId) {
        console.error("🚨 Webhook Error: No bookingId found in session.client_reference_id!");
        break;
      }

      console.log("🎯 Processing Payment Success for Booking ID:", bookingId);

      // Idempotency: skip if already confirmed
      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (!existingBooking) {
        console.error(`🚨 Booking ${bookingId} not found!`);
        break;
      }
      if (existingBooking.status === BookingStatus.CONFIRMED) {
        console.log(`ℹ️ Booking ${bookingId} already confirmed, skipping duplicate webhook.`);
        break;
      }

      // ট্রানজেকশন শুরু — সব আপডেট পরস্পর নির্ভরশীল
      await prisma.$transaction(async (tx) => {
        // BookingStatus: PENDING → CONFIRMED, PaymentStatus: UNPAID → PAID
        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PAID,
          },
          include: { seats: true },
        });

        // PaymentStatus: PENDING → PAID
        await tx.payment.upsert({
          where: { bookingId: bookingId },
          update: {
            transactionId: (session.payment_intent as string) || session.id,
            status: PaymentStatus.PAID,
            paymentDetails: JSON.parse(JSON.stringify(session)),
          },
          create: {
            bookingId: bookingId,
            transactionId: (session.payment_intent as string) || session.id,
            paymentMethod: PaymentMethod.STRIPE,
            status: PaymentStatus.PAID,
            amount: Number(updatedBooking.totalAmount),
            currency: session.currency?.toUpperCase() || "BDT",
            paymentDetails: JSON.parse(JSON.stringify(session)),
          },
        });

        // সিটগুলো — LOCKED → SOLD
        if (updatedBooking.seats && updatedBooking.seats.length > 0) {
          const seatIds = updatedBooking.seats.map((seat) => seat.id);
          await tx.seat.updateMany({
            where: { id: { in: seatIds } },
            data: { status: SeatStatus.SOLD },
          });
        }
      });

      console.log(`✅ Success: Booking & Payment for ${bookingId} confirmed!`);
      break;
    }

    // ⚡ ২. পেমেন্ট ফেইল হলে (payment_intent.payment_failed) — PENDING → CANCELLED
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.bookingId ?? null;

      if (!bookingId) {
        console.error("🚨 Webhook Error: No bookingId found in payment_intent.metadata!");
        break;
      }

      console.log("⚠️ Processing Payment Failure for Booking ID:", bookingId);

      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (!existingBooking) {
        console.error(`🚨 Booking ${bookingId} not found!`);
        break;
      }
      if (existingBooking.status !== BookingStatus.PENDING) {
        console.log(`ℹ️ Booking ${bookingId} is ${existingBooking.status}, skipping failure handler.`);
        break;
      }

      await prisma.$transaction(async (tx) => {
        // BookingStatus: PENDING → CANCELLED, PaymentStatus: UNPAID → FAILED
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
          },
        });

        // PaymentStatus: PENDING → FAILED
        await tx.payment.updateMany({
          where: { bookingId: bookingId },
          data: {
            status: PaymentStatus.FAILED,
            paymentDetails: JSON.parse(JSON.stringify(paymentIntent)),
          },
        });

        // সিটগুলো — LOCKED → AVAILABLE
        await tx.seat.updateMany({
          where: { bookingId: bookingId },
          data: { status: SeatStatus.AVAILABLE, bookingId: null },
        });
      });

      console.log(`❌ Payment failed for Booking ${bookingId}, seats released.`);
      break;
    }

    // ⚡ ৩. চেকআউট সেশন এক্সপায়ার্ড — PENDING → CANCELLED
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id ?? null;

      if (!bookingId) {
        console.error("🚨 Webhook Error: No bookingId found in session.client_reference_id!");
        break;
      }

      console.log("⚠️ Processing Expiration for Booking ID:", bookingId);

      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (!existingBooking) {
        console.error(`🚨 Booking ${bookingId} not found!`);
        break;
      }
      if (existingBooking.status !== BookingStatus.PENDING) {
        console.log(`ℹ️ Booking ${bookingId} is ${existingBooking.status}, skipping expiration handler.`);
        break;
      }

      await prisma.$transaction(async (tx) => {
        // BookingStatus: PENDING → CANCELLED, PaymentStatus: UNPAID → FAILED
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
          },
        });

        // PaymentStatus: PENDING → FAILED
        await tx.payment.upsert({
          where: { bookingId: bookingId },
          update: { status: PaymentStatus.FAILED },
          create: {
            bookingId: bookingId,
            transactionId: session.id,
            paymentMethod: PaymentMethod.STRIPE,
            status: PaymentStatus.FAILED,
            amount: 0,
            currency: "BDT",
            paymentDetails: JSON.parse(JSON.stringify(session)),
          },
        });

        // সিটগুলো — LOCKED → AVAILABLE
        await tx.seat.updateMany({
          where: { bookingId: bookingId },
          data: { status: SeatStatus.AVAILABLE, bookingId: null },
        });
      });

      console.log(`⏰ Session expired for Booking ${bookingId}, seats released.`);
      break;
    }

    default:
      console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }
};

export const PaymentService = {
  handleStripeWebhookEvent,
};
