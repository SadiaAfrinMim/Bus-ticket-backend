import Stripe from "stripe";
import { prisma } from "../../shared/prisma";
import { BookingStatus, PaymentStatus, PaymentMethod, SeatStatus } from "@prisma/client";

const handleStripeWebhookEvent = async (event: Stripe.Event) => {
  console.log("🚀 Webhook Event Received from Stripe:", event.type);

  switch (event.type) {
    // ⚡ ১. পেমেন্ট সফল হলে
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id;

      if (!bookingId) {
        console.error("🚨 Webhook Error: No bookingId found in session.client_reference_id!");
        break;
      }

      console.log("🎯 Processing Payment Success for Booking ID:", bookingId);

      // ট্রানজেকশন শুরু
      await prisma.$transaction(async (tx) => {
        // বুকিং আপডেট করা
        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PAID,
          },
          include: { seats: true },
        });

        // পেমেন্ট টেবিল তৈরি বা আপডেট করা
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

        // সিটগুলোর স্ট্যাটাস আপডেট করা
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

    // ⚡ ২. পেমেন্ট এক্সপায়ার্ড বা ফেইল হলে
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id;

      if (bookingId) {
        console.log("⚠️ Processing Expiration for Booking ID:", bookingId);
        
        await prisma.$transaction(async (tx) => {
          const bookingWithSeats = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { seats: true },
          });

          await tx.booking.update({
            where: { id: bookingId },
            data: {
              status: BookingStatus.CANCELLED,
              paymentStatus: PaymentStatus.FAILED,
            },
          });

          await tx.payment.upsert({
            where: { bookingId: bookingId },
            update: { status: PaymentStatus.FAILED },
            create: {
              bookingId: bookingId,
              transactionId: session.id,
              paymentMethod: PaymentMethod.STRIPE,
              status: PaymentStatus.FAILED,
              amount: bookingWithSeats ? Number(bookingWithSeats.totalAmount) : 0,
              currency: "BDT",
              paymentDetails: JSON.parse(JSON.stringify(session)),
            },
          });

          if (bookingWithSeats?.seats && bookingWithSeats.seats.length > 0) {
            await tx.seat.updateMany({
              where: { id: { in: bookingWithSeats.seats.map((s) => s.id) } },
              data: { status: SeatStatus.AVAILABLE, bookingId: null },
            });
          }
        });
      }
      break;
    }

    default:
      console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }
};

export const PaymentService = {
  handleStripeWebhookEvent,
};