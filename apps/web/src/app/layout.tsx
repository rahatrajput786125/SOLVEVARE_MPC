// import type { Metadata } from "next";
// import { Inter } from "next/font/google";
// import "./globals.css";
// import { Providers } from "@/components/providers";

// const inter = Inter({ subsets: ["latin"] });

// export const metadata: Metadata = {
//   title: { default: "MPC — Mass Page Creator", template: "%s | MPC" },
//   description: "Programmatic SEO at scale. Generate thousands of pages from your data.",
// };

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="en" suppressHydrationWarning>
//       <body className={inter.className}>
//         <Providers>{children}</Providers>
//       </body>
//     </html>
//   );
// }

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "MPC — Mass Page Creator",
    template: "%s | MPC",
  },
  description:
    "Programmatic SEO at scale. Generate thousands of pages from your data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}