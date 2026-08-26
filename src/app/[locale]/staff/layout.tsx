import type {Metadata} from "next";
import type {ReactNode} from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {index: false, follow: false, nocache: true},
};

export default function StaffRootLayout({children}: Readonly<{children: ReactNode}>) {
  return children;
}
