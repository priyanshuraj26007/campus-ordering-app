import { redirect } from "next/navigation";
import { preconnect } from "react-dom";
import { currentEmail } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import FoodArt from "@/components/FoodArt";
import GoogleButton from "@/components/GoogleButton";
import { ThemeMenu } from "@/components/ThemeSwitch";
const ART = ["Mango Shake", "Veg Momos", "Kiwi Mint Mojito", "Masala Maggi", "Cheese Burger", "Anaar Juice", "Masala French Fries", "Blueberry Mojito", "Aloo Paratha"];
// What went wrong, and what to do about it.
const ERRORS: Record<string, string> = {
  not_nsut: "That isn't an NSUT Google account. Choose your @nsut.ac.in account.",
  not_student: "Ordering is open to NSUT undergraduates for now. Use your student account, like first.last.ug23@nsut.ac.in.",
  failed: "Google sign-in didn't finish. Try again.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentEmail()) redirect("/");
  const error = ERRORS[(await searchParams).error ?? ""];
  const google = googleEnabled();
  // Open the connection to Google while the student reads the page, so its sign-in screen appears sooner.
  if (google) preconnect("https://accounts.google.com");
  return <main className="login">
    <div className="corner"><ThemeMenu /></div>
    <div className="login-art" aria-hidden>{ART.map((n) => <FoodArt key={n} name={n} />)}</div>
    <div className="login-form"><h1>Skip the line at <em>Safal</em></h1>
      <p>Order between classes. Pick it up when it&apos;s ready.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {google && <><GoogleButton />
        <p className="muted">Use your NSUT account. We only see your name and email.</p></>}
      {!google && <p role="alert">Sign-in isn&apos;t set up yet.</p>}</div></main>;
}
