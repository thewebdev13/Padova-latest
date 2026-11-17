import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir:
    process.env.PADOVA_QA_BUILD === '1'
      ? '.next-qa'
      : process.env.PADOVA_REVIEW_BUILD === '1'
        ? '.next-review'
        : '.next',
  serverExternalPackages: [
    '@electric-sql/pglite',
    'pg',
    '@napi-rs/canvas',
    'pdfjs-dist',
    'tesseract.js',
  ],
  devIndicators: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  experimental: { cpus: 2 },
  outputFileTracingIncludes: { '/*': ['./db/*.sql', './certs/*.crt'] },
  outputFileTracingExcludes: { '/*': ['./.data/**/*', './docs/**/*', './tests/**/*'] },
};
export default config;
