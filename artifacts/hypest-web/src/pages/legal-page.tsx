import { Link } from "react-router-dom";
import { useAppConfig } from "@/lib/config";

/**
 * Terms, Privacy and Health pages. DRAFT text written by Claude on 24 Oct 2026 for Markus's lawyer to review
 * (Markus approved drafting, not publishing). Every statement describes how the code works today; change the
 * text here when the product changes. Single source for all three pages and their links.
 */
type Section = { h: string; p: string[] };
type Doc = { title: string; sections: Section[] };

const OPERATOR = "Digital Dynamics Group Pty Ltd (ABN 66 687 743 193), Queensland, Australia";
const DRAFT_DATE = "24 October 2026";

function docs(support: string): Record<"terms" | "privacy" | "health", Doc> {
  return {
    terms: {
      title: "Terms of use",
      sections: [
        { h: "Who we are", p: [`Hypest is run by ${OPERATOR} ("we", "us"). Contact: ${support}.`] },
        { h: "Who can use Hypest", p: ["You must be 18 or older. By creating an account you confirm that you are."] },
        { h: "Your account", p: ["Keep your password private. You are responsible for what happens in your account. Tell us at once if you think someone else has used it."] },
        { h: "What Hypest is", p: [
          "Hypest builds general training plans. Each plan is built by fixed rules from a list of exercises, using your answers (goal, experience, days, time, equipment and sore areas).",
          "Hypest's coaches are AI software, not people. They are not doctors, physiotherapists, dietitians or personal trainers. AI-written text can be wrong; the plan's safety rules always come first. Read the Health and safety page before you train.",
        ] },
        { h: "Plans and memberships", p: [
          "You can buy a one-off 4-week plan or a monthly membership. The price, in US dollars, is shown before you pay. Payments are processed by Stripe.",
          "Memberships renew every month until you cancel. You can cancel any time in Me, Manage membership. You keep access until the end of the month you have paid for.",
        ] },
        { h: "Refunds and your consumer rights", p: [
          "Our goods and services come with guarantees that cannot be excluded under the Australian Consumer Law. Nothing in these terms limits those rights or any other rights you have under the law where you live.",
          `If something is not right, email ${support} and we will help.`,
        ] },
        { h: "Fair use", p: ["Do not misuse Hypest: no attempts to break in, overload or copy the service, no automated access, and no abusive messages to coaches. We may limit, suspend or close an account that does."] },
        { h: "Your content", p: ["Your logs and messages stay yours. You let us store and use them only to run Hypest for you, as the Privacy policy describes."] },
        { h: "Our content", p: ["The app, plans, exercise descriptions, coach characters and design belong to us. You may use them for your own training only."] },
        { h: "Liability", p: ["To the extent the law allows, we are not liable for indirect or consequential loss, and our total liability is limited to the amount you paid us in the 12 months before the claim. This does not apply where the law does not allow it, including the Australian Consumer Law."] },
        { h: "Changes", p: ["We may update these terms. If a change matters, we will tell you in the app before it applies. Using Hypest after that means you accept the new terms."] },
        { h: "Law", p: ["These terms are governed by the laws of Queensland, Australia."] },
      ],
    },
    privacy: {
      title: "Privacy policy",
      sections: [
        { h: "Who we are", p: [`${OPERATOR} runs Hypest. Contact for any privacy question: ${support}.`] },
        { h: "What we collect", p: [
          "Account: your email, display name, an optional bio, and your password stored only as a scrambled (hashed) value.",
          "Training: your answers (goal, experience, days, time, equipment, sore or injured areas, kg or lb), your plans, the sets you log, sessions you finish, and safety stops (the warning word, not your full message).",
          "Health check: whether you answered yes to any question, and whether you confirmed a health professional cleared you. We do not keep your single answers.",
          "Coach chat (Coaching members, when switched on): the messages you send and the replies.",
          "Payments: Stripe handles your card; we never see or store card numbers. We keep Stripe's customer and payment references and what you bought.",
          "Security: failed log-in attempts (email and time), kept briefly to block password guessing, and password reset requests.",
          "One cookie keeps you logged in (for up to 30 days). We do not use advertising or tracking cookies.",
        ] },
        { h: "Health information", p: ["Sore or injured areas, your health check result and safety stops are health information. We use them only to build and adjust your plan and to keep you safe, never for advertising, and we do not sell them."] },
        { h: "Who helps us run Hypest", p: [
          "Replit hosts the app and its database. Stripe processes payments. Google delivers our emails. When AI is switched on, Anthropic processes your training answers, plan and chat messages to write your coach's text; we do not send it your name or email.",
          "These providers are mainly in the United States, so your information may be stored or processed outside Australia.",
        ] },
        { h: "Your choices", p: [
          "Download everything we hold about you any time: Me, My data.",
          "Delete your account any time: Me, Delete account. This cancels any membership first, then deletes your training answers, plans, logs, messages and logins. We keep payment records, without your name or email, because the law requires business records.",
          `To correct something, or for any other request, email ${support}.`,
        ] },
        { h: "Complaints", p: [`Email ${support} first. If you are not satisfied, you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).`] },
        { h: "Changes", p: ["We will tell you in the app before an important change to this policy."] },
      ],
    },
    health: {
      title: "Health and safety",
      sections: [
        { h: "Not medical advice", p: ["Hypest gives general training plans. It is not medical advice and does not replace a doctor, physiotherapist or other health professional. Hypest's coaches are AI software."] },
        { h: "Before you start", p: [
          "Before your first plan, Hypest asks a short health check. If you answer yes to any question, check with your doctor or a health professional before you start, and only go ahead once they have cleared you.",
          "If you have a health condition, an injury, are pregnant or have recently given birth, or are unsure whether exercise is safe for you, check with a doctor before you start.",
        ] },
        { h: "While you train", p: [
          "Stop at once if you feel pain, chest pain, dizziness, faintness or unusual shortness of breath.",
          "Tap \"This hurts\" in a session: mild discomfort swaps the exercise for a gentler one; warning signs pause your plan and tell you to see a doctor or physiotherapist before you train again.",
        ] },
        { h: "In an emergency", p: ["Call your local emergency number now: 000 in Australia, 911 in the US and Canada, 111 in New Zealand, 112 in Europe."] },
        { h: "Your call", p: ["You choose how hard to train. Train within your limits; to the extent the law allows, you train at your own risk."] },
      ],
    },
  };
}

export type LegalKind = "terms" | "privacy" | "health";

export function LegalPage({ kind }: { kind: LegalKind }) {
  const config = useAppConfig();
  const doc = docs(config?.support_email ?? "support@hypestapp.com")[kind];
  return (
    <main className="screen-scroll legal">
      <p className="legal-draft" role="note">DRAFT of {DRAFT_DATE}: not yet reviewed by a lawyer.</p>
      <h1 className="screen-title">{doc.title}</h1>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2 className="section-title">{s.h}</h2>
          {s.p.map((t) => <p key={t} className="screen-copy">{t}</p>)}
        </section>
      ))}
      <LegalLinks />
    </main>
  );
}

/** Links to the three pages; used on Me, signup and the landing page. */
export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Legal">
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/health">Health and safety</Link>
    </nav>
  );
}
