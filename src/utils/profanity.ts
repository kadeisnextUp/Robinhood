import filter from 'leo-profanity';

export function isProfane(value: string): boolean {
  return filter.check(value);
}
