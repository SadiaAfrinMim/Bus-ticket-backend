import express from 'express';
import { userRoutes } from '../modules/user/user.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { eventRoutes } from '../modules/event/event.route';
import { BookingRoutes } from '../modules/booking/booking.route';



const router = express.Router();

router.get('/test', (req, res) => {
  res.json({
    message: "TickX API is working!",
  });
});


const moduleRoutes: any[] = [
  {
    path: '/user',
    route: userRoutes
  },
  {
    path: '/auth',
    route: authRoutes
  },
  {
    path: '/event',
    route: eventRoutes
  },
  {
    path: '/bookings', 
    route: BookingRoutes 
  },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));

export default router;