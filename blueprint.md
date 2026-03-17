
# Project Blueprint

## Overview

This document outlines the plan and progress for integrating Supabase with the Next.js (App Router) project. The goal is to establish a secure and efficient way to interact with the Supabase backend from both server and client components, featuring a real-time "witnessing" protocol with an anti-inflationary engine.

## Implemented Features

- **Supabase Client Setup (Refactored):**
  - Installed `@supabase/ssr` and `@supabase/supabase-js` packages.
  - Created `.env.local` with placeholder environment variables for Supabase credentials.
  - **`src/utils/supabase/server.ts`**: Implemented a helper that uses `@supabase/ssr`'s `createServerClient` along with Next.js's `cookies` function to create a Supabase client for server-side components and API Routes. This ensures proper cookie-based authentication.
  - **`src/utils/supabase/client.ts`**: Implemented a helper that uses `@supabase/ssr`'s `createBrowserClient` to create a singleton Supabase client for use in client-side components.

- **Backend Logic (Supabase Function):**
  - **`declare_witness`**: Created a transactional PostgreSQL function in Supabase to handle the core "declare" logic. This function atomically performs the following actions, preventing race conditions and double-spending:
    - Acquires a row-level lock on the user's wallet.
    - Validates the user's WP balance.
    - Validates the details of the `witness_call`.
    - Calculates the Narrative Rarity Weight (NRW) score and determines the `scene_label` based on the Python-based NRW engine logic.
    - Decrements the user's `available_wp`.
    - Increments the `participation_count` on the call.
    - Updates the tournament's `total_wp_spent`.
    - Inserts a record into the `witness_log`.

- **API Route (`/api/witness`):**
  - Created a Next.js API Route at `src/app/api/witness/route.ts`.
  - It now uses the new `createClient` from `src/utils/supabase/server.ts` to instantiate an authenticated Supabase client.
  - This route authenticates the user, parses the request, and calls the `declare_witness` Supabase function, passing the required parameters.

- **Frontend (`LiveContextHub.tsx`):**
  - Refactored the component to be a client component (`'use client'`).
  - It now uses the new `createClient` from `src/utils/supabase/client.ts`.
  - Fetches initial data (`teams`, `witness_calls`, `wp_wallets`) from Supabase on component mount and on auth state changes.
  - Implements the `handleDeclare` function, which:
    - Shows a loading state on the button when a declaration is in progress.
    - Sends a POST request to the `/api/witness` endpoint.
    - Updates the local state (user's wallet balance) upon a successful declaration.
    - Displays the result (scene label, NRW score) to the user.

## Next Steps

- [ ] **Real-time Updates:** Implement Supabase Realtime to automatically update the UI when data changes in the database (e.g., another user declares, new calls are added).
- [ ] **UI/UX Polish:** Enhance the visual feedback for loading, success, and error states. Add more detailed information about teams and calls.
- [ ] **Error Handling:** Implement more granular error handling and user feedback on the frontend.
- [ ] **Schema Conformance:** Ensure all TypeScript types (`Team`, `WitnessCall`, `Wallet`) perfectly match the actual Supabase schema.
