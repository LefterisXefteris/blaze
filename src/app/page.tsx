import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import "./home.css";

export const metadata: Metadata = {
  title: "Alex Rivera — Independent product designer",
  description:
    "Placeholder homepage for Alex Rivera, an independent product designer. Rename the owner, role, and sentences.",
};

export default function Page() {
  return <HomePage />;
}
