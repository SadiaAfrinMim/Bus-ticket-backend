import { z } from 'zod';

const createEventValidationSchema = z.object({
  body: z.object({
    title: z.string({
      message: 'Title is required',
    }).min(3, 'Title must be at least 3 characters long'),
    
    description: z.string().optional(),
    
    dateTime: z.string({
      message: 'Date and time are required',
    }).datetime({ message: 'Invalid datetime format. Use ISO 8601' }),
    
    venue: z.string({
      message: 'Venue is required',
    }),
    
    price: z.number({
      message: 'Price is required',
    }).positive('Price must be a positive number'),
    
    totalRows: z.number({
      message: 'Total rows are required',
    })
    .int('Rows must be an integer')
    .min(1, 'At least 1 row is required')
    .max(10, 'Maximum 10 rows allowed for setup'), // আমাদের rowLetters অ্যারে অনুযায়ী সর্বোচ্চ ১০
    
    seatsPerRow: z.number({
      message: 'Seats per row is required',
    })
    .int('Seats must be an integer')
    .min(1, 'At least 1 seat per row is required')
    .max(20, 'Maximum 20 seats per row allowed'),
  }),
});

export const eventValidations = {
  createEventValidationSchema,
};