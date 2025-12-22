import rateLimit from "express-rate-limit";

export const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute
  message: "Too many verification attempts. Please try again in a few minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute
  message: "Too many password reset attempts. Please try again in a few minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});

export const emailResendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 requests per minute
  message: "Please wait before requesting another email.",
  standardHeaders: true,
  legacyHeaders: false,
});
