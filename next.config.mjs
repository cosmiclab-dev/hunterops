/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Server-only packages that should load from node_modules, not be bundled.
    serverComponentsExternalPackages: ['@prisma/client', 'unpdf', 'mammoth', 'nodemailer', 'docx', 'pdf-lib', '@pdf-lib/fontkit'],
    // Ship the font files the PDF renderer embeds with the serverless functions.
    outputFileTracingIncludes: {
      '/api/**/*': [
        './node_modules/@fontsource/inter/files/inter-latin-{400,600,700}-normal.woff',
        './node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff',
      ],
    },
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};
export default nextConfig;
