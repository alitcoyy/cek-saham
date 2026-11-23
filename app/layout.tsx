import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const font = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font' });

export const metadata: Metadata = { title: 'Cek Kesehatan Saham' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
