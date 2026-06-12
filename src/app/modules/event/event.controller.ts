import { Request, Response } from 'express';

import { eventServices } from './event.service';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';

const createEvent = catchAsync(async (req: Request, res: Response) => {
  // 👈 জাদুকরী লাইন: Zod বা Auth যদি req.body ডিরেক্ট চেঞ্জও করে, মুল্টারের আসল ডাটা req.body.data তেই থাকে
  if (req.body && req.body.data) {
    req.body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
  }

  // এবার একদম পারফেক্ট অবজেক্ট সার্ভিস ফাইলে পাস হবে
  const result = await eventServices.createEvent(req); 

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Event created successfully!',
    data: result,
  });
});

const getSingleEvent = catchAsync(async (req: Request, res: Response) => {
  const { _id } = req.params;
  const result = await eventServices.getSingleEvent(_id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Event details fetched successfully!',
    data: result,
  });
});

export const eventControllers = {
  createEvent,
  getSingleEvent,
};