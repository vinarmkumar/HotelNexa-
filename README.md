# HotelNexa

HotelNexa is a MERN hotel-booking application with guest reservations, hotel operations, and a React frontend.

## Local development

1. Copy `Backend/.env.example` to `Backend/.env` and add local service credentials.
2. Start the backend:

   ```powershell
   cd Backend
   npm install
   npm run dev
   ```

3. In a second terminal, start the frontend:

   ```powershell
   cd Frontend/hotelnexa
   npm install
   npm run dev
   ```

The local Vite server proxies API requests to `http://localhost:5000`. See the [frontend guide](Frontend/hotelnexa/README.md) and [backend/API guide](Backend/README.md) for environment variables, database setup, routes, and test commands.

## Current payment and deployment status

The application currently accepts Razorpay Test Mode credentials only. For hosted QA, configure the required backend secrets and frontend build variables documented in the backend and frontend guides. The backend validates these settings at startup and requires `PAYMENT_MODE=test` with a Test Mode Razorpay key; all payments remain simulated. Hotel inventory and property details are demo data, so do not use this configuration for real bookings or payments. Before a live launch, implement live payment handling and secure administrator provisioning, configure production secrets and verified email delivery, and deploy over same-site HTTPS.
