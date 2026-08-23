import AuthGate from "./auth-gate";
import { LanguageProvider } from "./language";

export default function Home() {
  return <LanguageProvider><AuthGate /></LanguageProvider>;
}
