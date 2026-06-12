import express, { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { eventControllers } from './event.controller';
import { eventValidations } from './event.validation';
import auth from '../../middlewares/auth'; 
import validateRequest from '../../middlewares/ValidateRequest';
import { fileUploader } from '../../helpers/fileUploader';

const router = express.Router();

router.post(
  '/create-event',
  
  fileUploader.upload.single('file'), // ১. ফাইল আপলোড (Postman Key: 'file')
  auth(Role.ADMIN),                   // ২. অ্যাডমিন চেক
  (req: Request, res: Response, next: NextFunction) => {
    // 👈 ৩. জাদুকরী পার্ট: জড ভ্যালিডেশনের ঠিক আগে ডাটা পার্স করে req.body তে পুশ করা
    if (req.body && req.body.data) {
      req.body = JSON.parse(req.body.data);
    }
    next();
  },
  validateRequest(eventValidations.createEventValidationSchema), // ৪. এবার জড পারফেক্ট অবজেক্ট পাবে এবং পাস করবে
  eventControllers.createEvent // ৫. ফাইনাল কন্ট্রোলার
);

router.get('/:id', eventControllers.getSingleEvent);

export const eventRoutes = router;