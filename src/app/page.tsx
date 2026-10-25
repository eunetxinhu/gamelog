import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// Enquanto não existe landing page, a raiz leva ao feed (ou ao login).
export default async function Home() {
  redirect((await getCurrentUser()) ? "/feed" : "/login");
}
