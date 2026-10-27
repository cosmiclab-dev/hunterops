// Salary text to a range in lakh rupees per annum (LPA), for the Grill's salary fit.
// Handles "₹15-20 LPA", "18 LPA", "INR 12,00,000 – 18,00,000", "USD 80,000 - 120,000",
// "$90k-$120k", "1.5 Cr" and monthly figures. Foreign currencies are converted at
// fixed approximate rates; the Grill says so when it uses them.
export type SalaryRange = { min: number; max: number; approx: boolean };

const FX_TO_INR: Record<string, number> = { INR: 1, USD: 84, EUR: 91, GBP: 108, SGD: 63, AED: 23, CAD: 61, AUD: 55 };

function currencyOf(text: string): string {
  if (/₹|\binr\b|\brs\.?\b|\blpa\b|\blakh|\blac\b|\bcr(ore)?\b/i.test(text)) return 'INR';
  if (/\$|\busd\b/i.test(text)) return /\bsgd\b|s\$/i.test(text) ? 'SGD' : /\bcad\b/i.test(text) ? 'CAD' : /\baud\b/i.test(text) ? 'AUD' : 'USD';
  if (/€|\beur\b/i.test(text)) return 'EUR';
  if (/£|\bgbp\b/i.test(text)) return 'GBP';
  if (/\baed\b/i.test(text)) return 'AED';
  return 'INR';
}

const NUM = /(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|l|lpa|lakhs?|lacs?|cr|crores?|m|mn)?\b/gi;

export function parseSalaryLpa(raw: string | null | undefined): SalaryRange | null {
  const text = String(raw || '').replace(/\s+/g, ' ');
  if (!/\d/.test(text)) return null;
  const cur = currencyOf(text);
  const monthly = /per month|\/\s*month|monthly|\bpm\b|p\.m\./i.test(text);
  const values: number[] = [];
  for (const m of text.matchAll(NUM)) {
    let n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n === 0) continue;
    const unit = (m[2] || '').toLowerCase();
    // Bare small numbers such as "3 days" or "2024" are not salaries.
    if (!unit && n < 1000 && !/lpa|lakh|lac|ctc/i.test(text)) continue;
    if (!unit && n >= 1900 && n <= 2100 && !/,/.test(m[1])) continue;
    if (unit === 'k') n *= 1e3;
    else if (unit === 'm' || unit === 'mn') n *= 1e6;
    else if (/^(l|lpa|lakhs?|lacs?)$/.test(unit)) n *= 1e5;
    else if (/^cr/.test(unit)) n *= 1e7;
    else if (!unit && n < 1000) n *= 1e5; // "15-20 LPA": the unit follows the second number only
    values.push(n);
  }
  if (!values.length) return null;
  // "15 - 20 LPA": give the first number the unit of the second.
  if (values.length >= 2 && values[0] < 1000 && values[1] >= 1e5) values[0] *= 1e5;
  const yearly = values.map((v) => (monthly ? v * 12 : v) * (FX_TO_INR[cur] ?? 1) / 1e5);
  const lpa = yearly.filter((v) => v >= 1 && v <= 2000);
  if (!lpa.length) return null;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { min: r(Math.min(...lpa.slice(0, 2))), max: r(Math.max(...lpa.slice(0, 2))), approx: cur !== 'INR' };
}

// The first salary-looking phrase in a job description.
export function salaryFromText(text: string | null | undefined): string | null {
  const m = String(text || '').match(/(?:salary|ctc|compensation|pay(?: range)?|package)[^.\n]{0,20}?((?:₹|inr|rs\.?|\$|usd|€|£)?\s*\d[\d,.]*\s*(?:k|l|lpa|lakhs?|lacs?|cr)?\s*(?:-|–|to)\s*(?:₹|inr|rs\.?|\$|usd|€|£)?\s*\d[\d,.]*\s*(?:k|l|lpa|lakhs?|lacs?|cr)?(?:\s*(?:per annum|p\.?a\.?|per year|\/\s*year|per month|lpa))?)/i)
    || String(text || '').match(/(\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*(?:lpa|lakhs? per annum))/i);
  return m ? m[1].trim().replace(/[.,;:]+$/, '') : null;
}
