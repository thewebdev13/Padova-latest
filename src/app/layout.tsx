import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Padova · Travel Operations',
  description: 'Private travel operations and financial workspace',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
