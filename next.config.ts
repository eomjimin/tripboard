import type { NextConfig } from 'next';

// Static export: Firebase Hosting serves the built files from out/; all data goes straight to Firestore.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // dev only: let phones and other machines on the office network open `next dev` by IP
  allowedDevOrigins: ['172.20.*.*', '192.168.*.*', '10.*.*.*'],
};
export default config;
