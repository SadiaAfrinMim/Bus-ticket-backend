
import ApiError from '../../errors/ApiError';

import axios from 'axios';

import { TBookingPayload } from './booking.interface';
import { prisma } from '../../shared/prisma';
import { stripe } from '../../helpers/stripe';


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

    // ৪. বুকিং রেকর্ড তৈরি (নতুন ডাটাবেজ স্কিমা অনুযায়ী)
    const newBooking = await tx.booking.create({
      data: {
        userId,
        eventId,
        totalAmount: String(totalAmount),
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // ১০ মিনিট লক
      },
    });

    // ৫. সাময়িকভাবে সিটগুলো লক (LOCKED) করা
    await tx.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: 'LOCKED', bookingId: newBooking.id },
    });

    // ⚡ ৬. স্ট্রাইপ পেমেন্ট গেটওয়ে (Stripe Checkout Session) কল করা
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        // পেমেন্ট সফল বা ক্যানসেল হলে ইউজারকে ফ্রন্টএন্ডের (CLIENT_URL) পেজে পাঠাবে
        success_url: `${process.env.CLIENT_URL}/payment-success?bookingId=${newBooking.id}&sessionId={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/cart`,
        customer_email: customerEmail,
        client_reference_id: newBooking.id, // ট্র্যাকিংয়ের জন্য বুকিং আইডি পাস করা হলো
        line_items: [
          {
            price_data: {
              currency: 'bdt',
              product_data: {
                name: `Seat Booking for ${event.title || 'Event'}`,
                description: `Seats: ${seatIds.length} seat(s) reserved.`,
              },
              unit_amount: eventPrice * 100, // সেন্টে কনভার্ট করার জন্য ১০০ দিয়ে গুণ
            },
            quantity: seatIds.length,
          },
        ],
      });

      if (session.url) {
        // 🎯 জাদুকরী পরিবর্তন: নতুন আলাদা 'Payment' টেবিলে একটি PENDING রেকর্ড তৈরি করা হচ্ছে
        // স্ট্রাইপের সেশন আইডি (session.id) কে আপাতত ইউনিক 'transactionId' হিসেবে ট্র্যাক করছি
        await tx.payment.create({
          data: {
            bookingId: newBooking.id,
            transactionId: session.id, 
            paymentMethod: paymentMethod === 'STRIPE' ? 'STRIPE' : 'ONLINE',
            status: 'PENDING',
            amount: totalAmount,
            currency: 'BDT',
            paymentDetails: JSON.parse(JSON.stringify(session)), // সেশনের পুরো অবজেক্ট ব্যাকআপ রাখা হলো
          },
        });

        // বুকিং মডেলে paymentUrl আপডেট করে দেওয়া (ফ্রন্টএন্ডে রিডাইরেক্টের সুবিধার জন্য)
        const updatedBooking = await tx.booking.update({
          where: { id: newBooking.id },
          data: { paymentUrl: session.url },
        });

        return {
          booking: updatedBooking,
          paymentUrl: session.url, // ফ্রন্টএন্ডে পাঠানোর পেমেন্ট লিংক
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

  // যদি ইউজার ADMIN না হয়, তবে সে শুধু নিজের বুকিং দেখতে পাবে
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

// ৩. নির্দিষ্ট একটি বুকিং দেখা (সিকিউরিটি চেক সহ)
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

// ৪. অ্যাডমিন কর্তৃক ম্যানুয়ালি বুকিং স্ট্যাটাস আপডেট করা
const updateBookingStatusInDB = async (bookingId: string, payload: { status?: any; paymentStatus?: any }) => {
  return await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new ApiError(404, 'Booking not found!');

    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: payload,
    });

    // যদি অ্যাডমিন বুকিং CANCELLED করে দেয়, তবে সিটগুলো আবার AVAILABLE করতে হবে
    if (payload.status === 'CANCELLED') {
      await tx.seat.updateMany({
        where: { bookingId: bookingId },
        data: { status: 'AVAILABLE', bookingId: null },
      });
    }

    return updatedBooking;
  });
};

// ৫. পেমেন্ট সাকসেস হলে গেটওয়ে দ্বারা কলব্যাক
const confirmBookingInDB = async (bookingId: string, paymentId: string, paymentDetails: any) => {
  return await prisma.$transaction(async (tx) => {
    // বুকিং আপডেট
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentId: paymentId,
        paymentDetails: paymentDetails,
      },
    });

    // সিটগুলো বিক্রieuseudo (SOLD) আপডেট
    await tx.seat.updateMany({
      where: { bookingId: bookingId },
      data: { status: 'SOLD' },
    });

    return updatedBooking;
  });
};

// ৬. পেমেন্ট ফেইল হলে গেটওয়ে দ্বারা কলব্যাক
const cancelBookingInDB = async (bookingId: string) => {
  return await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', paymentStatus: 'FAILED' },
    });
    await tx.seat.updateMany({
      where: { bookingId: bookingId },
      data: { status: 'AVAILABLE', bookingId: null },
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