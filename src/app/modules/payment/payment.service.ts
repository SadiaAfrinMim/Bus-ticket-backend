import Stripe from "stripe";
import { prisma } from "../../shared/prisma"; 
import { BookingStatus, PaymentStatus, PaymentMethod, SeatStatus } from "@prisma/client";

const handleStripeWebhookEvent = async (event: Stripe.Event) => {
  console.log("🚀 Webhook Event Received from Stripe:", event.type);
  
  switch (event.type) {
    
    // ⚡ ১. পেমেন্ট সফল হলে (Checkout Success)
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id;

      console.log("🎯 Processing Checkout Session for Booking ID:", bookingId);

      if (!bookingId) {
        console.error("🚨 Webhook Error: No bookingId found in session.client_reference_id!");
        break;
      }

      const isPaid = session.payment_status === "paid";

      if (isPaid) {
        try {
          await prisma.$transaction(async (tx) => {
            
            // ১. বুকিং স্ট্যাটাস আপডেট (আপনার BookingStatus এনাম অনুযায়ী)
            const updatedBooking = await tx.booking.update({
              where: { id: bookingId },
              data: {
                status: BookingStatus.CONFIRMED,
                paymentStatus: PaymentStatus.PAID,
              },
              include: {
                seats: true 
              }
            });

            // ২. 🎯 পেমেন্ট টেবিল আপডেট/তৈরি করা (আপনার PaymentStatus ও PaymentMethod এনাম অনুযায়ী)
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
              }
            });

            // ৩. সিটগুলোর স্ট্যাটাস আপডেট (আপনার SeatStatus.SOLD এনাম অনুযায়ী)
            if (updatedBooking.seats && updatedBooking.seats.length > 0) {
              const seatIds = updatedBooking.seats.map(seat => seat.id);
              
              await tx.seat.updateMany({
                where: {
                  id: { in: seatIds }
                },
                data: {
                  status: SeatStatus.SOLD, // 👈 'BOOKED' এর বদলে আপনার এনামের 'SOLD' বসানো হয়েছে
                },
              });
            }

            console.log(`✅ Success: Booking & Payment for ${bookingId} successfully confirmed in DB!`);
          });
        } catch (dbError: any) {
          console.error("🚨 DB Transaction Error while updating booking:", dbError.message);
        }
      } else {
        console.log(`⚠️ Session found but payment status is: ${session.payment_status}`);
      }
      break;
    }

    // ⚡ ২. পেমেন্ট ফেইল বা সেশন টাইমআউট হলে (Checkout Expired)
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id;

      if (bookingId) {
        try {
          await prisma.$transaction(async (tx) => {
            
            // সিটগুলো রিলিজ করার জন্য বুকিংয়ের সিটগুলো তুলে আনা
            const bookingWithSeats = await tx.booking.findUnique({
              where: { id: bookingId },
              include: { seats: true }
            });

            // ১. বুকিং স্ট্যাটাস ক্যানসেল করা (আপনার BookingStatus ও PaymentStatus অনুযায়ী)
            await tx.booking.update({
              where: { id: bookingId },
              data: {
                status: BookingStatus.CANCELLED,
                paymentStatus: PaymentStatus.FAILED,
              },
            });

            // ২. পেমেন্ট টেবিলের স্ট্যাটাস FAILED করা
            await tx.payment.upsert({
              where: { bookingId: bookingId },
              update: {
                status: PaymentStatus.FAILED,
                paymentDetails: JSON.parse(JSON.stringify(session)),
              },
              create: {
                bookingId: bookingId,
                transactionId: session.id,
                paymentMethod: PaymentMethod.STRIPE,
                status: PaymentStatus.FAILED,
                amount: bookingWithSeats ? Number(bookingWithSeats.totalAmount) : 0,
                currency: session.currency?.toUpperCase() || "BDT",
                paymentDetails: JSON.parse(JSON.stringify(session)),
              }
            });

            // ৩. সিট আবার সবার জন্য এভেইলেবল (SeatStatus.AVAILABLE) করে দেওয়া
            if (bookingWithSeats?.seats && bookingWithSeats.seats.length > 0) {
              const seatIds = bookingWithSeats.seats.map(seat => seat.id);
              await tx.seat.updateMany({
                where: { id: { in: seatIds } },
                data: {
                  status: SeatStatus.AVAILABLE, // 👈 টাইপ-সেফ এনাম
                  bookingId: null,
                },
              });
            }
          });
          console.log(`❌ Cancelled: Booking & Payment ${bookingId} marked as CANCELLED/FAILED due to expiration.`);
        } catch (dbError: any) {
          console.error("🚨 DB Transaction Error while cancelling booking:", dbError.message);
        }
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