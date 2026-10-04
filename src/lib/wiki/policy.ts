// The sensitive-page policy, ported from v1 and extended for v2's identity
// rule. A conservative title filter, not a comprehensive classifier.
//   blocked     out of play entirely: shown in the reader as "not in play"
//   no-profile  playable, but never profiled, remembered, hinted or celebrated
import type { LinkPolicy } from "./types";

// ★ CORE-SAFE-1: pages that are never in play, whatever the route.
const BLOCKED = /suicid|self.harm|sexual (assault|violence|abuse)|child abuse|rape\b|genocide|massacre|holocaust|lynch|pogrom|neo.nazi|white suprem|hate crime|terroris|torture|ethnic cleansing|atrocit|war crimes?|crimes against humanity|mass shooting|school shooting|bombings? of|human trafficking|shootings?$|bombings?$|\battacks$/i;

// ★ CORE-SAFE-2: identity topics (gender, sexuality, religion, ethnicity,
// health) plus v1's violence/politics list. Playable, never profiled.
const NO_PROFILE = /religio|christian|islam|muslim|\bjews?\b|jewish|judais|hindu|buddh|sikh|bible|quran|koran|theolog|sexual|gender|transgender|homosexual|bisexual|lesbian|\bgay\b|\blgbt|\bhiv\b|health|disease|disorder|syndrome|cancer|tumou?r|diabet|autis|psychiatr|pregnan|obesity|pandemic|epidemic|famine|tobacco|smoking|politic|election|war\b|wars\b|warfare|invasion|\bbattles?\b|\bsieges?\b|\bcombat|military|army|weapon|munition|firearm|\bguns?\b|\brifles?\b|\bbomb|terror|disaster|accident|death|murder|\bkilling|assassinat|poison|crime|\bprisons?\b|smuggl|\bgangs?\b|\briots?\b|ethnic|\brace \(human|racial|racism|slavery|colonial|refugee|immigra|abortion|methamphetamine|drugs?\b|\bcaste\b/i;

// Descriptions catch identity pages whose titles look harmless ("Diabetes"
// is caught by the title; "Ramadan" is caught here by "Islamic").
const NO_PROFILE_DESCRIPTION = /religio|christian|islamic|muslim|jewish|hindu|buddhist|sikh|deity|\bsaint\b|disease|disorder|syndrome|medical condition|infection|ethnic group|sexual|gender identity|political party/i;

export function policyFor(title: string, description = ""): LinkPolicy {
  if (BLOCKED.test(title)) return "blocked";
  if (NO_PROFILE.test(title) || NO_PROFILE_DESCRIPTION.test(description)) return "no-profile";
  return "play";
}

// Interest text is screened with the same identity list before it is mapped
// to buckets, so "my religion" becomes "no stated interest", not a profile.
export const isSensitiveText = (text: string) => policyFor(text) !== "play" || NO_PROFILE_DESCRIPTION.test(text);
