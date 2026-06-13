import { Request, Response } from 'express';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { BookingServices } from './booking.service';
import { stripe } from '../../helpers/stripe';

const initiateBooking = catchAsync(async (req: Request, res: Response) => {
  // টোকেন থেকে আইডি নেওয়ার জন্য একটি সেফটি চেক
  const userId = req.user?.userId;
  console.log(userId,"userId")
  if (!userId) {
    throw new Error("User not authenticated!");
  }

  const payload = req.body;
  const result = await BookingServices.initiateBookingIntoDB(userId as string, payload);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Booking initiated successfully! Please complete the payment.',
    data: result,
  });
});

const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  const result = await BookingServices.getAllBookingsFromDB(userId as string, userRole as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings retrieved successfully!',
    data: result,
  });
});

const getSingleBooking = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log(id)
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  const result = await BookingServices.getSingleBookingFromDB(id as string, userId as string, userRole as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Booking details retrieved successfully!',
    data: result,
  });
});

const updateBookingStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;

  const result = await BookingServices.updateBookingStatusInDB(id, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Booking status updated successfully by Admin!',
    data: result,
  });
});

// 🚀 পেমেন্ট ভেরিফিকেশন (ইউজার ব্রাউজার থেকে রিডাইরেক্ট হলে - GET)
const paymentVerify = catchAsync(async (req: Request, res: Response) => {
  const { bookingId, sessionId } = req.query;

  if (!bookingId || !sessionId) {
    return res.redirect(`${process.env.CLIENT_CANCEL_URL || 'http://localhost:3000'}/payment/cancel?reason=missing_params`);
  }

  // Verify the session is actually paid by fetching from Stripe
  const session = await stripe.checkout.sessions.retrieve(sessionId as string);
  if (session.payment_status !== 'paid') {
    console.error(`🚨 Payment not completed for session ${sessionId}`);
    return res.redirect(`${process.env.CLIENT_CANCEL_URL || 'http://localhost:3000'}/payment/cancel?reason=not_paid`);
  }

  // Confirm booking with payment details
  await BookingServices.confirmBookingInDB(
    bookingId as string,
    sessionId as string,
    session
  );

  // আপডেট শেষে ফ্রন্টএন্ডে রিডাইরেক্ট
  res.redirect(`${process.env.CLIENT_SUCCESS_URL || 'http://localhost:3000'}/payment/success?bookingId=${bookingId}`);
});

// পেমেন্ট ক্যানসেল বা ফেইল হলে (GET — ব্রাউজার রিডাইরেক্ট)
const paymentCancel = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.query;

  if (!bookingId) {
    return res.redirect(`${process.env.CLIENT_CANCEL_URL || 'http://localhost:3000'}/payment/cancel?reason=missing_booking`);
  }

  // cancelBookingInDB is conditional — only cancels if PENDING
  await BookingServices.cancelBookingInDB(bookingId as string);
  res.redirect(`${process.env.CLIENT_CANCEL_URL || 'http://localhost:3000'}/payment/cancel`);
});

export const BookingControllers = {
  initiateBooking,
  getAllBookings,
  getSingleBooking,
  updateBookingStatus,
  paymentVerify,   // নতুন নাম
  paymentCancel,   // নতুন নাম
};