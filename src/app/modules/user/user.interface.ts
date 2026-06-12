import { Role, UserStatus } from "@prisma/client";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  profilePic?: string | null;
  metaData?: any; // 👈 এই লাইনটি যোগ করুন (যেহেতু এটি একটি Json ফিল্ড)
  createdAt: Date;
  updatedAt: Date;
}