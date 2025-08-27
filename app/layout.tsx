// app/layout.tsx（After）
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://owar-ai-2-6hog.vercel.app"),
  title: {
    default: "OwarAI β｜3秒返しを鍛えるお題アプリ",
    template: "%s｜OwarAI",
  },
  description:
    "会話の“切り返し力”を3秒で鍛える。お題に返し、投票で磨き、結果カードで学ぶコミュニティアプリ。",
  keywords: ["切り返し", "会話", "お題", "投票", "結果カード", "リーグ"],
  openGraph: {
    type: "website",
    url: "/",
    siteName: "OwarAI",
    title: "OwarAI β｜3秒返しを鍛えるお題アプリ",
    description:
      "お題→返し→投票→学びのループで、毎日の会話をちょっと上手く。",
    images: [{ url: "/ogp.png", width: 1200, height: 630, alt: "OwarAI" }],
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    site: "@your_handle",
    creator: "@your_handle",
  },
  alternates: { canonical: "https://owar-ai-2-6hog.vercel.app" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
