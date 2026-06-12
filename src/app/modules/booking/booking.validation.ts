import { z } from 'zod';

const createBookingZodSchema = z.object({
  body: z.object({
    eventId: z
      .string({
        message: 'Event ID is required',
      })
      .uuid({ message: 'Invalid Event ID format. Must be a valid UUID' }),
    
    seatIds: z
      .array(
        z.string().uuid({ message: 'Each Seat ID must be a valid UUID' }),
        { message: 'Seat IDs are required' }
      )
      .min(1, { message: 'At least one seat must be selected to book' }),
    
    paymentMethod: z
      .enum(['CARD', 'BKASH', 'STRIPE', 'ONLINE'], {
        message: 'Invalid payment method selected',
      })
      .optional(),
    
    customerName: z
      .string({
        message: 'Customer name is required for billing',
      })
      .min(2, { message: 'Name should be at least 2 characters long' }),
    
    customerEmail: z
      .string({
        message: 'Customer email is required for ticket delivery',
      })
      .email({ message: 'Invalid email address format' }),
    
    customerPhone: z
      .string({
        message: 'Customer phone number is required for verification',
      })
      .min(11, { message: 'Phone number must be at least 11 digits long' }),
  }),
});

// কোনো বুকিংয়ের স্ট্যাটাস আপডেট করার প্রয়োজন হলে অ্যাডমিনের জন্য ভ্যালিডেশন (যেমন: ম্যানুয়াল ক্যান্সেল বা রিফান্ড)
const updateBookingStatusZodSchema = z.object({
  body: z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED']).optional(),
    paymentStatus: z.enum(['UNPAID', 'PAID', 'FAILED']).optional(),
  }),
});

export const BookingValidations = {
  createBookingZodSchema,
  updateBookingStatusZodSchema,
};