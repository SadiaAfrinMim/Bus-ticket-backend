import Stripe from "stripe";
import { prisma } from "../../shared/prisma"; 
import { PaymentStatus, BookingStatus, SeatStatus } from "@prisma/client";

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
          // 🚀 রিলেশন ঝামেলা এড়াতে আমরা সরাসরি সিটগুলোকে ইনক্লুড করে বুকিং আপডেট করব
          await prisma.$transaction(async (tx) => {
            
            // ১. বুকিং স্ট্যাটাস আপডেট
            const updatedBooking = await tx.booking.update({
              where: { id: bookingId },
              data: {
                status: BookingStatus.CONFIRMED,
                paymentStatus: PaymentStatus.PAID,
                paymentId: (session.payment_intent as string) || session.id,
                paymentDetails: JSON.stringify(session),
              },
              // এটি দেওয়ার ফলে আমরা এই বুকিংয়ের সাথে কোন কোন সিট যুক্ত তা সরাসরি পেয়ে যাব
              include: {
                seats: true 
              }
            });

            // ২. সিটগুলোর স্ট্যাটাস 'BOOKED' করা (বুকিং আইডির ওপর ডিপেন্ড না করে সরাসরি আইডি ধরে)
            if (updatedBooking.seats && updatedBooking.seats.length > 0) {
              const seatIds = updatedBooking.seats.map(seat => seat.id);
              
              await tx.seat.updateMany({
                where: {
                  id: { in: seatIds }
                },
                data: {
                  status: SeatStatus.SOLD, // যদি আপনার এনামে SOLD থাকে তবে SeatStatus.SOLD দিন
                },
              });
            }

            console.log(`✅ Success: Booking ${bookingId} successfully marked as CONFIRMED and PAID in DB!`);
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
            
            // সিটগুলো রিলিজ করার জন্য প্রথমে বুকিংয়ের সিটগুলো তুলে আনা
            const bookingWithSeats = await tx.booking.findUnique({
              where: { id: bookingId },
              include: { seats: true }
            });

            // বুকিং স্ট্যাটাস ক্যানসেল করা
            await tx.booking.update({
              where: { id: bookingId },
              data: {
                status: BookingStatus.CANCELLED,
                paymentStatus: PaymentStatus.FAILED,
              },
            });

            // সিট আবার সবার জন্য এভেইলেবল (AVAILABLE) করে দেওয়া
            if (bookingWithSeats?.seats && bookingWithSeats.seats.length > 0) {
              const seatIds = bookingWithSeats.seats.map(seat => seat.id);
              await tx.seat.updateMany({
                where: { id: { in: seatIds } },
                data: {
                  status: SeatStatus.AVAILABLE,
                  bookingId: null,
                },
              });
            }
          });
          console.log(`❌ Cancelled: Booking ${bookingId} marked as CANCELLED due to expiration.`);
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