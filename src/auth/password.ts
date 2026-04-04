import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, ARGON2_OPTIONS);
};

export const verifyPassword = async (
  passwordHash: string,
  password: string
): Promise<boolean> => {
  return verify(passwordHash, password, ARGON2_OPTIONS);
};
