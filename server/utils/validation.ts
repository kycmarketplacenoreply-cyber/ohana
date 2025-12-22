export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: "Username is required" };
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return {
      valid: false,
      error: "Username can only contain lowercase letters, numbers, and underscores",
    };
  }

  if (username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" };
  }

  return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }

  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length === 0) {
    return { valid: false, error: "Password is required" };
  }

  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }

  return { valid: true };
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
