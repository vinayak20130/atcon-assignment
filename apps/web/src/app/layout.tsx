import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Northwind ATS',
  description: 'Applicant tracking and candidate pipeline management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
