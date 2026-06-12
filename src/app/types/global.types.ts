declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: String | undefined;
        name: String | undefined;
        email: String | undefined;
        role: String | undefined | null;
     
      };
    }
  }
}

export {};
