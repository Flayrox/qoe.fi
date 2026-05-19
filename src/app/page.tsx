import { redirect } from "next/navigation";
import { getLanguage } from "@/tolgee/language";

export default async function RootPage() {
  const locale = await getLanguage();
  redirect(`/${locale}`);
}
