// Starter list of company boards that hire recruiters in Bengaluru or remotely.
// Edit them on the Settings page (Sources).
export const SEED_COMPANIES: [name: string, atsType: string, atsSlug: string][] = [
  // Greenhouse
  ['Figma', 'greenhouse', 'figma'],
  ['Grafana Labs', 'greenhouse', 'grafanalabs'],
  ['CommerceIQ', 'greenhouse', 'commerceiq'],
  ['HackerRank', 'greenhouse', 'hackerrank'],
  ['Fictiv', 'greenhouse', 'fictiv'],
  ['Mitsogo', 'greenhouse', 'mitsogoinc'],
  ['Instawork', 'greenhouse', 'instawork'],
  ['Emergent Labs', 'greenhouse', 'emergentlabsinc'],
  ['NeuraFlash', 'greenhouse', 'neuraflash'],
  // Greenhouse boards with Bengaluru or India roles, checked 2026-10-27
  ['Databricks', 'greenhouse', 'databricks'],
  ['Rubrik', 'greenhouse', 'rubrik'],
  ['Stripe', 'greenhouse', 'stripe'],
  ['Okta', 'greenhouse', 'okta'],
  ['Cloudflare', 'greenhouse', 'cloudflare'],
  ['MongoDB', 'greenhouse', 'mongodb'],
  ['Elastic', 'greenhouse', 'elastic'],
  ['GitLab', 'greenhouse', 'gitlab'],
  ['Twilio', 'greenhouse', 'twilio'],
  ['Druva', 'greenhouse', 'druva'],
  ['Sumo Logic', 'greenhouse', 'sumologic'],
  ['Harness', 'greenhouse', 'harnessinc'],
  ['Netskope', 'greenhouse', 'netskope'],
  ['Pure Storage', 'greenhouse', 'purestorage'],
  ['Samsara', 'greenhouse', 'samsara'],
  ['Toast', 'greenhouse', 'toast'],
  // Lever
  ['Acceldata', 'lever', 'acceldata'],
  ['Paytm', 'lever', 'paytm'],
  ['Hevo Data', 'lever', 'hevodata'],
  ['Meesho', 'lever', 'meesho'],
  ['Weekday', 'lever', 'weekdayworks'],
  ['Warner Music Group', 'lever', 'wmg'],
  ['CRED', 'lever', 'cred'],
  ['Zeta', 'lever', 'zeta'],
  // Ashby
  ['SentiLink', 'ashby', 'sentilink'],
  ['Rogo', 'ashby', 'rogo'],
  ['Tabs', 'ashby', 'Tabs'],
  ['BJAK', 'ashby', 'bjakcareer'],
  ['Tribe', 'ashby', 'tribe-xyz'],
  ['Bankjoy', 'ashby', 'bankjoy'],
  ['Dedale Intelligence', 'ashby', 'dedale-intelligence'],
  // Workday (host|site)
  ['Prudential', 'workday', 'prudential.wd3.myworkdayjobs.com|prudential'],
  ['Availity', 'workday', 'availity.wd1.myworkdayjobs.com|availity_careers_india'],
  ['Applied Materials', 'workday', 'amat.wd1.myworkdayjobs.com|External'],
  ['dentsu', 'workday', 'dentsuaegis.wd3.myworkdayjobs.com|DAN_GLOBAL'],
  ['Levi Strauss & Co.', 'workday', 'levistraussandco.wd5.myworkdayjobs.com|External'],
  ['JLL', 'workday', 'jll.wd1.myworkdayjobs.com|jllcareers'],
  ['Autodesk', 'workday', 'autodesk.wd1.myworkdayjobs.com|Ext'],
];

// Boards that stopped answering; paused on existing databases.
export const RETIRED_COMPANIES: [atsType: string, atsSlug: string][] = [
  ['lever', 'sprinto'],
  ['workday', 'takeda.wd3.myworkdayjobs.com|External'],
];
