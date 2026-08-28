/**
 * Express-ийн `Request` объектыг өргөтгөнө.
 */

import type { UserRole } from '@shalgalt/shared';

declare global {
  namespace Express {
    interface Request {
      /** Токен/сесс шалгалт давсан шалгалтын дугаар. */
      examId?: string;

      /** Нэвтэрсэн хэрэглэгч (`attachUser` middleware тавина). */
      user?: {
        id: string;
        username: string;
        fullName: string;
        role: UserRole;
        mustChangePassword: boolean;
      };

      /** Одоогийн сессийн түүхий токен (гарахад хэрэгтэй). */
      sessionToken?: string;
    }
  }
}

export {};
