import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mevin — Designer · Editor · Developer',
  description:
    'Portfolio of Mevin — Designer, Video Editor, and Web Developer.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton+SC&family=Antonio:wght@100..700&family=Just+Me+Again+Down+Here&family=Sedgwick+Ave+Display&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
