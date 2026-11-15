# HotelNexa

HotelNexa is a responsive hotel-booking application with guest/admin authentication, a hotel directory, property previews, and a Razorpay Test Mode checkout workflow.

## Run locally

1. Configure the backend environment using `Backend/.env.example` as a guide. Keep actual credentials in `Backend/.env`; never commit that file.
2. Start the API:

   ```powershell
   cd Backend
   npm install
   npm run dev
   ```

3. In another terminal, start the frontend:

   ```powershell
   cd Frontend/hotelnexa
   npm install
   npm run dev
   ```

The Vite development server proxies `/api` requests to `http://localhost:5000`. Authentication supports email/password with email OTP verification and Google sign-in/sign-up. No mobile number or SMS provider is required.

For hosted QA, configure these variables in the frontend build environment (Vite embeds `VITE_*` values into the generated site):

- `VITE_API_URL`: backend HTTPS origin when the API is on a different origin; leave empty only when a same-origin reverse proxy forwards `/api` to the backend.
- `VITE_GOOGLE_CLIENT_ID`: same Google Web client ID as backend `GOOGLE_CLIENT_ID`. Add the deployed frontend origin to that OAuth client's authorized JavaScript origins.
- `VITE_PHOTON_URL` and `VITE_OSM_TILE_URL`: optional map-provider URL overrides. Defaults use Photon place lookup and OpenStreetMap tiles; the map keeps its required OpenStreetMap attribution.

Configure backend secrets separately in the host's protected environment-variable panel; do not put secrets in frontend variables. Use `NODE_ENV=production`, `PAYMENT_MODE=test`, and the exact HTTPS frontend origin in backend `FRONTEND_ORIGINS`. Razorpay Test Mode simulates payments; it does not charge or refund real money.

For Google sign-in, create a **Web application** OAuth client in Google Cloud Console. Set the same client ID as `GOOGLE_CLIENT_ID` in `Backend/.env` and `VITE_GOOGLE_CLIENT_ID` in `Frontend/hotelnexa/.env.local` (use the frontend `.env.example` as a template). Add `localhost` and your deployed host to the OAuth client's authorized JavaScript origins. The home page offers Google One Tap after checking for an existing HotelNexa session, and sign-in/sign-up pages show the Google button. Google-verified email accounts are created or linked as guests; admin accounts must continue using administrator email/password sign-in. Restart both development servers after configuring the client ID.

## Authentication

- Guest registration requires email verification and a password of at least 8 characters containing uppercase, lowercase, a digit, and one special character from `@#$%^&*`. Signup and password-reset forms show a live checklist, and the backend enforces the same rule.
- Guests and admins sign in using email/password. Signup, password reset, and account verification use email codes.
- Guest registration always creates a `guest`; there is no public admin signup. Admin sign-in requires the checkbox and an existing database user whose role is `admin`. The API separately protects `/api/auth/admin`.
- To create an admin, create a MongoDB user record with `role: "admin"`, `emailVerified: true`, and a bcrypt-hashed password. Do not store a plaintext password.
- On backend startup, the database connector removes any legacy unique MongoDB index on the retired `phone` field so email-only accounts can be created.
- Sessions use an HttpOnly, SameSite=Lax cookie. For production, serve the frontend and API on the same site, configure exact HTTPS `FRONTEND_ORIGINS`, and use a strong `JWT_SECRET`.

## Test-mode reservations

- Property checkout requires a signed-in guest. Sign-in and guest signup preserve the property route so the guest can resume checkout afterward.
- Before first use, seed hotel admin users and demo room inventory from `Backend` with `npm run seed:hotel-admins` and `npm run seed:hotel-rooms`. Each property starts with one room per 1–4-bed type; hotel admins can add rooms and manage type rates/capacity/amenities.
- Signed-in guests can open **My bookings** from the home-page navigation; staff/admin can review sandbox revenue and daily booked room-nights in the Operations dashboard.
- The frontend requests a server-calculated Razorpay order; it never sends a price or receives the Razorpay secret. Checkout is restricted to `rzp_test_` keys and uses no live-money payment flow.
- The selected property, dates and guest counts are checked against database-backed room inventory before checkout. Payment signatures and captured payment amounts are checked on the API. A MongoDB transaction confirms the reservation only after verification; unique per-night room locks prevent overlapping reservations for the same room.
- Configure newly issued test credentials in the private `Backend/.env` using `Backend/.env.example`. Rotate any secret ever shared in chat or source control. MongoDB must support transactions (Atlas/replica set).
- Directory descriptions, amenities, photos and ratings remain illustrative. Inventory and the hotel-admin-configured rates are demo data, not a live property feed. Checkout holds expire after 30 minutes.
- API routes, the reservation data model, and RBAC report access are documented in `Backend/README.md`.

## Checks

```powershell
npm run lint
npm run build
```
