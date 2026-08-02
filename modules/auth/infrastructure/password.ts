import { compare, hash } from "bcryptjs";

import type { PasswordService } from "../application/auth.ports";

const BCRYPT_COST = 12;

export const passwordService: PasswordService = {
  hash(password) {
    return hash(password, BCRYPT_COST);
  },
  verify(password, passwordHash) {
    return compare(password, passwordHash);
  },
};
