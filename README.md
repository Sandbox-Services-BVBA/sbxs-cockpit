# SBXS Cockpit

Every dashboard page requires the cockpit password, including `/wall` and
`/kitchen`. `/login` creates the existing 30-day HttpOnly session; the header's
Log out button clears it, including other open tabs on the same origin. Open
dashboards check the session every 30 seconds and on focus.

Set `COCKPIT_PASSWORD` to enable browser access. Without it, the dashboard stays
locked. `COCKPIT_SESSION_SECRET` optionally supplies the signing key; otherwise
it derives from the password and `COCKPIT_API_KEY`. Existing valid sessions keep
working. Never expose these values in client code.

`src/proxy.ts` redirects anonymous pages to login and returns JSON 401 for
anonymous API requests. Every data/control route also checks authorization
before accessing its data source. Only the login/session/logout endpoints,
framework static assets and the named PWA icons/manifest are public. Protected
responses disable caching. Return URLs are restricted to local pages.

The collector and scheduled jobs continue using `Authorization: Bearer` with
`COCKPIT_API_KEY`. Machine-only ingestion/maintenance endpoints keep their
existing bearer requirement. File/log endpoints retain their additional file
access key. No database migration or new production setting is required when
the cockpit password is already configured.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3021](http://localhost:3021) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
