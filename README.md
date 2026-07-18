# Restaurantliste

Full innlogging med e-post/passord via Supabase Auth. Nøklene ligger allerede i `src/App.jsx`.

## 1. Sett opp databasen
Gå til Supabase → SQL Editor → kjør SQL-koden fra chatten (skjema + policies).

## 2. Sjekk innstillingene for e-postbekreftelse
Supabase → Authentication → Providers → Email.
- Vil du at folk skal kunne logge inn med en gang de oppretter konto (uten å bekrefte e-post først)? Skru **av** "Confirm email".
- Vil du ha bekreftelse på e-post først? La den stå på — appen håndterer begge tilfeller.

## 3. Deploy
1. Last opp hele denne mappen til et GitHub-repo
2. vercel.com → Add New → Project → velg repoet → Deploy

## Lokal testing (valgfritt)
npm install
npm run dev
