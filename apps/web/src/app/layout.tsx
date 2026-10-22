import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EventLens',
  description:
    'Understand how people use your product. Self-hosted product analytics.',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
