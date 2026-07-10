import { prisma } from "@qoe/db/client"
import { TranslationCMS } from "./TranslationCMS"
import frTranslations from "../../../../../../../messages/fr.json"
import enTranslations from "../../../../../../../messages/en.json"

function flattenMessages(obj: any, prefix = ""): Record<string, string> {
  let res: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const keyName = prefix ? `${prefix}.${k}` : k
    if (typeof v === "object" && v !== null) {
      Object.assign(res, flattenMessages(v, keyName))
    } else if (typeof v === "string") {
      res[keyName] = v
    }
  }
  return res
}

export default async function TranslationsPage() {
  const defaultFr = flattenMessages(frTranslations)
  const defaultEn = flattenMessages(enTranslations)

  // Load db overrides
  let initialOverrides = { fr: {}, en: {} }
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: "TRANSLATIONS_OVERRIDE" }
    })
    if (config?.value) {
      initialOverrides = JSON.parse(config.value)
    }
  } catch (e) {
    console.error("Failed to load translation overrides:", e)
  }

  return (
    <TranslationCMS
      defaultFr={defaultFr}
      defaultEn={defaultEn}
      initialOverrides={initialOverrides}
    />
  )
}
