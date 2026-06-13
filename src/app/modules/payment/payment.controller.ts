import { Request, Response } from "express";
import Stripe from "stripe";
import { PaymentService } from "./payment.service"; // আপনার সার্ভিস ফাইলের পাথ

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
});

const handleStripeWebhookEvent = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // ১. ভেরিফিকেশন চেক
  if (!sig || !endpointSecret) {
    console.error("❌ Missing stripe-signature header or webhook endpoint secret!");
    return res.status(400).json({
      success: false,
      message: "Missing stripe-signature header or webhook endpoint secret!",
    });
  }

  let event: Stripe.Event;

  try {
    // ২. Raw Body ভেরিফিকেশন (এক্সপ্রেস মিডলওয়্যার থেকে পাওয়া বাফার ব্যবহার করছি)
    const rawBody = req.body; 
    
    // স্ট্রাইপের অফিশিয়াল ভেরিফিকেশন
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error(`❌ Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ৩. স্ট্রাইপ ইভেন্ট প্রসেসিং
  try {
    // ইভেন্টটি সার্ভিসে পাঠানো হচ্ছে
    await PaymentService.handleStripeWebhookEvent(event);
    
    // স্ট্রাইপকে পজিটিভ রেসপন্স (এটি খুবই জরুরি)
    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("🚨 Error processing webhook event in controller:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error during webhook processing",
    });
  }
};

export const PaymentControllers = {
  handleStripeWebhookEvent,
};