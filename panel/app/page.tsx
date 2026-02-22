import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import HomeClient from "./ui-home";

export default async function Home() {
  const session: any = await getServerSession(authOptions);
  const role = (session?.role ?? "viewer") as "gc" | "finance_youth" | "finance_core" | "viewer";
  const email = session?.user?.email || "";
  return <HomeClient role={role} email={email} />;
}
