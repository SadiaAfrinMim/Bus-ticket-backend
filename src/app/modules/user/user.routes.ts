import express, { NextFunction, Request, Response } from 'express'

import { UserValidation } from './user.validation';

import auth from '../../middlewares/auth';
import { UserController } from './user.controller';
import { fileUploader } from '../../helpers/fileUploader';
import { Role } from '@prisma/client';



const router = express.Router();

router.get(
    "/",
    auth(Role.ADMIN),
    UserController.getAllFromDB
)

router.get(
    '/me',
    auth(Role.ADMIN, Role.USER),
    UserController.getMyProfile
)

router.post(
    "/create-admin",
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = UserValidation.registerSchema.parse(JSON.parse(req.body.data))
        return UserController.createAdmin(req, res, next)
    }
)

router.post(
    "/create-user",
  
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = UserValidation.registerSchema.parse(JSON.parse(req.body.data))
        return UserController.createUser(req, res, next)
    }
);



router.patch(
    '/:id/status',
    auth(Role.ADMIN),
    UserController.changeProfileStatus
);

router.patch(
    "/update-my-profile",
    auth(Role.ADMIN, Role.USER),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = JSON.parse(req.body.data)
        return UserController.updateMyProfie(req, res, next)
    }
);

export const userRoutes = router;