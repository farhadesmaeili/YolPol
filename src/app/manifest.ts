import type {MetadataRoute} from "next";

import enMessages from "@/i18n/messages/en.json";
import {siteConfig} from "@/shared/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.identity.brandName.toUpperCase(),
    short_name: siteConfig.identity.brandName.toUpperCase(),
    description: enMessages.Metadata.description,
    start_url: "/",
    background_color: "#f7f6f1",
    theme_color: "#4f5d2f",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
