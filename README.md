# Q-Pay Donation Platform

A simple donation platform built with Q-Pay (Open Payments) that allows users to donate to homeless individuals and upload new users to the platform.

## Features

- **Welcome Page**: Landing page with options to make donations or upload users
- **Donation Selection**: Browse homeless individuals (Nomsa, Steve, Kuhle) with their stories and photos
- **Individual Donation Pages**: Each person has their own donation page with personalized information
- **Upload User**: Add new homeless individuals to the platform
- **Q-Pay Integration**: Secure payment processing using Open Payments protocol
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and visit:
   - Welcome page: http://localhost:3001
   - Donation selection: http://localhost:3001/donate
   - Upload user: http://localhost:3001/upload
   - Individual donation pages: 
     - http://localhost:3001/donate-person/nomsa123
     - http://localhost:3001/donate-person/steve456
     - http://localhost:3001/donate-person/kuhle789

## How It Works

1. **Welcome Page** (`/`): Shows two options - "Make a Donation" and "Upload a User"
2. **Donation Selection** (`/donate`): Shows three cards for Nomsa, Steve, and Kuhle with their stories
3. **Click on any person**: Takes you to their individual donation page
4. **Donation page** (`/donate-person/:personId`): Shows the person's details and donation form
5. **Upload page** (`/upload`): Form to add new homeless individuals to the platform
6. **Payment flow**: Uses Q-Pay to process the donation securely
7. **All donations go to**: `$ilp.interledger-test.dev/abo1` (the same receiver wallet)

## File Structure

- `public/index.html` - Welcome page with two main options
- `public/donate-selection.html` - Donation selection page with person cards
- `public/donate-person.html` - Individual donation page
- `public/upload.html` - Upload new user form
- `public/success.html` - Payment success page
- `server.ts` - Express server with routes
- `open-payments.ts` - Q-Pay integration logic

## API Endpoints

- `GET /` - Welcome page
- `GET /donate` - Donation selection page
- `GET /donate-person/:personId` - Individual donation page
- `GET /upload` - Upload user page
- `POST /api/qpay-donation` - Process Q-Pay donation
- `POST /api/complete-payment` - Complete payment after authorization

## Configuration

The donation receiver wallet is set to `$ilp.interledger-test.dev/abo1` in the configuration. All donations from any person go to this same wallet address.

## Page Flow

```
Welcome Page (/)
├── Make a Donation → Donation Selection (/donate)
│   ├── Nomsa → Individual Donation (/donate-person/nomsa123)
│   ├── Steve → Individual Donation (/donate-person/steve456)
│   └── Kuhle → Individual Donation (/donate-person/kuhle789)
└── Upload a User → Upload Form (/upload)
```