import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchParty - Watch YouTube Together, In Sync",
  description: "Watch YouTube videos in real time with your friends. Synchronized playback, rooms, and role-based permissions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton+SC&family=Gasoek+One&family=Modak&family=Mouse+Memoirs&family=Outfit:wght@400;500;600;700;800;900&family=Ranchers&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-outfit antialiased selection:bg-red-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
