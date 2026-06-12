import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import config from "../../config";
import ApiError from "../errors/ApiError";
import { jwtHelper } from "../helpers/jwtHelper";


const auth = (...roles: string[]) => {
    return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
        try {
            const token = req.headers.authorization || req.cookies.accessToken;
            console.log({ token }, "from auth guard");

            if (!token) {
                throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!")
            }

            const session = jwtHelper.verifyToken(token, config.jwt.jwt_secret as Secret)
            
            console.log({ session }, "from auth guard after verification");

           req.user = {
      userId: session.userId,
      name: session.name,
      email: session.email,
      role: session.role
    
    };

            if (roles.length && !roles.includes(session.role)) {
                throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!")
            }
            next()
        }
        catch (err) {
            next(err)
        }
    }
};

export default auth;