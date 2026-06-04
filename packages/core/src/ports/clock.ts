/** The single source of "now" for domain code. Always UTC. */
export interface Clock {
  now(): Date;
}
