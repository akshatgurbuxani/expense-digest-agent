import { SignJWT, jwtVerify } from "jose";
import type { Clock, UserId } from "@expense/core";
import { ValidationError } from "@expense/core";

export interface JwtServiceConfig {
  readonly secret: string;
  readonly clock: Clock;
  readonly audience: string;
  readonly defaultTtlSeconds: number;
  readonly label: string;
}

export interface JwtService {
  mint(userId: UserId, opts?: { ttlSeconds?: number }): Promise<string>;
  verify(token: string): Promise<UserId>;
}

export function makeJwtService(cfg: JwtServiceConfig): JwtService {
  const key = new TextEncoder().encode(cfg.secret);
  const defaultTtl = cfg.defaultTtlSeconds;

  return {
    async mint(userId, opts = {}) {
      const ttl = opts.ttlSeconds ?? defaultTtl;
      const now = Math.floor(cfg.clock.now().getTime() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setAudience(cfg.audience)
        .setIssuedAt(now)
        .setExpirationTime(now + ttl)
        .sign(key);
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          audience: cfg.audience,
          algorithms: ["HS256"],
          currentDate: cfg.clock.now(),
        });
        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
          throw new ValidationError(`${cfg.label} token missing subject`);
        }
        return payload.sub as UserId;
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        throw new ValidationError(`invalid ${cfg.label} token`, err);
      }
    },
  };
}
