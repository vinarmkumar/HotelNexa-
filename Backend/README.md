# HotelNexa API

## Razorpay test checkout

The booking workflow uses Razorpay **Test Mode only**. The API rejects any key ID that does not start with `rzp_test_`; the key secret stays on the server and is never returned to the frontend. No live credentials or real-payment path are supported.

### Configure

1. Rotate any test secret that has been shared in chat, tickets, screenshots, or source control.
2. Set all local credentials in private `Backend/.env`; the example file contains placeholders only. Do not copy real values into source control.
3. Keep `Backend/.env` out of source control. Hosting providers generally use a protected environment-variable/secrets panel rather than a checked-in `.env` file.
4. Use MongoDB Atlas or another replica-set deployment. Reservation creation and payment confirmation use MongoDB transactions, and the API creates the unique room-night indexes before listening.
5. For hosted QA, configure these backend environment variables:
   - Always required: `NODE_ENV=production`, `PAYMENT_MODE=test`, `PORT` (if required by the host), `MONGO_URI`, a random `JWT_SECRET` of at least 32 characters, and the exact HTTPS `FRONTEND_ORIGINS`.
   - Required for enabled integrations: `RAZORPAY_KEY_ID` beginning with `rzp_test_`, `RAZORPAY_KEY_SECRET`, `BREVO_API_KEY`, verified `BREVO_SENDER_EMAIL`, `GOOGLE_CLIENT_ID`, and `GEMINI_API_KEY`.
   - Optional, only for the image-upload script: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
   The backend checks the production settings at startup and refuses live Razorpay keys. Live payments are not supported.
6. Configure the frontend build variables as described in `Frontend/hotelnexa/.env.example`; `VITE_GOOGLE_CLIENT_ID` must match `GOOGLE_CLIENT_ID`, and the deployed origin must also be authorized in Google Cloud Console.
7. Seed the hotel-admin accounts and initial room inventory:

   ```powershell
   cd Backend
   npm run seed:hotel-admins
   npm run seed:hotel-rooms
   ```

   The room seeder is repeatable, creates one initial room for each 1–4-bed type at every directory hotel, and maps existing reservation and room-night records to those rooms.
8. Start the API and frontend using the repository run instructions. Booking requires a signed-in guest.

### Checkout behavior

- The client sends hotel ID, room type, stay dates, guests/child ages, and bed count. The server validates the stay (future dates, maximum 30 nights, guest-to-bed match), checks the hotel against the shared directory, and uses the hotel's stored room-type rate.
- Room types and individual rooms are stored in MongoDB. The repeatable room seeder creates one initial room for each 1–4-bed type at every hotel; hotel admins can create more rooms/types, edit capacity, amenities and rates, and take a room type or room out of service. Room status changes to Occupied on check-in and Available on check-out; these operational statuses do not prevent booking the room for other non-overlapping dates.
- Each active nightly lock is keyed by `roomId|date`, so two requests racing for the same room and any overlapping night cannot both reserve it. Selection and lock insertion happen in a MongoDB transaction; the unique room-night key is the final concurrency guard. Hotel check-out releases that reservation's locks immediately while preserving released lock history, allowing the room to be booked again without waiting for midnight.
- Price summary is itemized as trusted nightly rate × nights. Guests may pay the full total or the calculated advance amount; the unpaid balance is stored on the reservation and can be paid later from My Bookings through a separate Razorpay Test Mode checkout.
- The server creates a Razorpay Test Mode order, then atomically reserves one individual available room for every night. Unpaid checkout holds expire after 30 minutes; expired locks are removed during room allocation and do not block later bookings.
- Razorpay Checkout is opened with the server-created order. The API verifies the HMAC signature, fetches the payment from Razorpay, checks order/amount/currency and captured status, then confirms the reservation in a transaction. The booking is not confirmed just because the browser reports success.
- A failed payment attempt does not release the room hold, so the guest can retry another test method in the same checkout. Closing checkout releases the pending hold. A pending verification error can be retried without creating another payment.
- If Razorpay reports a captured test payment but a stale client flow left its reservation cancelled, the reservation owner can reconcile the payment from My Bookings. The server checks captured status, amount, order, and currency with Razorpay before atomically reacquiring the room-night locks and confirming the booking.
- Once the server confirms payment, HotelNexa emails the registered account address a booking summary with the hotel, location, dates, guests, bed count, nightly rate, total, reservation reference, and Test Mode notice. Configure `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`; if delivery fails, the booking remains confirmed and the guest can retry the email from My Bookings.
- Confirmed bookings can be cancelled for a full Razorpay Test Mode refund until the calendar day before check-in (inclusive, India time). On check-in day and after, cancellation is blocked. The API checks a pending refund for up to 20 seconds during the cancel request; if Razorpay still reports processing, a background reconciler continues checking and the room is released when the refund completes. The guest email reflects the actual Razorpay refund status.
- Remaining-balance orders are created from the reservation's stored balance, never a client-supplied amount. The server verifies the order, amount, currency, signature, and captured payment before marking the reservation paid in full. An open balance checkout must be completed or safely closed before cancelling the reservation.
- A hotel administrator may also cancel a confirmed reservation for their own property at any time. Razorpay refunds only the captured amount (including advance payments); the booking balance was not charged. Cancellation actor, timestamp, reason, refund status, and refund reference remain with the reservation and appear in that hotel's cancellation history. Pending refunds are checked automatically by the API, so guests and hotel admins do not need to click a refund-status button.
- Hotel admins can check guests in only during the reservation's stay dates and check out only checked-in guests. These transitions use conditional database updates and are recorded in the hotel activity log. Inventory changes are also audited.
- The hotel overview accepts `page` (default 1), `pageSize` (default 20, max 50), and `search`; guests are scoped to that property. The admin report filters revenue and arrivals by check-in date, departures by check-out date, and occupancy by each stay-night date within the selected range.
- Guest signup collects a phone number and saves it with the verified account; hotel-admin reservation and guest screens display that contact number when available. Older accounts and Google sign-ins without a supplied number show that no phone was provided.
- Directory descriptions, photos, amenities, and ratings remain illustrative; room inventory, admin-configured rates, and date availability are backed by the demo database. This is not a live hotel feed and Razorpay remains in Test Mode.

## AI hotel concierge

The global concierge uses `GEMINI_API_KEY` from the private backend environment to interpret a guest's initial request and to initiate a catalog search. The backend validates all booking criteria itself and checks the actual `Room`, `RoomType`, and `ReservationNight` records for each requested date and capacity. Gemini does not decide availability or booking prices. Directory listings, property amenities, star ratings, and distances remain illustrative.

The concierge supports a guided destination and guest form, stay dates, the requested preference filters, custom requirements, best-match results, and hotel detail links. If the requested hotel's bed type or requested area's inventory is booked for any night of the stay, the result message says so and offers available alternatives elsewhere in the same city, ranked by preferences met and the catalog's illustrative distance-to-centre value. The guest can also choose different stay dates without restarting the search. Dates, bed count, and budget remain strict; if no nearby option meets those booking constraints, it does not suggest one. Booking still requires a signed-in guest and a separate explicit confirmation; it creates a normal Razorpay Test Mode order. A booking is confirmed only after the server verifies the payment signature and captured payment. The concierge never simulates payment success.

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/ai/concierge/interpret` | Public, rate-limited | Extract explicitly stated preferences from a message using Gemini |
| `POST` | `/api/ai/concierge/search` | Public, rate-limited | Find demo catalog matches and check room-night holds |

### API

Authenticated reservation routes require the existing HttpOnly HotelNexa session cookie. Availability quotes are public; starting checkout requires a signed-in guest.

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/reservations/orders` | Signed-in guest | Validate stay, hold room nights and return test checkout order |
| `POST` | `/api/reservations/:reservationId/verify-payment` | Reservation owner | Verify Razorpay signature and confirm captured payment |
| `POST` | `/api/reservations/:reservationId/balance-order` | Reservation owner | Create or resume a test checkout for the remaining balance |
| `POST` | `/api/reservations/:reservationId/verify-balance-payment` | Reservation owner | Verify and record a captured remaining-balance payment |
| `POST` | `/api/reservations/:reservationId/balance-order/release` | Reservation owner | Safely close an unpaid balance checkout |
| `POST` | `/api/reservations/:reservationId/reconcile-payment` | Reservation owner | Check Razorpay for a captured payment and recover its reservation |
| `POST` | `/api/reservations/:reservationId/cancel-booking` | Reservation owner | Free-cancel before the cutoff and refund the captured Test Mode payment |
| `POST` | `/api/reservations/:reservationId/cancel` | Reservation owner | Release a pending checkout |
| `GET` | `/api/reservations/mine` | Signed-in guest | List the caller’s reservation history |
| `GET` | `/api/reservations/availability?hotelId=...&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=2&childAges=&bedCount=2` | Public | Quote an active room type only when a specific room is available for every night |
| `GET` | `/api/reservations/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Staff/admin | Revenue, booked room-nights, arrivals, and departures for the selected range |
| `GET` | `/api/reservations/hotel-admin/overview?page=1&pageSize=20&search=...` | Owning hotel administrator | Paginated, searchable property guests/reservations and cancellation history |
| `GET` | `/api/reservations/hotel-admin/rooms` | Hotel administrator | List room types, rooms, and the latest 50 audited changes for this property |
| `POST` | `/api/reservations/hotel-admin/room-types` | Hotel administrator | Create a room type with capacity, amenities, rates, and advance amount |
| `PATCH` | `/api/reservations/hotel-admin/room-types/:roomTypeId` | Owning hotel administrator | Edit room type; capacity cannot be lowered below active reservation guest counts |
| `POST` | `/api/reservations/hotel-admin/room-types/:roomTypeId/rooms` | Owning hotel administrator | Add an individual room to the property |
| `PATCH` | `/api/reservations/hotel-admin/rooms/:roomId` | Owning hotel administrator | Rename or mark an unbooked room Available/OutOfService |
| `POST` | `/api/reservations/hotel-admin/:reservationId/stay-status` | Owning hotel administrator | Check in/out a guest using guarded lifecycle transitions |
| `POST` | `/api/reservations/hotel-admin/:reservationId/cancel-booking` | Owning hotel administrator | Cancel a property reservation and refund the captured payment through Razorpay Test Mode |

`amount` and `nightlyRate` in reservation records are INR. Razorpay order amounts are sent in paise. `paymentStatus` is `Pending`, `Success`, or `Failed`; booking `status` separately tracks the reservation lifecycle. The staff role is assigned administratively; public signup cannot create staff or admin accounts.

## Hotel administrator accounts

Provision one hotel-scoped account for each property in `Shared/hotelDirectoryPaths.json`:

```powershell
cd Backend
npm run seed:hotel-admins
```

Each account uses the hotel-folder slug as its login email (for example, `hotel_city_star@gmail.com`). When a hotel-folder name is repeated, a deterministic suffix is added to keep the login unique. These addresses are login identifiers only; the seeder does not verify or create Gmail inboxes. During this project demo, all hotel accounts use the shared password `HotelNexa`, stored as a bcrypt hash in MongoDB. This shared password is for the local review/demo environment only; use unique credentials before any public deployment.

Hotel administrators select **Hotel / administrator** at sign-in and can open the hotel dashboard directly. Email OTP is not used for this provisioning flow. The hotel dashboard and API derive the property ID from the authenticated account; hotel admins can see reservation and guest contact details for their own property only. The dashboard reflects HotelNexa's illustrative/test bookings, not a live property management system.

## Reservation controller layout

- `reservationBookingController.js` handles booking checkout, payment verification, and confirmation-email retries.
- `reservationBalanceController.js` handles remaining-balance checkout and payment verification.
- `reservationCancellationController.js` handles cancellations, refunds, and pending-refund reconciliation.
- `reservationQueryController.js` handles guest booking history and staff/admin reports.
- `reservationHelpers.js` contains shared response formatting, email delivery, and payment helpers. `reservationController.js` re-exports these handlers so existing API routes remain unchanged.

