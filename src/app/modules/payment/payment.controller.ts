import { Request, Response } from "express";
import catchAsync from "../../shared/catchAsync";
import { stripe } from "../../helpers/stripe";
import { PaymentService } from "./payment.service";

const handleStripeWebhookEvent = catchAsync(async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    
    // 💡 .env থেকে নিবে, না থাকলে আপনার লোকাল কি ব্যবহার করবে
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_a29f737ec4e63561dd8d0e1428e79e36b0d7574674333ac49a626c045cda53e6";

    let event;
    try {
        // স্ট্রাইপ থেকে আসা RAW বডি এবং সিগনেচার ভেরিফাই করা হচ্ছে
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
        console.error("⚠️ [Stripe Webhook Error] Signature verification failed:", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // ব্যাকগ্রাউন্ডে ডাটাবেজ আপডেটের কাজ করার জন্য সার্ভিস কল করা হলো
    await PaymentService.handleStripeWebhookEvent(event);

    // স্ট্রাইপকে সাকসেস রেসপন্স পাঠানো
    res.status(200).json({ received: true });
});

export const PaymentController = {
    handleStripeWebhookEvent
};