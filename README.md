# Campus Order

Order-ahead web app for Safal at NSUT. Students pay by UPI through Razorpay and collect with a pickup code. Safal manages orders from a dashboard at `/shop`.

## How an order works

1. The student picks items and a pickup time (now, or up to 60 minutes ahead) and pays by UPI.
2. The money is taken straight away and the order goes to Safal's dashboard. There is no accept step.
3. Safal taps **Mark ready** (optional) and hands the order over when the student shows their 4-digit code.
4. Safal can cancel an order it can't make; the student is refunded in full.
5. Students can cancel only before paying. Orders that aren't collected aren't refunded.
6. Leftovers are closed at midnight: orders never marked ready are refunded, ready but uncollected ones are not.

## Run locally

Needs a free [Supabase](https://supabase.com) project (region: Mumbai) and the keys listed in `.env.example`.

```
npm install
cp .env.example .env.local   # then fill in DATABASE_URL, Google and Razorpay test keys
npm run db:setup             # creates the tables and loads Safal's menu (safe to re-run)
npm run shop:passcode        # passcode for /shop
npm run dev                  # http://127.0.0.1:3000
```

Without Razorpay keys, development uses a simulated payment. Only test keys are accepted for now.

## Deploy (Vercel + Supabase, free tiers)

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). `vercel.json` runs it in Mumbai (`bom1`), next to the database.
2. Add the environment variables from `.env.example`: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, plus `SESSION_SECRET` (a long random string) and `APP_URL` (the Vercel address).
3. In Google Cloud, add `https://<your-app>.vercel.app/api/auth/google/callback` as an authorised redirect URI.
4. Optional: in Razorpay → Webhooks, point `https://<your-app>.vercel.app/api/webhooks/razorpay` at the
   `payment.authorized`, `payment.captured` and `refund.processed` events, and set `RAZORPAY_WEBHOOK_SECRET`.

## Google sign-in

Students sign in with their NSUT Google account (NSUT email runs on Google Workspace). Only verified
`@nsut.ac.in` Workspace accounts in the undergraduate format (`first.last.ug23@nsut.ac.in`) get in.
There is no other way to sign in: without Google keys the sign-in page says sign-in isn't set up.

To set it up, in [Google Cloud console](https://console.cloud.google.com/):

1. Create a project, then open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the
   app name and support email, and add only the `openid`, `email` and `profile` scopes.
   While the app is in *Testing*, add the accounts that may sign in as test users. Publish it when ready;
   these basic scopes don't need Google's verification.
2. Open **Credentials → Create credentials → OAuth client ID**, type **Web application**.
   Add the authorised redirect URI `http://127.0.0.1:3000/api/auth/google/callback`
   (and `https://<your domain>/api/auth/google/callback` for production).
3. Put the client ID and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart `npm run dev`.

In production also set `SESSION_SECRET` (a long random string) and `APP_URL` (the public address).
NSUT's Google Workspace admins can block third-party apps; if students see "access blocked", the app needs their approval.

## Not ready for real students

- Google sign-in needs a Google Cloud OAuth client (see above) before anyone can sign in outside development.
- Razorpay's automatic refund for uncaptured payments didn't happen within the 15 minutes requested in test mode. This now only affects payments that arrive after an order expired.
- Refunds need enough balance in the Razorpay account.
- UPI isn't enabled on the test account yet, so test mode also allows cards and netbanking.
- Free tiers: Supabase pauses a project after a week without use; open the dashboard to wake it.
