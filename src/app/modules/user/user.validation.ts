import { z } from 'zod';

export const registerSchema = z.object({

    name: z
      .string({ message: 'Name is required' }) // string({message}) এর বদলে required_error দেওয়া ভালো
      .min(2, { message: 'Name must be at least 2 characters long' })
      .max(50, { message: 'Name cannot exceed 50 characters' })
      .trim(),
      
    email: z
      .string({ message: 'Email is required' })
      .email({ message: 'Invalid email address' })
      .trim()
      .lowercase(),
      
    password: z
      .string({ message: 'Password is required' })
      .min(8, { message: 'Password must be at least 8 characters long' })
      .max(32, { message: 'Password cannot exceed 32 characters' })
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      }),
      
    // 🎯 যেহেতু শুরুতে বডিতে কোনো URL থাকে না (ফাইল আপলোড হয়), তাই এটাকে অপশনাল করা হলো
    profilePic: z
      .string()
      .url({ message: 'Invalid profile picture URL' })
      .optional()
      .nullable(),

    // 🎯 আপনার ম্যাজিক ফিল্ড metaData এর জন্য এই রুলসটি যোগ করা হলো
    // যেহেতু form-data থেকে আসলে এটি String বা Object দুটোর যেকোনো একটা হতে পারে, তাই z.any() বা z.unknown() ব্যবহার করা সবচেয়ে নিরাপদ
    metaData: z
      .unknown()
      .optional()
      .nullable(),
  });


export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ message: 'Email is required' })
      .email({ message: 'Invalid email address' })
      .trim()
      .lowercase(),
      
    password: z
      .string({ message: 'Password is required' })
      .min(1, { message: 'Password cannot be empty' }),
  }),
});

export const UserValidation = {
   registerSchema,
   loginSchema
};