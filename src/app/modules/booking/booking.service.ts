
import ApiError from '../../errors/ApiError';

import axios from 'axios';

import { TBookingPayload } from './booking.interface';
import { prisma } from '../../shared/prisma';
import { stripe } from '../../helpers/stripe';
import { BookingStatus, PaymentStatus, PaymentMethod, SeatStatus } from '@prisma/client';


// ১. বুকিং তৈরি এবং পেমেন্ট গেটওয়ের লিংক জেনারেট করা

const initiateBookingIntoDB = async (userId: string, payload: any) => {
  const { eventId, seatIds, paymentMethod, customerEmail } = payload;

  return await prisma.$transaction(async (tx) => {
    // ১. ইভেন্ট চেক
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError(404, 'Event not found!');

    // ২. সিট চেক
    const seats = await tx.seat.findMany({
      where: { id: { in: seatIds }, eventId: eventId },
    });
    if (seats.length !== seatIds.length) {
      throw new ApiError(400, 'Some selected seats do not exist for this event!');
    }

    const isAnySeatUnavailable = seats.some(seat => seat.status !== 'AVAILABLE');
    if (isAnySeatUnavailable) {
      throw new ApiError(400, 'One or more selected seats are already booked or locked!');
    }

    // ৩. টোটাল প্রাইস হিসাব
    const eventPrice = Number(event.price || 1500);
    const totalAmount = eventPrice * seatIds.length;

    // ৪. বুকিং রেকর্ড তৈরি — BookingStatus: PENDING, PaymentStatus: UNPAID
    const newBooking = await tx.booking.create({
      data: {
        userId,
        eventId,
        totalAmount: String(totalAmount),
        status: BookingStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // ১০ মিনিট লক
      },
    });

    // ৫. সাময়িকভাবে সিটগুলো লক — AVAILABLE → LOCKED
    await tx.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: SeatStatus.LOCKED, bookingId: newBooking.id },
    });

    // ⚡ ৬. স্ট্রাইপ পেমেন্ট গেটওয়ে (Stripe Checkout Session) কল করা
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: `${process.env.CLIENT_URL}/payment-success?bookingId=${newBooking.id}&sessionId={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/cart`,
        customer_email: customerEmail,
        client_reference_id: newBooking.id,
        metadata: { bookingId: newBooking.id },
        line_items: [
          {
            price_data: {
              currency: 'bdt',
              product_data: {
                name: `Seat Booking for ${event.title || 'Event'}`,
                description: `Seats: ${seatIds.length} seat(s) reserved.`,
              },
              unit_amount: eventPrice * 100,
            },
            quantity: seatIds.length,
          },
        ],
      });

      if (session.url) {
        // PaymentStatus: UNPAID → PENDING (স্ট্রাইপ চেকআউট শুরু)
        await tx.payment.create({
          data: {
            bookingId: newBooking.id,
            transactionId: session.id,
            paymentMethod: paymentMethod === 'STRIPE' ? PaymentMethod.STRIPE : PaymentMethod.ONLINE,
            status: PaymentStatus.PENDING,
            amount: totalAmount,
            currency: 'BDT',
            paymentDetails: JSON.parse(JSON.stringify(session)),
          },
        });

        // বুকিং মডেলে paymentUrl আপডেট
        const updatedBooking = await tx.booking.update({
          where: { id: newBooking.id },
          data: { paymentUrl: session.url },
        });

        return {
          booking: updatedBooking,
          paymentUrl: session.url,
        };
      } else {
        throw new ApiError(500, 'Stripe failed to return a checkout URL');
      }
    } catch (error: any) {
      console.error("🚨 Stripe Error Log:", error.message);
      throw new ApiError(500, `Failed to communicate with Stripe Gateway: ${error.message}`);
    }
  }, { maxWait: 5000, timeout: 500000 });
};



const getAllBookingsFromDB = async (userId: string, userRole: string) => {
  let queryFilter = {};

  if (userRole !== 'ADMIN') {
    queryFilter = { userId: userId };
  }

  return await prisma.booking.findMany({
    where: queryFilter,
    include: {
      user: { select: { id: true, name: true, email: true } },
      event: true,
      seats: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};

// ৩. নির্দিষ্ট একটি বুকিং দেখা
const getSingleBookingFromDB = async (bookingId: string, userId: string, userRole: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { event: true, seats: true, user: true },
  });

  if (!booking) throw new ApiError(404, 'Booking not found!');

  if (userRole !== 'ADMIN' && booking.userId !== userId) {
    throw new ApiError(403, 'You do not have permission to view this booking!');
  }

  return booking;
};

// ৪. অ্যাডমিন কর্তৃক ম্যানুয়ালি বুকিং স্ট্যাটাস আপডেট (CANCELLED / REFUNDED)
const updateBookingStatusInDB = async (bookingId: string, payload: { status?: any; paymentStatus?: any }) => {
  return await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new ApiError(404, 'Booking not found!');

    // Conditional: CANCELLED শুধুমাত্র PENDING থেকেই আসতে পারে
    if (payload.status === 'CANCELLED' && booking.status !== BookingStatus.PENDING) {
      throw new ApiError(400, `Cannot cancel booking with status ${booking.status}. Only PENDING bookings can be cancelled.`);
    }

    // Conditional: REFUNDED শুধুমাত্র CONFIRMED থেকেই আসতে পারে
    if (payload.status === 'REFUNDED' && booking.status !== BookingStatus.CONFIRMED) {
      throw new ApiError(400, `Cannot refund booking with status ${booking.status}. Only CONFIRMED bookings can be refunded.`);
    }

    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: payload,
    });

    // CANCELLED হলে সিটগুলো আবার AVAILABLE — LOCKED → AVAILABLE
    if (payload.status === 'CANCELLED') {
      await tx.seat.updateMany({
        where: { bookingId: bookingId },
        data: { status: SeatStatus.AVAILABLE, bookingId: null },
      });
    }

    // REFUNDED হলেও সিটগুলো আবার AVAILABLE — SOLD → AVAILABLE
    if (payload.status === 'REFUNDED') {
      await tx.seat.updateMany({
        where: { bookingId: bookingId },
        data: { status: SeatStatus.AVAILABLE, bookingId: null },
      });
    }

    return updatedBooking;
  });
};

// ৫. পেমেন্ট সাকসেস হলে কলব্যাক — শুধুমাত্র PENDING → CONFIRMED
const confirmBookingInDB = async (bookingId: string, sessionId: string, paymentDetails?: any) => {
  return await prisma.$transaction(async (tx) => {
    const existingBooking = await tx.booking.findUnique({
      where: { id: bookingId },
    });
    if (!existingBooking) throw new ApiError(404, 'Booking not found!');

    // Conditional: শুধুমাত্র PENDING থেকেই CONFIRMED হতে পারে
    if (existingBooking.status !== BookingStatus.PENDING) {
      console.log(`ℹ️ Booking ${bookingId} is ${existingBooking.status}, skipping confirm.`);
      return existingBooking;
    }

    // BookingStatus: PENDING → CONFIRMED, PaymentStatus: UNPAID → PAID
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
      },
      include: { seats: true, payment: true },
    });

    // PaymentStatus: PENDING → PAID
    if (updatedBooking.payment) {
      await tx.payment.update({
        where: { bookingId: bookingId },
        data: {
          status: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.STRIPE,
          transactionId: sessionId,
          paymentDetails: paymentDetails ? JSON.parse(JSON.stringify(paymentDetails)) : undefined,
        },
      });
    }

    // সিটগুলো — LOCKED → SOLD
    if (updatedBooking.seats && updatedBooking.seats.length > 0) {
      const seatIds = updatedBooking.seats.map((seat) => seat.id);
      await tx.seat.updateMany({
        where: { id: { in: seatIds } },
        data: { status: SeatStatus.SOLD },
      });
    }

    return updatedBooking;
  });
};

// ৬. পেমেন্ট ফেইল হলে কলব্যাক — শুধুমাত্র PENDING → CANCELLED
const cancelBookingInDB = async (bookingId: string) => {
  return await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new ApiError(404, 'Booking not found!');

    // Conditional: শুধুমাত্র PENDING থেকেই CANCELLED হতে পারে
    if (booking.status !== BookingStatus.PENDING) {
      console.log(`ℹ️ Booking ${bookingId} is ${booking.status}, skipping cancel.`);
      return booking;
    }

    // BookingStatus: PENDING → CANCELLED, PaymentStatus: UNPAID → FAILED
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED },
    });

    // PaymentStatus: PENDING → FAILED
    await tx.payment.updateMany({
      where: { bookingId: bookingId },
      data: { status: PaymentStatus.FAILED },
    });

    // সিটগুলো — LOCKED → AVAILABLE
    await tx.seat.updateMany({
      where: { bookingId: bookingId },
      data: { status: SeatStatus.AVAILABLE, bookingId: null },
    });
  });
};

export const BookingServices = {
  initiateBookingIntoDB,
  getAllBookingsFromDB,
  getSingleBookingFromDB,
  updateBookingStatusInDB,
  confirmBookingInDB,
  cancelBookingInDB,
};
