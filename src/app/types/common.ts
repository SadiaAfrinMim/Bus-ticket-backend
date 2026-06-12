import { Role } from "@prisma/client";


export type IJWTPayload = {
    email: string;
    role: Role;
}