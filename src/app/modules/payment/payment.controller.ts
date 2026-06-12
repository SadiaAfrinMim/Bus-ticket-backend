import { Request, Response } from "express";
import Stripe from "stripe";
import { PaymentService } from "./payment.service"; // আপনার সার্ভিসের সঠিক পাথটি দিবেন

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
});

const handleStripeWebhookEvent = async (req: Request, res: Response) => {
  // ১. স্ট্রাইপ ড্যাশবোর্ড বা CLI থেকে পাওয়া Webhook Secret Key
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  // ২. স্ট্রাইপ রিকোয়েস্টের হেডার থেকে সিগনেচার তুলে আনা
  const sig = req.headers["stripe-signature"];

  if (!sig || !endpointSecret) {
    return res.status(400).json({
      success: false,
      message: "Missing stripe-signature header or webhook endpoint secret!",
    });
  }

  let event: Stripe.Event;

  try {
    // 🚨 খুবই গুরুত্বপূর্ণ: req.body অবশ্যই Raw Buffer হতে হবে, নরমাল JSON অবজেক্ট না!
    const rawBody = (req as any).rawBody || req.body;
    
    // ৩. স্ট্রাইপের অফিশিয়াল মেথড দিয়ে রিকোয়েস্টটি সত্যি স্ট্রাইপ থেকে এসেছে কিনা তা ভেরিফাই করা
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error(`❌ Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ৪. ভেরিফিকেশন সফল হলে সার্ভিস ফাইল কল করে ডাটাবেজ আপডেট করা
  try {
    // আমরা আগের ধাপে যে সার্ভিস বানিয়েছি সেটি এখানে কল হবে
    await PaymentService.handleStripeWebhookEvent(event);
    
    // ৫. স্ট্রাইপকে একটা সাকসেস রেসপন্স ব্যাক করা (নাহলে স্ট্রাইপ বারবার রিকোয়েস্ট পাঠাতে থাকবে)
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("🚨 Error processing webhook event in controller:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error during webhook processing",
    });
  }
};

export const PaymentControllers = {
   handleStripeWebhookEvent,
};