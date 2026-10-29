import type { Metadata, Viewport } from 'next';
import './globals.css';
import { THEME_INIT } from '@/lib/theme-init';

const DESCRIPTION = '날짜별로 함께 짜는 여행 일정';
const KAKAO_ESCAPE = `(function(){var u=navigator.userAgent;if(!/kakaotalk/i.test(u))return;
location.href='kakaotalk://web/openExternal?url='+encodeURIComponent(location.href);
setTimeout(function(){location.href=/iphone|ipad|ipod/i.test(u)?'kakaoweb://closeBrowser':'kakaotalk://inappbrowser/close';},400);})();`;
export const metadata: Metadata = {
  metadataBase: new URL('https://tripboard-a5d64.web.app'),
  title: '트립보드',
  description: DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '트립보드', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-180.png' },
  // link previews (KakaoTalk, iMessage, Slack …)
  openGraph: { type: 'website', siteName: '트립보드', title: '트립보드', description: DESCRIPTION, url: '/', locale: 'ko_KR',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: '트립보드' }] },
  twitter: { card: 'summary', title: '트립보드', description: DESCRIPTION, images: ['/icons/icon-512.png'] },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#FFFFFF' }, { media: '(prefers-color-scheme: dark)', color: '#000000' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Leave KakaoTalk's in-app browser before anything else loads (it can't install the app or keep a Google login). */}
        <script dangerouslySetInnerHTML={{ __html: KAKAO_ESCAPE }} />
        {/* a forced light/dark theme, before the first paint (lib/theme-init.ts) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
