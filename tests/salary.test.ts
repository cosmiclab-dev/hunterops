import { describe, expect, it } from 'vitest';
import { parseSalaryLpa, salaryFromText } from '@/lib/salary';

describe('salary parsing (Grill salary fit)', () => {
  it('reads lakh-per-annum ranges', () => {
    expect(parseSalaryLpa('₹15-20 LPA')).toEqual({ min: 15, max: 20, approx: false });
    expect(parseSalaryLpa('18 LPA')).toEqual({ min: 18, max: 18, approx: false });
    expect(parseSalaryLpa('12 - 18 lakhs per annum')).toEqual({ min: 12, max: 18, approx: false });
  });
  it('reads rupee amounts in Indian digit grouping', () => {
    expect(parseSalaryLpa('INR 12,00,000 – 18,00,000')).toEqual({ min: 12, max: 18, approx: false });
    expect(parseSalaryLpa('1.2 Cr')).toEqual({ min: 120, max: 120, approx: false });
  });
  it('converts foreign currency and monthly pay, marked approximate', () => {
    const usd = parseSalaryLpa('USD 80,000 - 120,000');
    expect(usd?.approx).toBe(true);
    expect(usd?.min).toBeCloseTo(67.2, 0);
    expect(parseSalaryLpa('$90k-$120k')?.max).toBeCloseTo(100.8, 0);
    expect(parseSalaryLpa('₹1,50,000 per month')).toEqual({ min: 18, max: 18, approx: false });
  });
  it('ignores text without pay', () => {
    expect(parseSalaryLpa(null)).toBeNull();
    expect(parseSalaryLpa('3 days in office since 2024')).toBeNull();
  });
  it('finds a pay phrase inside a JD', () => {
    expect(salaryFromText('Great team.\nCTC: 24-30 LPA plus bonus')).toMatch(/24-30 LPA/);
    expect(salaryFromText('Compensation: ₹20,00,000 - ₹28,00,000 per annum')).toMatch(/20,00,000/);
    expect(salaryFromText('Hybrid. CTC 22-30 LPA.')).toBe('22-30 LPA');
    expect(salaryFromText('No numbers here')).toBeNull();
  });
});
