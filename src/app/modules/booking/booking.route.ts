import express from 'express';

import auth from '../../middlewares/auth';
import { BookingValidations } from './booking.validation';

import validateRequest from '../../middlewares/ValidateRequest';
import { Role } from '@prisma/client';
import { BookingControllers } from './booking.controller';

const router = express.Router();

// ১. বুকিং এবং পেমেন্ট প্রসেস শুরু করা (শুধু USER/CUSTOMER পারবে)
router.post(
  '/initiate',
  auth(Role.USER,Role.ADMIN), // শুধুমাত্র USER বা CUSTOMER রোলের জন্য অনুমতি), 
  validateRequest(BookingValidations.createBookingZodSchema),
  BookingControllers.initiateBooking
);

// ২. সব বুকিং দেখা (ADMIN সব দেখবে, USER শুধু নিজেরটা দেখবে)
router.get(
  '/',
  auth(Role.ADMIN, Role.USER), // ADMIN সব দেখবে, USER শুধু নিজেরটা দেখবে
  BookingControllers.getAllBookings
);

// ৩. নির্দিষ্ট একটি বুকিং দেখা 
router.get(
  '/:id',
  auth(Role.ADMIN, Role.USER),
  BookingControllers.getSingleBooking
);

// ৪. অ্যাডমিন কর্তৃক বুকিং স্ট্যাটাস আপডেট (যেমন: ম্যানুয়াল রিফান্ড বা ক্যানসেলেশন)
router.patch(
  '/:id/status',
  auth(Role.ADMIN),
  validateRequest(BookingValidations.updateBookingStatusZodSchema),
  BookingControllers.updateBookingStatus
);

// ৫. পেমেন্ট গেটওয়ের সাকসেস এবং ফেইল কলব্যাক রুট (Browser Redirect)
// 🚨 এখানে auth মিডলওয়্যার দেওয়া যাবে না, কারণ গেটওয়ে ইউজারকে ব্রাউজার থেকে রিডাইরেক্ট করবে (GET request)।
router.get('/payment-success', BookingControllers.paymentVerify);
router.get('/payment-fail', BookingControllers.paymentCancel);

export const BookingRoutes = router;