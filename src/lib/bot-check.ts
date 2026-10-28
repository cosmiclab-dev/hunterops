// Pages that ask for a human check instead of showing content. HunterOps
// treats these as unreadable and never tries to get past them.
export const BOT_CHECK_PATTERNS = [
  /just a moment/i,
  /performing security verification/i,
  /checking your browser before/i,
  /verify you are (a |not a )?human/i,
  /enable javascript and cookies to continue/i,
  /attention required.*cloudflare/i,
];

export const looksLikeBotCheck = (text: string) => BOT_CHECK_PATTERNS.some((re) => re.test(text.slice(0, 4000))) && text.length < 3000;
