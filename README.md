# Retailer Resolve

create a glimpse like mvp tool - it needs to be able to connect to multiple retailers, connect to quickbooks as well.perhaps dashboard shows each retailer - clicking into retailer clients can see disputes whether, active or resolved. then they should be able to see alerts or information for each store accorindg to their chargeback policies. they should be able to find supporting documents in one system organized by retailer. and they should be able to dispute the chargeback

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/710a4d9d-8c21-53b5-9c5e-de1866b86823).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploying to Vercel

The project is configured for Vercel out of the box — the build pins nitro's `vercel` preset, and Vercel builds it with `npm run build`.

1. Push this repository to GitHub (Lovable → Project Settings → GitHub sync, or your own remote).
2. In Vercel, **Add New → Project** and import the repository. No framework preset or extra build settings are needed — the defaults (`npm run build`, auto-detected output) work as-is.
3. Before deploying, add the environment variables from `.env.example` in **Settings → Environment Variables** (copy the real values from your Lovable project's backend settings — see `Lovable editor → Project Settings → Backend`):

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`

   Set them for **Production, Preview, and Development**. The `VITE_*` values are baked in at build time, so add them before the first build.
4. Deploy. Deep links and page refreshes work without extra rewrite rules — routing is handled by the app itself.

The backend stays on Lovable Cloud; the Vercel deployment talks to it through the environment variables above.
