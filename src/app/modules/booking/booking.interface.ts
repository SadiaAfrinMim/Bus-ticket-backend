// প্রিজমা এনুম (Enum) গুলো আপনার স্কিমা অনুযায়ী
export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum PaymentMethod {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  STRIPE = 'STRIPE',
}

// বুকিং তৈরির সময় যে ডাটা প্রয়োজন (Payload)
export type TBookingPayload = {
  eventId: string;
  seatIds: string[];
  paymentMethod?: PaymentMethod;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
};

// ডাটাবেজের বুকিংয়ের সাথে মিল রেখে ইন্টারফেস
export interface IBooking {
  id: string;
  userId: string;
  eventId: string;
  totalAmount: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentUrl?: string | null;
  paymentId?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}