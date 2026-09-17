# MiniFeed

MiniFeed is a React, Vite, TypeScript and Tailwind social feed backed directly by Firebase Authentication, Cloud Firestore, and Cloud Storage. There is no custom backend.

## Local setup

1. Create a Firebase project and register a Web app.
2. Enable **Email/Password** under Authentication → Sign-in method.
3. Create a Firestore database and Storage bucket.
4. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values from the Firebase Web app configuration.
5. Install and run:

   ```bash
   npm install
   npm run dev
   ```

Firestore stores user documents at `users/{uid}` and posts at `posts/{postId}`. The feed uses a real-time `onSnapshot` listener ordered by `createdAt desc`; the included `firestore.indexes.json` is sufficient for this single-field query. Deploy the included `firestore.rules` and `storage.rules` (Firebase CLI or the Firebase console); they require authentication, restrict writes to the owning user, and validate image uploads. Storage uploads are written under `posts/{uid}/...`.

The profile route is `/profile/{uid}`. The center search field, Friends item, and Contacts list are intentionally UI-only as requested.
