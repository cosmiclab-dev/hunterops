// Starter list of company boards that hire recruiters in Bengaluru or remotely.
// Slugs were checked against each ATS's public careers URL; edit in Feed > Sources.
export const SEED_COMPANIES = [
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
  // Lever
  ['Acceldata', 'lever', 'acceldata'],
  ['Paytm', 'lever', 'paytm'],
  ['Hevo Data', 'lever', 'hevodata'],
  ['Meesho', 'lever', 'meesho'],
  ['Weekday', 'lever', 'weekdayworks'],
  ['Sprinto', 'lever', 'sprinto'],
  ['Warner Music Group', 'lever', 'wmg'],
  // Ashby
  ['SentiLink', 'ashby', 'sentilink'],
  ['Rogo', 'ashby', 'rogo'],
  ['Tabs', 'ashby', 'Tabs'],
  ['BJAK', 'ashby', 'bjakcareer'],
  ['Tribe', 'ashby', 'tribe-xyz'],
  ['Bankjoy', 'ashby', 'bankjoy'],
  ['Dedale Intelligence', 'ashby', 'dedale-intelligence'],
  // Workday (host|site)
  ['Takeda', 'workday', 'takeda.wd3.myworkdayjobs.com|External'],
  ['Prudential', 'workday', 'prudential.wd3.myworkdayjobs.com|prudential'],
  ['Availity', 'workday', 'availity.wd1.myworkdayjobs.com|availity_careers_india'],
  ['Applied Materials', 'workday', 'amat.wd1.myworkdayjobs.com|External'],
  ['dentsu', 'workday', 'dentsuaegis.wd3.myworkdayjobs.com|DAN_GLOBAL'],
  ["Levi Strauss & Co.", 'workday', 'levistraussandco.wd5.myworkdayjobs.com|External'],
  ['JLL', 'workday', 'jll.wd1.myworkdayjobs.com|jllcareers'],
  ['Autodesk', 'workday', 'autodesk.wd1.myworkdayjobs.com|Ext'],
];

export async function seedCompanies(sql) {
  const names = SEED_COMPANIES.map((c) => c[0]);
  const types = SEED_COMPANIES.map((c) => c[1]);
  const slugs = SEED_COMPANIES.map((c) => c[2]);
  const rows = await sql`
    INSERT INTO companies (name, ats_type, ats_slug)
    SELECT * FROM unnest(${names}::text[], ${types}::text[], ${slugs}::text[])
    ON CONFLICT (ats_type, ats_slug) DO NOTHING
    RETURNING id`;
  return rows.length;
}
